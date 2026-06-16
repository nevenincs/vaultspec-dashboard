//! Bounded HTTP control client for vaultspec-rag's management surface
//! (rag-control-plane ADR D1): the engine brokers rag's job-based control API
//! verb-by-verb over its resident loopback HTTP service, each verb carrying the
//! transport's per-socket inactivity timeout (the per-verb wall-clock budget the
//! broker pins, [`READ_BUDGET`]/[`CONTROL_BUDGET`]/[`QUALITY_BUDGET`]) plus the
//! `MAX_RAG_BODY` body cap, returning a typed [`RagError`] — mirroring the
//! `vectors.rs`/`search.rs` discipline.
//!
//! This module carries ZERO rag semantics (`engine-read-and-infer`): every verb
//! forwards rag's request vocabulary and returns rag's response envelope as a
//! verbatim `serde_json::Value`. Argument validation/bounding and the `tiers`
//! block are the BROKER's job (`vaultspec-api routes/ops.rs`), not this
//! transport's. The control plane is rag's; this is the honest wire to it.
//!
//! Transport split (ADR D1): runtime reads, the reindex TRIGGER, job polling,
//! watcher config, and project management go over HTTP here; true process
//! lifecycle (`server start/stop/doctor/install`) stays the engine's bounded CLI
//! subprocess runner — a dead service cannot be reached over HTTP.

use std::time::Duration;

use serde_json::{Value, json};

use crate::client::{RagTransport, Result};

/// Per-verb wall-clock budget for the fast read + control verbs (jobs, watcher,
/// projects, service-state, readiness, reindex-trigger, watcher start/stop/
/// reconfigure, project evict): each is a snapshot read or a queue-and-return
/// that never blocks on a build, so a tight bound is honest. The broker
/// constructs the transport with this as its socket timeout.
pub const READ_BUDGET: Duration = Duration::from_secs(10);

/// Per-verb budget for the control POSTs and the log read — slightly longer
/// than [`READ_BUDGET`] to tolerate a watcher restart or a megabyte log read,
/// while still bounding a hang.
pub const CONTROL_BUDGET: Duration = Duration::from_secs(15);

/// Per-verb budget for the `/quality` probe: rag runs a small live retrieval
/// benchmark, which is materially slower than a snapshot read, so it gets its
/// own generous-but-bounded budget rather than sharing the fast read bound.
pub const QUALITY_BUDGET: Duration = Duration::from_secs(60);

/// Percent-encode a query-parameter value (RFC 3986 unreserved set passes
/// through; everything else is `%XX`). rag reads `request.query_params`, which
/// Starlette URL-decodes, so a Windows `project_root` (back-slashes, a drive
/// colon, spaces) MUST be encoded or the value is truncated/mis-parsed.
fn encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Parse rag's JSON response envelope verbatim. A non-JSON body (e.g. a future
/// shape change) is a typed error the broker degrades the tier on, never a
/// silent empty.
fn parse(raw: String) -> Result<Value> {
    Ok(serde_json::from_str(&raw)?)
}

// --- GET reads (rag's envelope forwarded verbatim) ---------------------------

/// `GET /service-state?project_root=` — rag's index/watcher/GPU service state
/// for the project root. The cheapest stable source for the freshness epoch
/// alongside `/jobs` (ADR D4).
pub fn service_state(transport: &impl RagTransport, project_root: &str) -> Result<Value> {
    parse(transport.get(&format!(
        "/service-state?project_root={}",
        encode(project_root)
    ))?)
}

/// `GET /jobs[?job_id=&limit=]` — the activity snapshot rag's reindex jobs
/// report into: per-job `phase`/`progress`/`resources` for a bounded poll
/// (ADR D3 trigger-then-poll). `job_id` is a prefix filter; `limit` caps the
/// newest-first record count.
pub fn jobs(
    transport: &impl RagTransport,
    job_id: Option<&str>,
    limit: Option<u32>,
) -> Result<Value> {
    let mut q: Vec<String> = Vec::new();
    if let Some(id) = job_id {
        q.push(format!("job_id={}", encode(id)));
    }
    if let Some(n) = limit {
        q.push(format!("limit={n}"));
    }
    let qs = if q.is_empty() {
        String::new()
    } else {
        format!("?{}", q.join("&"))
    };
    parse(transport.get(&format!("/jobs{qs}"))?)
}

/// `GET /watcher?project_root=` — the watcher's enable/debounce/cooldown config
/// and the set of roots currently watched, plus whether THIS root is running.
pub fn watcher_get(transport: &impl RagTransport, project_root: &str) -> Result<Value> {
    parse(transport.get(&format!("/watcher?project_root={}", encode(project_root)))?)
}

