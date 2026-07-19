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
//!   stream connection fails/idles), the relay emits one bounded `relay_degraded`
//!   signal and retires. The browser alone polls authoritative `run-status`.
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
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
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

/// Maximum status/header line and aggregate response-head sizes. These are
/// allocation ceilings: the bounded line reader rejects the peer before growing
/// its buffer past them.
const MAX_HTTP_STATUS_LINE_BYTES: usize = 1024;
const MAX_HTTP_HEADER_LINE_BYTES: usize = 8 * 1024;
const MAX_HTTP_HEAD_BYTES: usize = 32 * 1024;

/// A chunk declaration is validated before allocating its body. The sibling emits
/// at most one already-bounded SSE frame per chunk, so the relay frame ceiling is
/// also the largest useful transport chunk.
const MAX_HTTP_CHUNK_BYTES: usize = MAX_RELAY_FRAME_BYTES;
const MAX_HTTP_CHUNK_LINE_BYTES: usize = 128;

/// A single transport read may contain thousands of tiny valid SSE frames. Keep
/// the decoded output vector bounded too: the final slot is reserved for one drop
/// sentinel describing all additional completed frames from that push.
const MAX_SSE_OUTPUTS_PER_PUSH: usize = 256;

/// Replay storage is byte-weighted as well as count-weighted. Four MiB preserves
/// a generous tail of normal progress frames while preventing one run from
/// monopolising the process. The retained ceiling allows one replay snapshot to
/// drain while a fresh four-MiB tail arrives. Across all relays, immutable shared
/// frames may retain no more than 64 MiB of accounted event/payload bytes.
const RELAY_REPLAY_BYTE_BUDGET: usize = 4 * 1024 * 1024;
const PER_RELAY_RETAINED_BYTE_BUDGET: usize = 8 * 1024 * 1024;
const GLOBAL_RELAY_RETAINED_BYTE_BUDGET: usize = 64 * 1024 * 1024;
const RELAY_CONTROL_RESERVE_BYTES: usize = 256 * 1024;
const GLOBAL_CONTROL_RESERVE_BYTES: usize = 8 * 1024 * 1024;

/// Idle-read timeout on the upstream socket: the a2a stream emits a heartbeat well
/// within this window, so no data for this long means a dead/stalled connection —
/// the relay emits degradation and lets the browser retry/reconcile.
const UPSTREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(90);

/// Total wall-clock lifetime of one relay's upstream connection: a bound on a
/// long-lived socket so a wedged stream cannot pin a relay thread forever. A run
/// outliving this reconnects (a fresh relay), reconciling from `run-status`.
const RELAY_MAX_LIFETIME: Duration = Duration::from_secs(6 * 3600);

/// Ceiling on concurrent resident relays (`every-accumulator-is-bounded`): one
/// blocking reader thread each, pruned when finished and unsubscribed.
const MAX_CONCURRENT_RELAYS: usize = 64;

/// A single relayed progress frame: the engine-assigned monotonic `seq`, the
/// upstream SSE event name, and the upstream JSON `data` VERBATIM.
#[derive(Debug)]
struct RelayFrame {
    seq: u64,
    event: Arc<str>,
    data: Arc<str>,
    accounted_bytes: usize,
    _charge: FrameCharge,
}

type SharedRelayFrame = Arc<RelayFrame>;

/// Releases byte reservations only when the last ring/broadcast/replay reference
/// to an immutable frame disappears.
#[derive(Debug)]
struct FrameCharge {
    bytes: usize,
    relay_bytes: Arc<AtomicUsize>,
    global_bytes: Arc<AtomicUsize>,
}

impl Drop for FrameCharge {
    fn drop(&mut self) {
        self.relay_bytes.fetch_sub(self.bytes, Ordering::SeqCst);
        self.global_bytes.fetch_sub(self.bytes, Ordering::SeqCst);
    }
}

#[derive(Default)]
struct RelayRing {
    frames: VecDeque<SharedRelayFrame>,
    bytes: usize,
    /// Latest sequence that could not be retained or broadcast under the hard
    /// byte ceilings. Sticky for the relay lifetime so a client resuming beyond
    /// an older hole still observes any newer discontinuity.
    latest_missing_seq: Option<u64>,
}

