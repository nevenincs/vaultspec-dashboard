//! The `/ops/a2a/runs/{run_id}/stream` progress relay (a2a-orchestration-edge ADR
//! D3): a NEW engine SSE channel that re-serves the resident a2a gateway's
//! `run-stream` verb (`GET /v1/runs/{run_id}/stream`) to the frontend, layering
//! the engine's own seq + since-replay + gap contract on top of the upstream
//! frames — the same machinery the multiplexed `/stream` channels use.
//!
//! The division of authority (ADR D3): these frames are NON-AUTHORITATIVE and
//! droppable. Durable document-lifecycle truth rides the authoring events surface;
//! orchestration progress rides this relay. A client recovering truth re-reads
//! `run-status` and the durable events, NEVER a relay frame. So the relay is free
//! to drop, gap, and degrade:
//!
//! - **Resident per-run ring.** One relay per run holds a bounded ring
//!   (`RELAY_RING_CAP`) so a client reconnecting with `since=` replays what the ring
//!   still holds, and a `since` older than the oldest buffered frame is an explicit
//!   `gap` the client re-keyframes from (re-reads `run-status`). A slow live
//!   consumer that lags the broadcast also gets a `gap`, never a silent divergence
//!   — mirroring `routes::stream`.
//! - **Verbatim frames.** Each upstream frame passes through with its event name
//!   and JSON data UNALTERED — the upstream's own oversized-frame `progress_dropped`
//!   sentinel (256 KiB cap, a2a `sse_frames`) is a small frame that flows through
//!   untouched.
//! - **Honest degradation.** When the upstream stream is down (a2a absent, or the
//!   stream connection fails/idles), the relay degrades to BOUNDED `run-status`
//!   polling and emits synthesized `status` frames marked `degraded:true`, so the
//!   client keeps a live-ish signal until it reconnects or the run terminates.
//!
//! Every upstream connection is bounded: an idle-read timeout, a per-frame byte
//! cap, and a total relay wall-clock lifetime (`subprocess-calls-carry-cap-and-
//! timeout` applied to a long-lived socket). The resident registry is bounded at
//! `MAX_CONCURRENT_RELAYS` and prunes finished, unsubscribed runs.

use std::collections::VecDeque;
use std::convert::Infallible;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use axum::extract::{Path, Query};
use axum::response::sse::{Event, KeepAlive, Sse};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;

/// Per-run ring depth for `since=` replay. A run's progress stream is bursty but
/// bounded; 1024 frames covers a generous reconnect window while capping memory
/// (`every-accumulator-is-bounded`).
const RELAY_RING_CAP: usize = 1024;

/// Broadcast channel depth for live subscribers. A consumer that falls this far
/// behind lags and re-keyframes via a `gap` (mirrors the `/stream` ring).
const RELAY_BROADCAST_CAP: usize = 256;

/// Per-upstream-frame byte cap: a safety net ABOVE the upstream's own 256 KiB
/// `MAX_SSE_FRAME_BYTES` sentinel cap. A frame past this (a misbehaving upstream)
/// is replaced by an engine drop sentinel rather than buffered, so the relay never
/// grows a single frame without bound.
const MAX_RELAY_FRAME_BYTES: usize = 512 * 1024;

/// Idle-read timeout on the upstream socket: the a2a stream emits a heartbeat well
/// within this window, so no data for this long means a dead/stalled connection —
/// the relay degrades to `run-status` polling.
const UPSTREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(90);

/// Total wall-clock lifetime of one relay's upstream connection: a bound on a
/// long-lived socket so a wedged stream cannot pin a relay thread forever. A run
/// outliving this reconnects (a fresh relay), reconciling from `run-status`.
const RELAY_MAX_LIFETIME: Duration = Duration::from_secs(6 * 3600);

/// Bounded `run-status` poll cadence for the degraded fallback.
const STATUS_POLL_INTERVAL: Duration = Duration::from_secs(5);

/// The `run-status` read budget for the degraded fallback poll.
const STATUS_POLL_BUDGET: Duration = Duration::from_secs(10);

/// Ceiling on concurrent resident relays (`every-accumulator-is-bounded`): one
/// blocking reader thread each, pruned when finished and unsubscribed.
const MAX_CONCURRENT_RELAYS: usize = 64;

/// A single relayed progress frame: the engine-assigned monotonic `seq`, the
/// upstream SSE event name, and the upstream JSON `data` VERBATIM.
#[derive(Debug, Clone)]
struct RelayFrame {
    seq: u64,
    event: String,
    data: Value,
}

/// The resident relay for one run: a bounded replay ring, a live broadcast, a
/// monotonic seq, and a terminal latch. Fed by one upstream reader thread and
/// read by any number of client SSE connections.
struct RunRelay {
    tx: broadcast::Sender<RelayFrame>,
    ring: Mutex<VecDeque<RelayFrame>>,
    seq: AtomicU64,
    terminal: AtomicBool,
}