/// `GET /projects` — the resident project registry: leased slots, the max-slot
/// cap, and the idle-eviction TTL.
pub fn projects(transport: &impl RagTransport) -> Result<Value> {
    parse(transport.get("/projects")?)
}

/// `GET /readiness` — model/torch/GPU readiness (the "is the semantic engine
/// warm" health the control surface renders alongside index state).
pub fn readiness(transport: &impl RagTransport) -> Result<Value> {
    parse(transport.get("/readiness")?)
}

/// `GET /logs/json[?lines=&job_id=]` — the recent rotated service log as a JSON
/// `{lines, total, filters}` envelope (the JSON sibling of `/logs`), optionally
/// filtered to one job id. `lines` is clamped server-side.
pub fn logs(
    transport: &impl RagTransport,
    lines: Option<u32>,
    job_id: Option<&str>,
) -> Result<Value> {
    let mut q: Vec<String> = Vec::new();
    if let Some(n) = lines {
        q.push(format!("lines={n}"));
    }
    if let Some(id) = job_id {
        q.push(format!("job_id={}", encode(id)));
    }
    let qs = if q.is_empty() {
        String::new()
    } else {
        format!("?{}", q.join("&"))
    };
    parse(transport.get(&format!("/logs/json{qs}"))?)
}

/// `GET /metrics` — the Prometheus text exposition (NOT JSON). Returned as raw
/// text for the broker to wrap; the engine forwards it verbatim and never
/// re-shapes the metric set.
pub fn metrics(transport: &impl RagTransport) -> Result<String> {
    transport.get("/metrics")
}

// --- POST controls (rag's envelope forwarded verbatim) -----------------------

/// Validated arguments for a reindex trigger. The BROKER builds this after
/// validating the values against rag's vocabulary (P02.S12); this module only
/// forwards them. `project_root` is the engine-controlled active scope root, so
/// the frontend can never point rag at an arbitrary path.
#[derive(Debug, Clone)]
pub struct ReindexArgs<'a> {
    pub project_root: &'a str,
    /// `"vault"` or `"code"` (rag's vocabulary).
    pub reindex_type: &'a str,
    /// `true` drops and rebuilds the collection; `false` is incremental.
    pub clean: bool,
    /// `"cli" | "mcp" | "service" | "watcher"` — who triggered it.
    pub initiator_kind: &'a str,
}

/// `POST /reindex` — TRIGGER a reindex and return rag's `{ok, job_id, status:
/// "queued"}` immediately (ADR D3): the engine never blocks on the minutes-long
/// build; the frontend polls [`jobs`] to terminal.
pub fn reindex(transport: &impl RagTransport, args: &ReindexArgs) -> Result<Value> {
    let body = json!({
        "project_root": args.project_root,
        "type": args.reindex_type,
        "clean": args.clean,
        "initiator_kind": args.initiator_kind,
    })
    .to_string();
    parse(transport.post_json("/reindex", &body)?)
}

/// `POST /watcher/start {root}` — start the resident watcher for a root.
pub fn watcher_start(transport: &impl RagTransport, root: &str) -> Result<Value> {
    parse(transport.post_json("/watcher/start", &json!({ "root": root }).to_string())?)
}

/// `POST /watcher/stop {root}` — stop the resident watcher for a root.
pub fn watcher_stop(transport: &impl RagTransport, root: &str) -> Result<Value> {
    parse(transport.post_json("/watcher/stop", &json!({ "root": root }).to_string())?)
}

/// `POST /watcher/reconfigure {root, debounce_ms?, cooldown_s?}` — restart the
/// watcher with new debounce/cooldown. Absent fields keep rag's current config.
/// The broker validates the numeric bounds before forwarding (P02.S12).
pub fn watcher_reconfigure(
    transport: &impl RagTransport,
    root: &str,
    debounce_ms: Option<u64>,
    cooldown_s: Option<f64>,
) -> Result<Value> {
    let mut body = json!({ "root": root });
    if let Some(ms) = debounce_ms {
        body["debounce_ms"] = json!(ms);
    }
    if let Some(s) = cooldown_s {
        body["cooldown_s"] = json!(s);
    }
    parse(transport.post_json("/watcher/reconfigure", &body.to_string())?)
}

/// `POST /projects/evict {root}` — evict a project's resident slot, freeing its
/// GPU/model lease. Returns rag's `{root, evicted, reason}`.
pub fn projects_evict(transport: &impl RagTransport, root: &str) -> Result<Value> {
    parse(transport.post_json("/projects/evict", &json!({ "root": root }).to_string())?)
}