/// The resident relay for one run: a bounded replay ring, a live broadcast, a
/// monotonic seq, and a terminal latch. Fed by one upstream reader thread and
/// read by any number of client SSE connections.
struct RunRelay {
    tx: broadcast::Sender<SharedRelayFrame>,
    ring: Mutex<RelayRing>,
    seq: AtomicU64,
    terminal: AtomicBool,
    producer_running: AtomicBool,
    retained_bytes: Arc<AtomicUsize>,
    global_retained_bytes: Arc<AtomicUsize>,
    replay_byte_budget: usize,
    retained_byte_budget: usize,
    global_byte_budget: usize,
}

impl RunRelay {
    #[cfg(test)]
    fn new() -> Arc<Self> {
        Self::new_with_budgets(
            Arc::new(AtomicUsize::new(0)),
            RELAY_REPLAY_BYTE_BUDGET,
            PER_RELAY_RETAINED_BYTE_BUDGET,
            GLOBAL_RELAY_RETAINED_BYTE_BUDGET,
        )
    }

    fn new_with_budgets(
        global_retained_bytes: Arc<AtomicUsize>,
        replay_byte_budget: usize,
        retained_byte_budget: usize,
        global_byte_budget: usize,
    ) -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(RELAY_BROADCAST_CAP);
        Arc::new(RunRelay {
            tx,
            ring: Mutex::new(RelayRing::default()),
            seq: AtomicU64::new(0),
            terminal: AtomicBool::new(false),
            producer_running: AtomicBool::new(false),
            retained_bytes: Arc::new(AtomicUsize::new(0)),
            global_retained_bytes,
            replay_byte_budget,
            retained_byte_budget,
            global_byte_budget,
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
        let (mut event, mut data) = serialize_relay_data(seq, event, data);
        let mut accounted_bytes = relay_frame_bytes(&event, &data);
        if accounted_bytes > MAX_RELAY_FRAME_BYTES {
            (event, data) = drop_sentinel_data(seq, "relay_frame_exceeds_cap");
            accounted_bytes = relay_frame_bytes(&event, &data);
        }

        let mut ring = self.ring.lock().unwrap_or_else(|e| e.into_inner());
        while ring.frames.len() >= RELAY_RING_CAP
            || ring.bytes.saturating_add(accounted_bytes) > self.replay_byte_budget
        {
            let Some(evicted) = ring.frames.pop_front() else {
                break;
            };
            ring.bytes = ring.bytes.saturating_sub(evicted.accounted_bytes);
            drop(evicted);
        }

        // Normal payloads cannot consume the small control reserve. If pressure
        // rejects one, the `progress_dropped` sentinel below can still be retained
        // and broadcast, so byte pressure is observable rather than a silent hole.
        let relay_control_reserve = RELAY_CONTROL_RESERVE_BYTES.min(self.retained_byte_budget / 8);
        let global_control_reserve = GLOBAL_CONTROL_RESERVE_BYTES.min(self.global_byte_budget / 8);
        let mut reservation = reserve_frame_bytes(
            &self.retained_bytes,
            self.retained_byte_budget
                .saturating_sub(relay_control_reserve),
            &self.global_retained_bytes,
            self.global_byte_budget
                .saturating_sub(global_control_reserve),
            accounted_bytes,
        );
        if reservation.is_none() {
            (event, data) = drop_sentinel_data(seq, "relay_byte_budget_exhausted");
            accounted_bytes = relay_frame_bytes(&event, &data);
            reservation = reserve_frame_bytes(
                &self.retained_bytes,
                self.retained_byte_budget,
                &self.global_retained_bytes,
                self.global_byte_budget,
                accounted_bytes,
            );
        }
        let Some(charge) = reservation else {
            // Record the skipped sequence while holding the same ring lock used
            // by snapshots. A reconnect can therefore never observe a later
            // retained frame without an explicit gap. Do not exceed either byte
            // ceiling merely to allocate a control payload under pressure.
            ring.latest_missing_seq = Some(seq);
            return seq;
        };

        let frame = Arc::new(RelayFrame {
            seq,
            event: Arc::from(event),
            data: Arc::from(data),
            accounted_bytes,
            _charge: charge,
        });
        ring.bytes += accounted_bytes;
        ring.frames.push_back(frame.clone());
        drop(ring);
        let _ = self.tx.send(frame);
        seq
    }

    /// Snapshot the ring for a `since=` resume: the frames strictly after `since`,
    /// and — when the next needed seq (`since + 1`) has already been evicted — the
    /// oldest still-buffered seq marking the GAP the client must re-keyframe from.
    /// Mirrors `routes::stream::gap_oldest`, saturating on a hostile `since`.
    fn snapshot_since(&self, since: Option<u64>) -> (Vec<SharedRelayFrame>, Option<u64>) {
        let ring = self.ring.lock().unwrap_or_else(|e| e.into_inner());
        let Some(since) = since else {
            return (
                ring.frames.iter().cloned().collect(),
                ring.latest_missing_seq,
            );
        };
        let oldest = ring.frames.front().map(|f| f.seq);
        if let Some(oldest) = oldest.filter(|&oldest| since.saturating_add(1) < oldest) {
            // The frame the client needs next was evicted: an explicit gap.
            return (Vec::new(), Some(oldest));
        }
        let frames: Vec<_> = ring
            .frames
            .iter()
            .filter(|f| f.seq > since)
            .cloned()
            .collect();
        if let Some(missing) = ring.latest_missing_seq.filter(|missing| *missing > since) {
            return (Vec::new(), Some(missing));
        }
        // Validate the actual snapshot as a final invariant check. This also
        // protects recovery if a future producer path introduces a hole without
        // updating `latest_missing_seq`.
        let mut expected = since.saturating_add(1);
        for frame in &frames {
            if frame.seq != expected {
                return (Vec::new(), Some(frame.seq));
            }
            expected = expected.saturating_add(1);
        }
        (frames, None)
    }

    fn is_terminal(&self) -> bool {
        self.terminal.load(Ordering::SeqCst)
    }

    fn is_producer_running(&self) -> bool {
        self.producer_running.load(Ordering::SeqCst)
    }

    fn claim_producer(&self) -> bool {
        !self.is_terminal()
            && self
                .producer_running
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
    }
}

fn relay_frame_bytes(event: &str, data: &str) -> usize {
    event.len().saturating_add(data.len())
}

fn serialize_relay_data(seq: u64, event: String, data: Value) -> (String, String) {
    let annotated = match data {
        Value::Object(mut map) => {
            map.insert("seq".to_string(), json!(seq));
            Value::Object(map)
        }
        other => json!({ "seq": seq, "value": other }),
    };
    (event, annotated.to_string())
}

fn drop_sentinel_data(seq: u64, reason: &'static str) -> (String, String) {
    serialize_relay_data(
        seq,
        "progress_dropped".to_string(),
        json!({
            "api_version": "v1",
            "type": "progress_dropped",
            "reason": reason,
        }),
    )
}

fn try_reserve(counter: &AtomicUsize, limit: usize, bytes: usize) -> bool {
    let mut current = counter.load(Ordering::SeqCst);
    loop {
        let Some(next) = current.checked_add(bytes) else {
            return false;
        };
        if next > limit {
            return false;
        }
        match counter.compare_exchange(current, next, Ordering::SeqCst, Ordering::SeqCst) {
            Ok(_) => return true,
            Err(observed) => current = observed,
        }
    }
}

fn reserve_frame_bytes(
    relay_bytes: &Arc<AtomicUsize>,
    relay_limit: usize,
    global_bytes: &Arc<AtomicUsize>,
    global_limit: usize,
    bytes: usize,
) -> Option<FrameCharge> {
    if !try_reserve(relay_bytes, relay_limit, bytes) {
        return None;
    }
    if !try_reserve(global_bytes, global_limit, bytes) {
        relay_bytes.fetch_sub(bytes, Ordering::SeqCst);
        return None;
    }
    Some(FrameCharge {
        bytes,
        relay_bytes: relay_bytes.clone(),
        global_bytes: global_bytes.clone(),
    })
}

/// The process-global bounded registry of resident relays, keyed by run id. A
/// `OnceLock` module singleton rather than an `AppState` field so the relay is
/// self-contained in its own module (no shared-file edit); bounded at
/// `MAX_CONCURRENT_RELAYS` and pruned of finished, unsubscribed runs.
struct RelayRegistry {
    entries: std::collections::HashMap<String, Arc<RunRelay>>,
    retained_bytes: Arc<AtomicUsize>,
}

impl RelayRegistry {
    fn new() -> Self {
        Self {
            entries: std::collections::HashMap::new(),
            retained_bytes: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Remove every producerless, unsubscribed relay except the run currently
    /// being reopened. Keeping that target lets a terminal reconnect replay its
    /// bounded tail; a non-terminal target is restarted below.
    fn prune_inactive(&mut self, reopening_run_id: &str) {
        self.entries.retain(|run_id, relay| {
            run_id == reopening_run_id
                || relay.tx.receiver_count() > 0
                || relay.is_producer_running()
        });
    }

    fn get_or_insert(&mut self, run_id: &str) -> Option<Arc<RunRelay>> {
        self.prune_inactive(run_id);
        if let Some(existing) = self.entries.get(run_id) {
            return Some(existing.clone());
        }
        if self.entries.len() >= MAX_CONCURRENT_RELAYS
            || self.retained_bytes.load(Ordering::SeqCst) >= GLOBAL_RELAY_RETAINED_BYTE_BUDGET
        {
            return None;
        }
        let relay = RunRelay::new_with_budgets(
            self.retained_bytes.clone(),
            RELAY_REPLAY_BYTE_BUDGET,
            PER_RELAY_RETAINED_BYTE_BUDGET,
            GLOBAL_RELAY_RETAINED_BYTE_BUDGET,
        );
        self.entries.insert(run_id.to_string(), relay.clone());
        Some(relay)
    }

    /// Record one reader's exit and return whether a subscribed non-terminal
    /// relay needs an immediate replacement producer.
    fn reader_finished(
        &mut self,
        run_id: &str,
        relay: &Arc<RunRelay>,
        restart_if_subscribed: bool,
    ) -> bool {
        let Some(resident) = self.entries.get(run_id) else {
            relay.producer_running.store(false, Ordering::SeqCst);
            return false;
        };
        if !Arc::ptr_eq(resident, relay) {
            relay.producer_running.store(false, Ordering::SeqCst);
            return false;
        }
        relay.producer_running.store(false, Ordering::SeqCst);
        if relay.tx.receiver_count() == 0 || !restart_if_subscribed {
            self.entries.remove(run_id);
            false
        } else {
            !relay.is_terminal()
        }
    }
}

fn relays() -> &'static Mutex<RelayRegistry> {
    static RELAYS: OnceLock<Mutex<RelayRegistry>> = OnceLock::new();
    RELAYS.get_or_init(|| Mutex::new(RelayRegistry::new()))
}

/// Get or create the resident relay for `run_id`. The handler subscribes before
/// starting its reader so a fast degraded exit cannot race ahead of the first
/// receiver. Prunes finished relays with no live subscribers before enforcing the
/// concurrency cap; at cap with nothing prunable, returns `None` so the caller
/// serves an honest `relay_capacity` degraded frame rather than growing threads
/// without bound.
fn get_or_create_relay(run_id: &str) -> Option<Arc<RunRelay>> {
    let mut registry = relays().lock().unwrap_or_else(|e| e.into_inner());
    registry.get_or_insert(run_id)
}

/// Start at most one producer for a resident relay. A compare-exchange makes
/// concurrent browser reconnects converge on one reader thread.
fn ensure_relay_reader(run_id: &str, relay: &Arc<RunRelay>) {
    if !relay.claim_producer() {
        return;
    }
    // The upstream reader runs on a dedicated blocking thread: it parks on a bounded
    // socket read for the life of the run, so it must not sit on a Tokio async
    // worker. The thread owns a clone of the relay and self-exits when the run
    // terminates, the upstream ends, or no client is subscribed.
    let run_id_owned = run_id.to_string();
    let relay_for_thread = relay.clone();
    std::thread::spawn(move || {
        // Always restore lifecycle state, even if an unexpected parser bug panics.
        let outcome = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            run_relay_thread(&run_id_owned, &relay_for_thread)
        }));
        let restart_if_subscribed = matches!(outcome, Ok(true));
        finish_relay_reader(&run_id_owned, &relay_for_thread, restart_if_subscribed);
    });
}