impl RunRelay {
    fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(RELAY_BROADCAST_CAP);
        Arc::new(RunRelay {
            tx,
            ring: Mutex::new(VecDeque::new()),
            seq: AtomicU64::new(0),
            terminal: AtomicBool::new(false),
        })
    }

    /// Assign the next seq to `(event, data)`, buffer it in the bounded ring
    /// (evicting the oldest at cap), and broadcast it to live subscribers. Returns
    /// the assigned seq. A `thread_terminal` event latches `terminal`.
    fn push(&self, event: String, data: Value) -> u64 {
        let seq = self.seq.fetch_add(1, Ordering::SeqCst);
        if event == "thread_terminal" {
            self.terminal.store(true, Ordering::SeqCst);
        }
        let frame = RelayFrame { seq, event, data };
        {
            // Poison recovery (robustness H2): recover the inner buffer rather than
            // wedging the relay on a poisoned lock.
            let mut ring = self.ring.lock().unwrap_or_else(|e| e.into_inner());
            if ring.len() == RELAY_RING_CAP {
                ring.pop_front();
            }
            ring.push_back(frame.clone());
        }
        let _ = self.tx.send(frame);
        seq
    }

    /// Snapshot the ring for a `since=` resume: the frames strictly after `since`,
    /// and — when the next needed seq (`since + 1`) has already been evicted — the
    /// oldest still-buffered seq marking the GAP the client must re-keyframe from.
    /// Mirrors `routes::stream::gap_oldest`, saturating on a hostile `since`.
    fn snapshot_since(&self, since: Option<u64>) -> (Vec<RelayFrame>, Option<u64>) {
        let ring = self.ring.lock().unwrap_or_else(|e| e.into_inner());
        let Some(since) = since else {
            return (ring.iter().cloned().collect(), None);
        };
        let oldest = ring.front().map(|f| f.seq);
        if let Some(oldest) = oldest.filter(|&oldest| since.saturating_add(1) < oldest) {
            // The frame the client needs next was evicted: an explicit gap.
            return (Vec::new(), Some(oldest));
        }
        (
            ring.iter().filter(|f| f.seq > since).cloned().collect(),
            None,
        )
    }

    fn is_terminal(&self) -> bool {
        self.terminal.load(Ordering::SeqCst)
    }
}

/// The process-global bounded registry of resident relays, keyed by run id. A
/// `OnceLock` module singleton rather than an `AppState` field so the relay is
/// self-contained in its own module (no shared-file edit); bounded at
/// `MAX_CONCURRENT_RELAYS` and pruned of finished, unsubscribed runs.
fn relays() -> &'static Mutex<std::collections::HashMap<String, Arc<RunRelay>>> {
    static RELAYS: OnceLock<Mutex<std::collections::HashMap<String, Arc<RunRelay>>>> =
        OnceLock::new();
    RELAYS.get_or_init(|| Mutex::new(std::collections::HashMap::new()))
}

/// Get the resident relay for `run_id`, starting its upstream reader thread on
/// first use. Prunes finished relays with no live subscribers before enforcing the
/// concurrency cap; at cap with nothing prunable, returns `None` so the caller
/// serves an honest `relay_capacity` degraded frame rather than growing threads
/// without bound.
fn get_or_start_relay(run_id: &str) -> Option<Arc<RunRelay>> {
    let mut map = relays().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(existing) = map.get(run_id) {
        return Some(existing.clone());
    }
    // Prune terminal relays no client is reading before considering the cap.
    map.retain(|_, relay| !(relay.is_terminal() && relay.tx.receiver_count() == 0));
    if map.len() >= MAX_CONCURRENT_RELAYS {
        return None;
    }
    let relay = RunRelay::new();
    map.insert(run_id.to_string(), relay.clone());
    // The upstream reader runs on a dedicated blocking thread: it parks on a bounded
    // socket read for the life of the run, so it must not sit on a Tokio async
    // worker. The thread owns a clone of the relay and self-exits when the run
    // terminates, the upstream+fallback both end, or no client is subscribed.
    let run_id_owned = run_id.to_string();
    let relay_for_thread = relay.clone();
    std::thread::spawn(move || {
        run_relay_thread(&run_id_owned, &relay_for_thread);
        // On exit, drop the registry entry if it is terminal and unread so the slot
        // frees for a future run (bounded registry).
        let mut map = relays().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(r) = map.get(&run_id_owned)
            && r.is_terminal()
            && r.tx.receiver_count() == 0
        {
            map.remove(&run_id_owned);
        }
    });
    Some(relay)
}