/// `POST /quality` — run rag's live retrieval-quality probe. Materially slower
/// than a snapshot read (see [`QUALITY_BUDGET`]).
pub fn quality(transport: &impl RagTransport) -> Result<Value> {
    parse(transport.post_json("/quality", "{}")?)
}

// --- Semantic freshness epoch (ADR D4) ---------------------------------------

/// Derive the semantic-index freshness epoch from a `/jobs` snapshot: the
/// newest `finished_at` (seconds, float) across TERMINAL jobs, in milliseconds.
/// `0` when no reindex has ever completed.
///
/// This is the semantic analog of the structural `generation` counter: each
/// completed reindex stamps a new `finished_at`, so the epoch advances exactly
/// when rag's index changed and a downstream semantic build must invalidate. A
/// still-running job carries no `finished_at` and is skipped, so the epoch holds
/// at the last COMPLETED build while a new one is in flight (the honest "vectors
/// are still the previous build's" state).
pub fn semantic_epoch_from_jobs(jobs: &Value) -> u64 {
    jobs.get("jobs")
        .and_then(Value::as_array)
        .map(|records| {
            records
                .iter()
                .filter(|job| {
                    // A running job has not changed the served index yet.
                    job.get("phase").and_then(Value::as_str) != Some("running")
                })
                .filter_map(|job| job.get("finished_at").and_then(Value::as_f64))
                .fold(0u64, |acc, secs| acc.max((secs * 1000.0).max(0.0) as u64))
        })
        .unwrap_or(0)
}

/// Read the current semantic-index freshness epoch from rag (ADR D4): one
/// bounded `/jobs` read, reduced to the newest terminal-job timestamp via
/// [`semantic_epoch_from_jobs`]. The broker keys the embeddings vector cache on
/// this so a reindex invalidates the served vectors.
pub fn semantic_epoch(transport: &impl RagTransport) -> Result<u64> {
    Ok(semantic_epoch_from_jobs(&jobs(transport, None, None)?))
}

#[cfg(test)]
mod tests {
    use std::io::Write;
    use std::net::TcpListener;

    use super::*;
    use crate::client::test_support::FakeTransport;
    use crate::client::{LoopbackTransport, RagError};