/// Publish producer exit under the registry lock. If a reconnect subscribed in
/// the narrow stop/cleanup race, immediately start a replacement; otherwise
/// remove the tombstone regardless of terminal state so churn frees its slot.
fn finish_relay_reader(run_id: &str, relay: &Arc<RunRelay>, restart_if_subscribed: bool) {
    let restart = {
        let mut registry = relays().lock().unwrap_or_else(|e| e.into_inner());
        registry.reader_finished(run_id, relay, restart_if_subscribed)
    };
    if restart {
        ensure_relay_reader(run_id, relay);
    }
}

/// The upstream reader thread body: connect to the resident a2a gateway's
/// run-stream, pump verbatim frames into the relay until the run terminates, and
/// on any connection fault emit one degraded signal. The browser owns authoritative
/// status polling. Bounded by `RELAY_MAX_LIFETIME` overall and
/// `UPSTREAM_IDLE_TIMEOUT` per read.
fn run_relay_thread(run_id: &str, relay: &RunRelay) -> bool {
    let deadline = Instant::now() + RELAY_MAX_LIFETIME;
    let (port, bearer) = match super::a2a::a2a_endpoint() {
        Ok(endpoint) => endpoint,
        Err(reason) => {
            // The browser owns authoritative degraded polling. Emit one signal and
            // retire this channel so its retry can establish a fresh relay later.
            relay.push(
                "relay_degraded".to_string(),
                json!({ "degraded": true, "reason": reason }),
            );
            return false;
        }
    };

    match stream_upstream(port, bearer.as_deref(), run_id, relay, deadline) {
        // Terminal reached over the live stream: nothing more to do.
        Ok(StreamEnd::Terminal) => false,
        // A viewer can subscribe in the narrow gap after the reader observes zero
        // receivers. Only that exit is restartable without a browser retry.
        Ok(StreamEnd::NoSubscribers) => true,
        // Every other stream fault emits one non-authoritative degradation signal
        // and retires. The browser is the sole `run-status` polling owner.
        Ok(StreamEnd::Interrupted { reason }) | Err(reason) => {
            if !relay.is_terminal() {
                relay.push(
                    "relay_degraded".to_string(),
                    json!({ "degraded": true, "reason": reason }),
                );
            }
            false
        }
    }
}