/// The upstream reader thread body: connect to the resident a2a gateway's
/// run-stream, pump verbatim frames into the relay until the run terminates, and
/// on any connection fault degrade to bounded `run-status` polling. Bounded by
/// `RELAY_MAX_LIFETIME` overall and `UPSTREAM_IDLE_TIMEOUT` per read.
fn run_relay_thread(run_id: &str, relay: &RunRelay) {
    let deadline = Instant::now() + RELAY_MAX_LIFETIME;
    let (port, bearer) = match super::a2a::a2a_endpoint() {
        Ok(endpoint) => endpoint,
        Err(reason) => {
            // a2a is known-down: go straight to the degraded status-poll fallback so
            // the client still gets a bounded live-ish signal.
            relay.push(
                "relay_degraded".to_string(),
                json!({ "degraded": true, "reason": reason }),
            );
            degraded_status_poll(run_id, relay, deadline);
            return;
        }
    };

    match stream_upstream(port, bearer.as_deref(), run_id, relay, deadline) {
        // Terminal reached over the live stream: nothing more to do.
        Ok(StreamEnd::Terminal) => {}
        // The stream ended without a terminal (idle/EOF/error) before the run
        // finished: degrade to bounded run-status polling until terminal/deadline.
        Ok(StreamEnd::Interrupted { reason }) | Err(reason) => {
            if !relay.is_terminal() {
                relay.push(
                    "relay_degraded".to_string(),
                    json!({ "degraded": true, "reason": reason }),
                );
                degraded_status_poll(run_id, relay, deadline);
            }
        }
    }
}

/// Why the upstream stream stopped without a terminal frame.
enum StreamEnd {
    Terminal,
    Interrupted { reason: String },
}

/// Connect to the a2a gateway's `GET /v1/runs/{run_id}/stream` and pump verbatim
/// SSE frames into `relay` until the run terminates, the deadline passes, the
/// client disconnects, or the socket faults. A blocking `BufReader` over the
/// loopback socket keeps the chunked-transfer + SSE-frame parsing simple and
/// robust; the socket read timeout bounds idle latency.
fn stream_upstream(
    port: u16,
    bearer: Option<&str>,
    run_id: &str,
    relay: &RunRelay,
    deadline: Instant,
) -> Result<StreamEnd, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port))
        .map_err(|e| format!("a2a run-stream connect failed: {e}"))?;
    stream
        .set_read_timeout(Some(UPSTREAM_IDLE_TIMEOUT))
        .map_err(|e| format!("a2a run-stream set_read_timeout failed: {e}"))?;
    stream
        .set_write_timeout(Some(UPSTREAM_IDLE_TIMEOUT))
        .map_err(|e| format!("a2a run-stream set_write_timeout failed: {e}"))?;
    let auth = bearer
        .map(|t| format!("Authorization: Bearer {t}\r\n"))
        .unwrap_or_default();
    let request = format!(
        "GET /v1/runs/{run_id}/stream HTTP/1.1\r\nHost: 127.0.0.1\r\n\
         Accept: text/event-stream\r\n{auth}\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|e| format!("a2a run-stream request write failed: {e}"))?;
    let mut reader = BufReader::new(stream);
    let head = read_http_head(&mut reader).map_err(|e| format!("a2a run-stream head: {e}"))?;
    if !(200..300).contains(&head.status) {
        return Err(format!("a2a run-stream returned HTTP {}", head.status));
    }
    pump_sse(&mut reader, head.chunked, deadline, |event, data| {
        // Stop early if no client is reading and the run is not producing anything
        // the ring must retain — frees the thread when the viewer navigates away.
        if relay.tx.receiver_count() == 0 && relay.seq.load(Ordering::SeqCst) > 0 {
            return PumpControl::Stop;
        }
        let terminal = event == "thread_terminal";
        relay.push(event, data);
        if terminal {
            PumpControl::Terminal
        } else {
            PumpControl::Continue
        }
    })
}

/// The parsed HTTP response head fields the relay needs.
struct HttpHead {
    status: u16,
    chunked: bool,
}

/// Read the HTTP status line + headers up to the blank line, returning the status
/// code and whether the body is chunked-transfer-encoded. Bounded: the header
/// block is read line-by-line and the reader's own buffering bounds a pathological
/// header flood via the idle read timeout.
fn read_http_head<R: BufRead>(reader: &mut R) -> std::io::Result<HttpHead> {
    let mut status_line = String::new();
    reader.read_line(&mut status_line)?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|c| c.parse::<u16>().ok())
        .ok_or_else(|| std::io::Error::other("malformed HTTP status line"))?;
    let mut chunked = false;
    loop {
        let mut line = String::new();
        let n = reader.read_line(&mut line)?;
        if n == 0 {
            break;
        }
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            break;
        }
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with("transfer-encoding:") && lower.contains("chunked") {
            chunked = true;
        }
    }
    Ok(HttpHead { status, chunked })
}

/// The control the frame sink returns to the pump loop.
enum PumpControl {
    Continue,
    Terminal,
    Stop,
}