    #[test]
    fn get_reads_hit_the_right_paths_and_forward_verbatim() {
        // service-state encodes a Windows project_root into the query string.
        let t = FakeTransport::returning(vec![r#"{"index":{"vault_count":42}}"#]);
        let out = service_state(&t, r"C:\code\proj root").unwrap();
        assert_eq!(
            out["index"]["vault_count"], 42,
            "rag envelope passes verbatim"
        );
        let (path, body) = t.calls.borrow()[0].clone();
        assert_eq!(
            path, "/service-state?project_root=C%3A%5Ccode%5Cproj%20root",
            "back-slash, drive-colon and space are percent-encoded"
        );
        assert_eq!(body, "", "a GET carries no request body");

        // jobs with a job_id + limit filter.
        let t = FakeTransport::returning(vec![r#"{"jobs":[],"total":0}"#]);
        jobs(&t, Some("job-abc"), Some(5)).unwrap();
        assert_eq!(t.calls.borrow()[0].0, "/jobs?job_id=job-abc&limit=5");

        // bare jobs (no filters) has no query string.
        let t = FakeTransport::returning(vec![r#"{"jobs":[]}"#]);
        jobs(&t, None, None).unwrap();
        assert_eq!(t.calls.borrow()[0].0, "/jobs");

        // watcher get, projects, readiness, logs/json paths.
        let t = FakeTransport::returning(vec![r#"{"watch_enabled":true}"#]);
        watcher_get(&t, "/r").unwrap();
        assert_eq!(t.calls.borrow()[0].0, "/watcher?project_root=%2Fr");

        let t = FakeTransport::returning(vec![r#"{"projects":[]}"#]);
        projects(&t).unwrap();
        assert_eq!(t.calls.borrow()[0].0, "/projects");

        let t = FakeTransport::returning(vec![r#"{"lines":[],"total":0}"#]);
        logs(&t, Some(50), Some("job-x")).unwrap();
        assert_eq!(t.calls.borrow()[0].0, "/logs/json?lines=50&job_id=job-x");
    }

    #[test]
    fn post_controls_send_the_right_body_and_forward_verbatim() {
        // reindex trigger returns rag's job_id envelope unreshaped.
        let t = FakeTransport::returning(vec![r#"{"ok":true,"job_id":"j-1","status":"queued"}"#]);
        let out = reindex(
            &t,
            &ReindexArgs {
                project_root: "/r",
                reindex_type: "vault",
                clean: false,
                initiator_kind: "service",
            },
        )
        .unwrap();
        assert_eq!(out["job_id"], "j-1");
        assert_eq!(out["status"], "queued", "queued envelope passes verbatim");
        let (path, body) = t.calls.borrow()[0].clone();
        assert_eq!(path, "/reindex");
        let sent: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(sent["project_root"], "/r");
        assert_eq!(sent["type"], "vault");
        assert_eq!(sent["clean"], false);
        assert_eq!(sent["initiator_kind"], "service");

        // watcher reconfigure only sends the fields that were supplied.
        let t = FakeTransport::returning(vec![r#"{"restarted":true}"#]);
        watcher_reconfigure(&t, "/r", Some(750), None).unwrap();
        let sent: Value = serde_json::from_str(&t.calls.borrow()[0].1).unwrap();
        assert_eq!(sent["debounce_ms"], 750);
        assert!(sent.get("cooldown_s").is_none(), "absent field is omitted");

        // evict forwards rag's {root, evicted, reason} verbatim.
        let t = FakeTransport::returning(vec![r#"{"root":"/r","evicted":true,"reason":"idle"}"#]);
        let out = projects_evict(&t, "/r").unwrap();
        assert_eq!(out["evicted"], true);
        assert_eq!(t.calls.borrow()[0].0, "/projects/evict");
    }

    #[test]
    fn semantic_epoch_is_the_newest_terminal_finished_at() {
        // The newest TERMINAL finished_at wins; a running job (no finished_at)
        // is skipped so the epoch holds at the last completed build.
        let snapshot = json!({
            "jobs": [
                {"id": "a", "phase": "ok", "finished_at": 1000.5},
                {"id": "b", "phase": "ok", "finished_at": 2000.0},
                {"id": "c", "phase": "running"},
                {"id": "d", "phase": "error", "finished_at": 1500.0},
            ]
        });
        assert_eq!(
            semantic_epoch_from_jobs(&snapshot),
            2_000_000,
            "newest terminal finished_at (2000.0s) in ms"
        );

        // No completed job → epoch 0 (nothing has been indexed yet).
        assert_eq!(
            semantic_epoch_from_jobs(&json!({"jobs": [{"id": "x", "phase": "running"}]})),
            0
        );
        // Missing jobs array → 0, never a panic.
        assert_eq!(semantic_epoch_from_jobs(&json!({})), 0);

        // A completed reindex advances the epoch.
        let before =
            semantic_epoch_from_jobs(&json!({"jobs": [{"phase": "ok", "finished_at": 100.0}]}));
        let after = semantic_epoch_from_jobs(&json!({"jobs": [
            {"phase": "ok", "finished_at": 100.0},
            {"phase": "ok", "finished_at": 200.0},
        ]}));
        assert!(after > before, "a newer terminal job advances the epoch");
    }

    #[test]
    fn a_hung_control_verb_times_out_on_its_wall_clock_budget() {
        // P01.S07: a verb whose server accepts the connection but never responds
        // must surface a typed timeout on its per-verb budget, never an
        // unbounded read — exactly as the vectors.rs/client.rs bound tests
        // assert for the embedding scroll.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            // Accept, then sit on the connection without writing a response so
            // the client's read times out.
            let (_stream, _) = listener.accept().unwrap();
            std::thread::sleep(Duration::from_millis(800));
        });
        let transport = LoopbackTransport {
            port,
            bearer: None,
            timeout: Duration::from_millis(150),
        };
        let result = projects(&transport);
        assert!(
            matches!(result, Err(RagError::Io(_))),
            "a hung verb is a typed Io (timeout) error, got {result:?}"
        );
        let _ = server.join();
    }

    #[test]
    fn an_oversized_control_body_is_a_typed_protocol_error() {
        // P01.S07: a verb whose response overshoots MAX_RAG_BODY is a typed
        // Protocol error, never a buffer grown to exhaustion — the body cap
        // backstops every control verb, like the embedding read.
        use crate::client::MAX_RAG_BODY;
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let _ = std::io::Read::read(&mut stream, &mut buf);
            let _ = write!(stream, "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n");
            let chunk = vec![b'x'; 1024 * 1024];
            let mut written: u64 = 0;
            let target = MAX_RAG_BODY + 2 * 1024 * 1024;
            while written < target {
                if stream.write_all(&chunk).is_err() {
                    break;
                }
                written += chunk.len() as u64;
            }
        });
        let transport = LoopbackTransport {
            port,
            bearer: None,
            timeout: Duration::from_secs(10),
        };
        let result = projects(&transport);
        assert!(
            matches!(result, Err(RagError::Protocol)),
            "a body past the cap is a typed Protocol error, got {result:?}"
        );
        let _ = server.join();
    }
}