/// Why the upstream stream stopped without a terminal frame.
enum StreamEnd {
    Terminal,
    NoSubscribers,
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
#[derive(Debug)]
struct HttpHead {
    status: u16,
    chunked: bool,
}

/// Read the HTTP status line + headers up to the blank line, returning the status
/// code and whether the body is chunked-transfer-encoded. Both each line and the
/// aggregate head are rejected before their owned buffers can exceed fixed caps.
fn read_http_head<R: BufRead>(reader: &mut R) -> std::io::Result<HttpHead> {
    let mut total = 0usize;
    let status_line = read_bounded_line(
        reader,
        MAX_HTTP_STATUS_LINE_BYTES,
        &mut total,
        MAX_HTTP_HEAD_BYTES,
    )?
    .ok_or_else(|| std::io::Error::other("missing HTTP status line"))?;
    let status_line = std::str::from_utf8(&status_line)
        .map_err(|_| std::io::Error::other("HTTP status line is not UTF-8"))?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|c| c.parse::<u16>().ok())
        .ok_or_else(|| std::io::Error::other("malformed HTTP status line"))?;
    let mut chunked = false;
    loop {
        let Some(line) = read_bounded_line(
            reader,
            MAX_HTTP_HEADER_LINE_BYTES,
            &mut total,
            MAX_HTTP_HEAD_BYTES,
        )?
        else {
            return Err(std::io::Error::other("HTTP head ended before blank line"));
        };
        let line = std::str::from_utf8(&line)
            .map_err(|_| std::io::Error::other("HTTP header is not UTF-8"))?;
        let trimmed = line.trim_end_matches(['\r', '\n']);
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

/// Read one newline-terminated line without `BufRead::read_line`'s unbounded
/// growth. The peer is rejected as soon as either the line or aggregate budget
/// would be crossed; at most `line_limit` bytes are ever owned by this function.
fn read_bounded_line<R: BufRead>(
    reader: &mut R,
    line_limit: usize,
    total: &mut usize,
    total_limit: usize,
) -> std::io::Result<Option<Vec<u8>>> {
    let mut line = Vec::with_capacity(line_limit.min(256));
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            return if line.is_empty() {
                Ok(None)
            } else {
                Ok(Some(line))
            };
        }
        let take = available
            .iter()
            .position(|byte| *byte == b'\n')
            .map_or(available.len(), |index| index + 1);
        if line.len().saturating_add(take) > line_limit || total.saturating_add(take) > total_limit
        {
            return Err(std::io::Error::other("HTTP line/head exceeds byte ceiling"));
        }
        line.extend_from_slice(&available[..take]);
        reader.consume(take);
        *total += take;
        if line.last() == Some(&b'\n') {
            return Ok(Some(line));
        }
    }
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
                    return Ok(StreamEnd::NoSubscribers);
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
        let mut chunk_head_bytes = 0usize;
        let size_line = read_bounded_line(
            reader,
            MAX_HTTP_CHUNK_LINE_BYTES,
            &mut chunk_head_bytes,
            MAX_HTTP_CHUNK_LINE_BYTES,
        )?
        .ok_or_else(|| std::io::Error::other("missing chunk size"))?;
        let size_line = std::str::from_utf8(&size_line)
            .map_err(|_| std::io::Error::other("chunk size is not UTF-8"))?;
        let size =
            usize::from_str_radix(size_line.trim().split(';').next().unwrap_or("").trim(), 16)
                .map_err(|_| std::io::Error::other("malformed chunk size"))?;
        if size == 0 {
            self.done = true;
            return Ok(None);
        }
        if size > MAX_HTTP_CHUNK_BYTES {
            return Err(std::io::Error::other(
                "declared HTTP chunk exceeds byte ceiling",
            ));
        }
        let mut body = vec![0u8; size];
        reader.read_exact(&mut body)?;
        let mut crlf = [0u8; 2];
        reader.read_exact(&mut crlf)?;
        if crlf != *b"\r\n" {
            return Err(std::io::Error::other("chunk body missing trailing CRLF"));
        }
        Ok(Some(body))
    }
}