/// Read the SSE body, de-chunking when needed, extract complete frames, and invoke
/// `sink` with each `(event, data)`. Returns when the sink reports `Terminal`
/// (the run finished), `Stop` (no reader left), the deadline passes, or the body
/// ends. Each frame is bounded by `MAX_RELAY_FRAME_BYTES`; an oversized frame is
/// replaced by an engine drop sentinel and the run continues.
fn pump_sse<R, F>(
    reader: &mut R,
    chunked: bool,
    deadline: Instant,
    mut sink: F,
) -> Result<StreamEnd, String>
where
    R: BufRead,
    F: FnMut(String, Value) -> PumpControl,
{
    let mut acc = SseAccumulator::new();
    let mut decoder = BodyDecoder::new(chunked);
    loop {
        if Instant::now() >= deadline {
            return Ok(StreamEnd::Interrupted {
                reason: "relay lifetime exceeded".to_string(),
            });
        }
        let chunk = match decoder.next_chunk(reader) {
            Ok(Some(bytes)) => bytes,
            Ok(None) => {
                return Ok(StreamEnd::Interrupted {
                    reason: "a2a run-stream ended".to_string(),
                });
            }
            Err(e) => {
                return Ok(StreamEnd::Interrupted {
                    reason: format!("a2a run-stream read: {e}"),
                });
            }
        };
        for (event, data) in acc.push_bytes(&chunk) {
            match sink(event, data) {
                PumpControl::Continue => {}
                PumpControl::Terminal => return Ok(StreamEnd::Terminal),
                PumpControl::Stop => {
                    return Ok(StreamEnd::Interrupted {
                        reason: "no subscribers".to_string(),
                    });
                }
            }
        }
    }
}

/// Incremental HTTP body reader: yields the next slice of decoded body bytes,
/// de-chunking when the response was chunked-transfer-encoded. `Ok(None)` signals
/// a clean end (the zero chunk, or EOF on a non-chunked body).
struct BodyDecoder {
    chunked: bool,
    done: bool,
}

impl BodyDecoder {
    fn new(chunked: bool) -> Self {
        BodyDecoder {
            chunked,
            done: false,
        }
    }

    fn next_chunk<R: BufRead>(&mut self, reader: &mut R) -> std::io::Result<Option<Vec<u8>>> {
        if self.done {
            return Ok(None);
        }
        if !self.chunked {
            // Non-chunked (Connection: close / EOF-framed): read whatever is
            // available next, up to a bounded slice, so frames surface incrementally.
            let mut buf = [0u8; 8192];
            let n = reader.read(&mut buf)?;
            if n == 0 {
                self.done = true;
                return Ok(None);
            }
            return Ok(Some(buf[..n].to_vec()));
        }
        // Chunked: read the hex size line, then exactly that many bytes + trailing
        // CRLF. A zero-size chunk is the clean end.
        let mut size_line = String::new();
        reader.read_line(&mut size_line)?;
        let size =
            usize::from_str_radix(size_line.trim().split(';').next().unwrap_or("").trim(), 16)
                .map_err(|_| std::io::Error::other("malformed chunk size"))?;
        if size == 0 {
            self.done = true;
            // Consume the trailing CRLF of the terminating chunk, best-effort.
            let mut trailer = String::new();
            let _ = reader.read_line(&mut trailer);
            return Ok(None);
        }
        let mut body = vec![0u8; size];
        reader.read_exact(&mut body)?;
        let mut crlf = [0u8; 2];
        reader.read_exact(&mut crlf)?;
        Ok(Some(body))
    }
}

/// Accumulates decoded body bytes and yields complete SSE frames as
/// `(event, data)` pairs. SSE frames are separated by a blank line; within a
/// frame, `event:` names the event and one or more `data:` lines form the payload
/// (joined by `\n`). A frame accumulating past `MAX_RELAY_FRAME_BYTES` is dropped
/// and replaced by an engine drop sentinel so a single frame never grows unbounded.
struct SseAccumulator {
    buf: String,
}

impl SseAccumulator {
    fn new() -> Self {
        SseAccumulator { buf: String::new() }
    }

    fn push_bytes(&mut self, bytes: &[u8]) -> Vec<(String, Value)> {
        self.buf.push_str(&String::from_utf8_lossy(bytes));
        let mut out = Vec::new();
        // Frames are separated by a blank line; normalize CRLF to LF first so the
        // separator is uniformly "\n\n".
        loop {
            let normalized = self.buf.replace("\r\n", "\n");
            let Some(idx) = normalized.find("\n\n") else {
                self.buf = normalized;
                break;
            };
            let raw_frame = normalized[..idx].to_string();
            self.buf = normalized[idx + 2..].to_string();
            if let Some(frame) = parse_sse_frame(&raw_frame) {
                out.push(frame);
            }
        }
        out
    }
}

/// Parse one raw SSE frame (its lines, no trailing blank line) into
/// `(event, data)`. Lines beginning `:` are comments (ignored); `event:` sets the
/// event name; `data:` lines are concatenated with `\n`. A frame with no data is
/// skipped. The `data` is parsed as JSON when it parses, else carried as a string
/// — either way VERBATIM, so the upstream `progress_dropped` sentinel passes
/// through unaltered. An oversized frame becomes an engine drop sentinel.
fn parse_sse_frame(raw: &str) -> Option<(String, Value)> {
    if raw.len() > MAX_RELAY_FRAME_BYTES {
        return Some((
            "progress_dropped".to_string(),
            json!({
                "api_version": "v1",
                "type": "progress_dropped",
                "reason": "relay_frame_exceeds_cap",
            }),
        ));
    }
    let mut event: Option<String> = None;
    let mut data_lines: Vec<&str> = Vec::new();
    for line in raw.split('\n') {
        if line.is_empty() || line.starts_with(':') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("event:") {
            event = Some(rest.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("data:") {
            // A single leading space after the colon is stripped per the SSE grammar.
            data_lines.push(rest.strip_prefix(' ').unwrap_or(rest));
        }
    }
    if data_lines.is_empty() {
        return None;
    }
    let data_str = data_lines.join("\n");
    let data = serde_json::from_str::<Value>(&data_str).unwrap_or(Value::String(data_str));
    // Fall back to the payload's own `type`/`event_type` when no `event:` line is
    // present, so the client always has an event name to switch on.
    let event = event
        .or_else(|| data.get("type").and_then(Value::as_str).map(str::to_string))
        .or_else(|| {
            data.get("event_type")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "message".to_string());
    Some((event, data))
}

/// The bounded degraded fallback: poll `run-status` on a fixed cadence and emit a
/// synthesized `status` frame (marked `degraded:true`) each poll until the run
/// reaches a terminal status, the deadline passes, or no client is reading. Frames
/// stay non-authoritative — the client reconciles truth from `run-status` itself.
fn degraded_status_poll(run_id: &str, relay: &RunRelay, deadline: Instant) {
    use rag_client::client::{LoopbackTransport, RagTransport};
    loop {
        if Instant::now() >= deadline || relay.is_terminal() {
            return;
        }
        if relay.tx.receiver_count() == 0 && relay.seq.load(Ordering::SeqCst) > 0 {
            return;
        }
        let Ok((port, bearer)) = super::a2a::a2a_endpoint() else {
            std::thread::sleep(STATUS_POLL_INTERVAL);
            continue;
        };
        let transport = LoopbackTransport {
            port,
            bearer,
            timeout: STATUS_POLL_BUDGET,
        };
        match transport.get(&format!("/v1/runs/{run_id}")) {
            Ok(raw) => {
                let status_body = serde_json::from_str::<Value>(&raw).unwrap_or(Value::String(raw));
                let is_terminal = status_body
                    .get("status")
                    .and_then(Value::as_str)
                    .map(status_is_terminal)
                    .unwrap_or(false);
                relay.push(
                    "status".to_string(),
                    json!({ "degraded": true, "status_snapshot": status_body }),
                );
                if is_terminal {
                    relay.push(
                        "thread_terminal".to_string(),
                        json!({ "degraded": true, "reason": "run reached a terminal status" }),
                    );
                    return;
                }
            }
            Err(_) => {
                // A transient poll failure is not fatal — keep polling within bounds.
            }
        }
        std::thread::sleep(STATUS_POLL_INTERVAL);
    }
}

/// Whether an a2a run status string is terminal (the run has stopped producing
/// progress). Mirrors the a2a `TERMINAL_STATUSES` vocabulary conservatively; an
/// unknown status is treated as non-terminal so the poll keeps a live signal.
fn status_is_terminal(status: &str) -> bool {
    matches!(
        status,
        "completed" | "failed" | "cancelled" | "canceled" | "error" | "terminated"
    )
}

/// Query params for the run-stream relay: `since=` resumes from the ring.
#[derive(Deserialize)]
pub struct RunStreamParams {
    #[serde(default)]
    pub since: Option<u64>,
}

/// The one boxed SSE event stream type every handler branch returns, so the
/// invalid-id / capacity / normal paths unify to a single `Sse<_>` type.
type EventStream = Pin<Box<dyn futures_core::Stream<Item = Result<Event, Infallible>> + Send>>;

/// Validate a path-safe run id for the stream URL (same grammar as the ops
/// pass-through): non-empty, no leading `-`, `[A-Za-z0-9_-]`, bounded length.
fn run_id_is_valid(run_id: &str) -> bool {
    !run_id.is_empty()
        && run_id.len() <= 128
        && !run_id.starts_with('-')
        && run_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Render a `RelayFrame` as an SSE `Event`: the verbatim event name, the engine
/// seq as the id (so a reconnect can `since=` it), and the verbatim JSON data.
fn frame_event(frame: &RelayFrame) -> Event {
    Event::default()
        .event(frame.event.clone())
        .id(frame.seq.to_string())
        .data(frame.data.to_string())
}

/// Map one live broadcast item to an SSE event, turning a broadcast lag into a
/// `gap` so a slow client re-keyframes instead of silently diverging (mirrors
/// `routes::stream::map_live_item`). A frame at or below the replayed threshold is
/// dropped as a duplicate.
fn map_live_frame(
    item: Result<RelayFrame, BroadcastStreamRecvError>,
    dedup_threshold: Option<u64>,
) -> Option<Result<Event, Infallible>> {
    match item {
        Ok(frame) => {
            if let Some(threshold) = dedup_threshold
                && frame.seq <= threshold
            {
                return None;
            }
            Some(Ok(frame_event(&frame)))
        }
        Err(BroadcastStreamRecvError::Lagged(n)) => Some(Ok(Event::default()
            .event("gap")
            .data(json!({ "lagged": n, "reason": "broadcast lag" }).to_string()))),
    }
}

/// `GET /ops/a2a/runs/{run_id}/stream?since=` — the run progress relay (ADR D3).
/// Subscribes to the resident per-run relay (starting its upstream reader on first
/// use), replays the ring from `since=` (emitting a `gap` when the resume point was
/// evicted), then streams live frames with lag→gap. An invalid run id or a relay at
/// capacity yields a single honest frame and closes; frames are non-authoritative,
/// so a degraded/closed stream is never an error surface — the client reconciles
/// from `run-status`.
pub async fn a2a_run_stream(
    Path(run_id): Path<String>,
    Query(params): Query<RunStreamParams>,
) -> Sse<impl futures_core::Stream<Item = Result<Event, Infallible>>> {
    if !run_id_is_valid(&run_id) {
        return Sse::new(one_shot_close(
            "error",
            json!({ "error": "invalid run_id", "reason": "must be a path-safe token" }),
        ))
        .keep_alive(KeepAlive::default());
    }
    let Some(relay) = get_or_start_relay(&run_id) else {
        return Sse::new(one_shot_close(
            "relay_degraded",
            json!({ "degraded": true, "reason": "relay capacity reached; poll run-status" }),
        ))
        .keep_alive(KeepAlive::default());
    };

    // Subscribe FIRST, snapshot the ring SECOND (audit N1, mirrors routes::stream):
    // a frame landing between the two is then present in the live receiver's queue
    // rather than lost; the dedup threshold removes the snapshot/queue overlap.
    let receiver = relay.tx.subscribe();
    let (frames, gap) = relay.snapshot_since(params.since);

    let mut backlog: Vec<Result<Event, Infallible>> = Vec::new();
    let mut emitted_up_to = params.since.unwrap_or(0);
    if let Some(oldest) = gap {
        backlog.push(Ok(Event::default().event("gap").data(
            json!({ "requested": params.since, "oldest_buffered": oldest }).to_string(),
        )));
    }
    for frame in &frames {
        emitted_up_to = emitted_up_to.max(frame.seq);
        backlog.push(Ok(frame_event(frame)));
    }
    let dedup_threshold = params.since.map(|_| emitted_up_to);

    let live = BroadcastStream::new(receiver)
        .filter_map(move |item| map_live_frame(item, dedup_threshold));
    let combined = tokio_stream::iter(backlog).chain(live);
    Sse::new(Box::pin(combined) as EventStream).keep_alive(KeepAlive::default())
}

/// A one-frame SSE stream that emits a single event and closes — the honest,
/// non-error way to report an invalid id or a capacity refusal on a stream surface.
fn one_shot_close(event: &'static str, data: Value) -> EventStream {
    Box::pin(tokio_stream::iter(vec![Ok(Event::default()
        .event(event)
        .data(data.to_string()))]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn ring_assigns_monotonic_seq_and_evicts_at_cap() {
        let relay = RunRelay::new();
        for i in 0..(RELAY_RING_CAP + 10) {
            let seq = relay.push("progress".to_string(), json!({ "i": i }));
            assert_eq!(seq, i as u64);
        }
        let ring = relay.ring.lock().unwrap();
        assert_eq!(ring.len(), RELAY_RING_CAP, "ring is bounded at the cap");
        // The oldest 10 frames were evicted; the front is seq 10.
        assert_eq!(ring.front().unwrap().seq, 10);
        assert_eq!(ring.back().unwrap().seq, (RELAY_RING_CAP + 9) as u64);
    }

    #[test]
    fn snapshot_since_replays_after_and_gaps_on_eviction() {
        let relay = RunRelay::new();
        for i in 0..5 {
            relay.push("progress".to_string(), json!({ "i": i }));
        }
        // Resume after seq 2 → frames 3 and 4, no gap.
        let (frames, gap) = relay.snapshot_since(Some(2));
        assert!(gap.is_none());
        assert_eq!(frames.iter().map(|f| f.seq).collect::<Vec<_>>(), vec![3, 4]);

        // No since → the whole ring, no gap.
        let (frames, gap) = relay.snapshot_since(None);
        assert!(gap.is_none());
        assert_eq!(frames.len(), 5);

        // A hostile since at u64::MAX saturates → no gap, no frames.
        let (frames, gap) = relay.snapshot_since(Some(u64::MAX));
        assert!(gap.is_none());
        assert!(frames.is_empty());
    }

    #[test]
    fn snapshot_since_emits_a_gap_when_the_resume_point_was_evicted() {
        let relay = RunRelay::new();
        // Overflow the ring so early seqs are evicted.
        for i in 0..(RELAY_RING_CAP + 50) {
            relay.push("progress".to_string(), json!({ "i": i }));
        }
        // Resume from seq 3, long evicted: an explicit gap at the oldest buffered seq.
        let (frames, gap) = relay.snapshot_since(Some(3));
        assert!(frames.is_empty());
        assert_eq!(gap, Some(50), "gap reports the oldest still-buffered seq");
    }

    #[test]
    fn lagged_live_item_becomes_a_gap_not_a_silent_drop() {
        let mapped = map_live_frame(Err(BroadcastStreamRecvError::Lagged(9)), None)
            .expect("lag must yield an item")
            .expect("infallible");
        let rendered = format!("{mapped:?}");
        assert!(rendered.contains("gap"), "lag → gap event: {rendered}");
        assert!(rendered.contains('9'), "the gap reports the dropped count");
    }

    #[test]
    fn dedup_threshold_drops_already_replayed_frames() {
        // A live frame at/below the replayed threshold is a duplicate, dropped.
        let dup = RelayFrame {
            seq: 2,
            event: "progress".to_string(),
            data: json!({}),
        };
        assert!(map_live_frame(Ok(dup), Some(2)).is_none());
        // A frame past the threshold passes through.
        let fresh = RelayFrame {
            seq: 3,
            event: "progress".to_string(),
            data: json!({}),
        };
        assert!(map_live_frame(Ok(fresh), Some(2)).is_some());
    }

    #[test]
    fn sse_accumulator_extracts_frames_across_chunk_boundaries() {
        let mut acc = SseAccumulator::new();
        // A frame split across two byte pushes surfaces only once complete.
        assert!(
            acc.push_bytes(b"event: progress\ndata: {\"phase\":")
                .is_empty()
        );
        let out = acc.push_bytes(b"\"research\"}\n\n");
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].0, "progress");
        assert_eq!(out[0].1["phase"], "research");
    }

    #[test]
    fn sse_accumulator_handles_crlf_and_multiple_frames() {
        let mut acc = SseAccumulator::new();
        let out = acc
            .push_bytes(b"event: a\r\ndata: {\"n\":1}\r\n\r\nevent: b\r\ndata: {\"n\":2}\r\n\r\n");
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].0, "a");
        assert_eq!(out[0].1["n"], 1);
        assert_eq!(out[1].0, "b");
        assert_eq!(out[1].1["n"], 2);
    }

    #[test]
    fn upstream_progress_dropped_sentinel_passes_through_unaltered() {
        // The upstream's oversized-frame sentinel is a small frame; it must relay
        // VERBATIM (event name + JSON), never re-wrapped or dropped.
        let mut acc = SseAccumulator::new();
        let sentinel = r#"{"api_version":"v1","type":"progress_dropped","reason":"frame_exceeds_cap","dropped_type":"agent_message"}"#;
        let out =
            acc.push_bytes(format!("event: progress_dropped\ndata: {sentinel}\n\n").as_bytes());
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].0, "progress_dropped");
        assert_eq!(out[0].1["type"], "progress_dropped");
        assert_eq!(out[0].1["reason"], "frame_exceeds_cap");
        assert_eq!(out[0].1["dropped_type"], "agent_message");
    }

    #[test]
    fn frame_without_event_line_falls_back_to_payload_type() {
        let mut acc = SseAccumulator::new();
        let out = acc.push_bytes(b"data: {\"type\":\"heartbeat\",\"uptime\":3}\n\n");
        assert_eq!(out.len(), 1);
        assert_eq!(
            out[0].0, "heartbeat",
            "event name falls back to payload type"
        );
    }

    #[test]
    fn an_oversized_frame_becomes_an_engine_drop_sentinel() {
        let huge = "x".repeat(MAX_RELAY_FRAME_BYTES + 1);
        let raw = format!("event: progress\ndata: {huge}");
        let (event, data) = parse_sse_frame(&raw).expect("oversized frame yields a sentinel");
        assert_eq!(event, "progress_dropped");
        assert_eq!(data["reason"], "relay_frame_exceeds_cap");
    }

    #[test]
    fn read_http_head_parses_status_and_chunked() {
        let raw = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\
                   Transfer-Encoding: chunked\r\n\r\nbody-follows";
        let mut reader = Cursor::new(raw.as_bytes());
        let head = read_http_head(&mut reader).unwrap();
        assert_eq!(head.status, 200);
        assert!(head.chunked);

        let raw = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
        let mut reader = Cursor::new(raw.as_bytes());
        let head = read_http_head(&mut reader).unwrap();
        assert_eq!(head.status, 404);
        assert!(!head.chunked);
    }

    #[test]
    fn chunked_body_decoder_dechunks_and_ends_on_zero_chunk() {
        // Two well-formed chunks (each `<hex-size>\r\n<bytes>\r\n`) then the
        // terminating zero chunk. The decoder concatenates the chunk bodies and
        // stops at the zero chunk.
        let c1 = "event: a\n";
        let c2 = "data: 1\n\n";
        let raw = format!(
            "{:x}\r\n{c1}\r\n{:x}\r\n{c2}\r\n0\r\n\r\n",
            c1.len(),
            c2.len()
        );
        let mut reader = Cursor::new(raw.into_bytes());
        let mut decoder = BodyDecoder::new(true);
        let mut decoded = Vec::new();
        while let Some(chunk) = decoder.next_chunk(&mut reader).unwrap() {
            decoded.extend_from_slice(&chunk);
        }
        assert_eq!(String::from_utf8(decoded).unwrap(), "event: a\ndata: 1\n\n");
    }

    #[test]
    fn pump_sse_over_a_chunked_body_yields_frames_and_stops_on_terminal() {
        // A full chunked HTTP body: two progress frames then a terminal frame.
        let body = "event: progress\ndata: {\"phase\":\"research\"}\n\n\
                    event: progress\ndata: {\"phase\":\"adr\"}\n\n\
                    event: thread_terminal\ndata: {\"status\":\"completed\"}\n\n";
        // One chunk carrying the whole body, then the zero terminator.
        let chunked = format!("{:x}\r\n{}\r\n0\r\n\r\n", body.len(), body);
        let mut reader = Cursor::new(chunked.into_bytes());
        let mut seen: Vec<(String, Value)> = Vec::new();
        let end = pump_sse(
            &mut reader,
            true,
            Instant::now() + Duration::from_secs(5),
            |event, data| {
                let terminal = event == "thread_terminal";
                seen.push((event, data));
                if terminal {
                    PumpControl::Terminal
                } else {
                    PumpControl::Continue
                }
            },
        )
        .unwrap();
        assert!(matches!(end, StreamEnd::Terminal));
        assert_eq!(seen.len(), 3);
        assert_eq!(seen[0].0, "progress");
        assert_eq!(seen[2].0, "thread_terminal");
        assert_eq!(seen[2].1["status"], "completed");
    }

    #[test]
    fn status_terminality_matches_the_a2a_vocabulary() {
        for t in [
            "completed",
            "failed",
            "cancelled",
            "canceled",
            "error",
            "terminated",
        ] {
            assert!(status_is_terminal(t), "`{t}` is terminal");
        }
        for nt in ["running", "starting", "paused", "queued", "unknown"] {
            assert!(!status_is_terminal(nt), "`{nt}` is not terminal");
        }
    }

    #[test]
    fn run_id_validation_matches_the_pass_through_grammar() {
        assert!(run_id_is_valid("run_abc-123"));
        for bad in ["", "-x", "../escape", "run/x", "run id", &"a".repeat(129)] {
            assert!(!run_id_is_valid(bad), "`{bad}` must be rejected");
        }
    }

    #[test]
    fn live_socket_relay_streams_chunked_sse_into_the_ring_with_replay_and_sentinel() {
        // A real TcpListener stands in for the a2a gateway's run-stream: a real
        // chunked `text/event-stream` response over a real socket, read by the real
        // BufReader pump into a real RunRelay. This is a LIVE loopback of the
        // streaming path end to end (the rag-client socket-test precedent); it does
        // NOT stand up the Python gateway (that cross-process live proof is the a2a
        // repo's own harness + the frontend e2e — see the report). It proves: the
        // chunked SSE decode, verbatim frame relay INCLUDING the upstream
        // `progress_dropped` sentinel unaltered, the terminal latch, and since-replay
        // off the resulting ring.
        use std::io::{Read, Write};
        use std::net::{TcpListener, TcpStream};

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            // Drain the request head.
            let mut buf = [0u8; 1024];
            let _ = sock.read(&mut buf);
            // A chunked SSE body: a progress frame, the upstream oversized-frame
            // sentinel (must pass through VERBATIM), then the terminal frame.
            let body = "event: progress\ndata: {\"phase\":\"research\"}\n\n\
                        event: progress_dropped\ndata: {\"api_version\":\"v1\",\"type\":\"progress_dropped\",\"reason\":\"frame_exceeds_cap\",\"dropped_type\":\"agent_message\"}\n\n\
                        event: thread_terminal\ndata: {\"status\":\"completed\"}\n\n";
            let framed = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n",
                body.len(),
                body
            );
            sock.write_all(framed.as_bytes()).unwrap();
        });

        let relay = RunRelay::new();
        let stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let mut reader = BufReader::new(stream);
        // Write the GET so the server's read completes, then read the response.
        reader
            .get_ref()
            .try_clone()
            .unwrap()
            .write_all(b"GET /v1/runs/run-1/stream HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .unwrap();
        let head = read_http_head(&mut reader).unwrap();
        assert_eq!(head.status, 200);
        assert!(head.chunked);
        let end = pump_sse(
            &mut reader,
            head.chunked,
            Instant::now() + Duration::from_secs(5),
            |event, data| {
                let terminal = event == "thread_terminal";
                relay.push(event, data);
                if terminal {
                    PumpControl::Terminal
                } else {
                    PumpControl::Continue
                }
            },
        )
        .unwrap();
        assert!(matches!(end, StreamEnd::Terminal));
        assert!(relay.is_terminal(), "the terminal frame latched the relay");

        // Three frames in the ring at seq 0,1,2.
        {
            let ring = relay.ring.lock().unwrap();
            assert_eq!(ring.len(), 3);
            assert_eq!(ring[0].event, "progress");
            // The upstream sentinel relayed VERBATIM — event name + JSON untouched.
            assert_eq!(ring[1].event, "progress_dropped");
            assert_eq!(ring[1].data["type"], "progress_dropped");
            assert_eq!(ring[1].data["dropped_type"], "agent_message");
            assert_eq!(ring[2].event, "thread_terminal");
        }

        // since-replay off the resulting ring: resume after seq 0 → frames 1,2.
        let (frames, gap) = relay.snapshot_since(Some(0));
        assert!(gap.is_none());
        assert_eq!(frames.iter().map(|f| f.seq).collect::<Vec<_>>(), vec![1, 2]);

        server.join().unwrap();
    }
}