/// Accumulates decoded body bytes and yields complete SSE frames as
/// `(event, data)` pairs. SSE frames are separated by a blank line; within a
/// frame, `event:` names the event and one or more `data:` lines form the payload
/// (joined by `\n`). A frame accumulating past `MAX_RELAY_FRAME_BYTES` is dropped
/// and replaced by an engine drop sentinel so a single frame never grows unbounded.
struct SseAccumulator {
    buf: Vec<u8>,
    discarding: bool,
    line_has_content: bool,
}

impl SseAccumulator {
    fn new() -> Self {
        SseAccumulator {
            buf: Vec::with_capacity(8 * 1024),
            discarding: false,
            line_has_content: false,
        }
    }

    fn push_bytes(&mut self, bytes: &[u8]) -> Vec<(String, Value)> {
        let mut out = Vec::with_capacity(MAX_SSE_OUTPUTS_PER_PUSH);
        let payload_slots = MAX_SSE_OUTPUTS_PER_PUSH - 1;
        let mut output_overflow = false;
        for &byte in bytes {
            // A newline on an already-empty line terminates an SSE frame. CR is
            // ignored only for blank-line detection so CRLF works across chunks.
            if byte == b'\n' && !self.line_has_content {
                if self.discarding {
                    if out.len() < payload_slots {
                        out.push(engine_drop_sentinel());
                    } else {
                        output_overflow = true;
                    }
                } else if out.len() >= payload_slots {
                    // Framing state still advances, but do not decode UTF-8, split
                    // lines, or allocate JSON for frames that cannot be returned.
                    output_overflow = true;
                } else {
                    while self.buf.last() == Some(&b'\r') {
                        self.buf.pop();
                    }
                    let raw = String::from_utf8_lossy(&self.buf);
                    if let Some(frame) = parse_sse_frame(&raw) {
                        out.push(frame);
                    }
                }
                self.buf.clear();
                self.discarding = false;
                self.line_has_content = false;
                continue;
            }

            if !self.discarding {
                if self.buf.len() >= MAX_RELAY_FRAME_BYTES {
                    self.buf.clear();
                    self.discarding = true;
                } else {
                    self.buf.push(byte);
                }
            }
            if byte == b'\n' {
                self.line_has_content = false;
            } else if byte != b'\r' {
                self.line_has_content = true;
            }
        }
        if output_overflow {
            out.push(engine_drop_sentinel_for("relay_push_output_exceeds_cap"));
        }
        out
    }

    #[cfg(test)]
    fn buffered_bytes(&self) -> usize {
        self.buf.len()
    }
}

fn engine_drop_sentinel() -> (String, Value) {
    engine_drop_sentinel_for("relay_frame_exceeds_cap")
}

fn engine_drop_sentinel_for(reason: &'static str) -> (String, Value) {
    (
        "progress_dropped".to_string(),
        json!({
            "api_version": "v1",
            "type": "progress_dropped",
            "reason": reason,
        }),
    )
}

/// Parse one raw SSE frame (its lines, no trailing blank line) into
/// `(event, data)`. Lines beginning `:` are comments (ignored); `event:` sets the
/// event name; `data:` lines are concatenated with `\n`. A frame with no data is
/// skipped. The `data` is parsed as JSON when it parses, else carried as a string
/// — either way VERBATIM, so the upstream `progress_dropped` sentinel passes
/// through unaltered. An oversized frame becomes an engine drop sentinel.
fn parse_sse_frame(raw: &str) -> Option<(String, Value)> {
    if raw.len() > MAX_RELAY_FRAME_BYTES {
        return Some(engine_drop_sentinel());
    }
    let mut event: Option<String> = None;
    let mut data_lines: Vec<&str> = Vec::new();
    for line in raw.split('\n').map(|line| line.trim_end_matches('\r')) {
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

/// Render a `RelayFrame` as an SSE `Event`: the event name, the engine seq as the
/// SSE `id`, and the frame data with the engine `seq` ANNOTATED into it. The seq
/// rides the data (not only the SSE id) because the frontend's fetch-stream parser
/// reads `event:`/`data:` only — never the `id:` line — so a client cannot dedup a
/// reconnect's replay or compute its `since=` resume point without the seq in the
/// payload (the same reason the graph delta channel embeds seq in its payload).
/// Upstream fields are left intact; the seq is an additive engine annotation. A
/// non-object frame (defensive — a2a frames are objects) is wrapped `{seq, value}`.
fn frame_event(frame: &RelayFrame) -> Event {
    Event::default()
        .event(frame.event.as_ref())
        .id(frame.seq.to_string())
        .data(frame.data.as_ref())
}

/// Map one live broadcast item to an SSE event, turning a broadcast lag into a
/// `gap` so a slow client re-keyframes instead of silently diverging (mirrors
/// `routes::stream::map_live_item`). A frame at or below the replayed threshold is
/// dropped as a duplicate.
fn map_live_frame(
    item: Result<SharedRelayFrame, BroadcastStreamRecvError>,
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
    let Some(relay) = get_or_create_relay(&run_id) else {
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
    ensure_relay_reader(&run_id, &relay);
    let (frames, gap) = relay.snapshot_since(params.since);

    let emitted_up_to = frames
        .last()
        .map(|frame| frame.seq)
        .unwrap_or_else(|| params.since.unwrap_or(0));
    let dedup_threshold = params.since.map(|_| emitted_up_to);

    // Replay remains shared immutable data until each frame is polled. Event
    // serialization is lazy, so opening a snapshot cannot materialize another
    // multi-megabyte backlog before socket backpressure applies.
    let gap_stream = tokio_stream::iter(gap.into_iter().map(move |oldest| {
        Ok(Event::default()
            .event("gap")
            .data(json!({ "requested": params.since, "oldest_buffered": oldest }).to_string()))
    }));
    let replay = tokio_stream::iter(frames).map(|frame| Ok(frame_event(&frame)));
    let live = BroadcastStream::new(receiver)
        .filter_map(move |item| map_live_frame(item, dedup_threshold));
    let combined = gap_stream.chain(replay).chain(live);
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
mod tests;
