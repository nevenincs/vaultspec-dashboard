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

/// Survey-bearing reads (`/storage/survey`, the ops-state aggregate that
/// includes it): rag walks the machine store's per-namespace disk footprints,
/// which scales with resident namespaces (~15s observed on a 98-namespace
/// store), so these get a wider wall-clock than [`READ_BUDGET`] rather than
/// failing the storage rollup closed on every well-populated machine. Still
/// bounded well under the engine-wide route ceiling.
pub const SURVEY_BUDGET: Duration = Duration::from_secs(45);

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

/// `GET /storage/survey[?limit=]` — rag's per-namespace storage survey: each
/// prefix's on-disk `footprint_bytes` (a filesystem walk), `points` count,
/// `collections`, and a `live`/`orphaned`/`unknown`/`unverifiable` `status`. The
/// authoritative disk-SIZE + orphan source (server mode only; rag returns 409 in
/// local-only mode, which the aggregation tolerates as "storage unavailable").
/// `limit` is bounded by the broker so the namespace list is never unbounded.
pub fn storage_survey(transport: &impl RagTransport, limit: Option<u32>) -> Result<Value> {
    let qs = limit.map(|n| format!("?limit={n}")).unwrap_or_default();
    parse(transport.get(&format!("/storage/survey{qs}"))?)
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

// --- rag-ops aggregation (the size/state surface computed in Rust) -----------
//
// The console's overview needs ONE size+state snapshot, not six round-trips from
// the frontend. The broker fetches rag's codified Tier-1 reads and this module
// DERIVES the rollup in Rust (the performance directive): the storage size totals
// and the live/orphaned counts are computed here from the survey, while the
// index/GPU/qdrant/watcher/tenant blocks are forwarded verbatim (a rag-side shape
// change to those is a tolerant pass-through, not a parse failure). This is the
// only place that COMBINES rag reads; each underlying read stays verbatim.

/// The namespace list is bounded so the survey rollup is never unbounded
/// (`bounded-by-default`); rag orders orphaned/unknown first, so a truncated list
/// still surfaces the namespaces that need attention.
pub const RAG_OPS_SURVEY_LIMIT: u32 = 64;

/// One namespace in the storage rollup (a `r<hash>_` prefix and its collections).
#[derive(Debug, Clone, serde::Serialize)]
pub struct StorageNamespaceSummary {
    pub prefix: String,
    /// The resolved project root, or `None` for an unknown/orphaned namespace.
    pub root: Option<String>,
    /// `live` | `orphaned` | `unknown` | `unverifiable`.
    pub status: String,
    pub points: u64,
    pub footprint_bytes: u64,
    pub collections: Vec<String>,
}

/// The Rust-computed storage size rollup over rag's `/storage/survey`.
#[derive(Debug, Clone, serde::Serialize)]
pub struct StorageRollup {
    /// `false` when the survey was unavailable (local-only mode 409, or any
    /// survey error): the rest of the ops-state still serves, this block degrades.
    pub available: bool,
    pub total_points: u64,
    pub total_footprint_bytes: u64,
    /// Namespaces rag reports in total (may exceed the returned/summarized list).
    pub total_namespaces: usize,
    /// `true` when the survey returned FEWER namespaces than `total_namespaces`
    /// (bounded at `RAG_OPS_SURVEY_LIMIT`): the `total_points` /
    /// `total_footprint_bytes` / `live_count` / `orphaned_count` figures are then a
    /// LOWER BOUND over the first `namespaces.len()` namespaces, not exact totals —
    /// so a consumer must render them as partial (RCR-002 truncation honesty; the
    /// bounded-slice corollary of display-state-is-backend-served).
    pub truncated: bool,
    pub live_count: usize,
    pub orphaned_count: usize,
    /// The bounded namespace detail list (orphaned/unknown first).
    pub namespaces: Vec<StorageNamespaceSummary>,
}

impl StorageRollup {
    fn unavailable() -> Self {
        StorageRollup {
            available: false,
            total_points: 0,
            total_footprint_bytes: 0,
            total_namespaces: 0,
            truncated: false,
            live_count: 0,
            orphaned_count: 0,
            namespaces: Vec::new(),
        }
    }
}

/// The aggregated rag-ops snapshot: the Rust-computed storage rollup plus the
/// verbatim index/qdrant/watcher (from `/service-state`) and tenant registry
/// (from `/projects`) blocks. Serialized into the brokered envelope.
#[derive(Debug, Clone, serde::Serialize)]
pub struct RagOpsState {
    /// `/service-state` `index` block (GPU, doc/code counts, target dir).
    pub index: Value,
    /// `/service-state` `qdrant` block (mode, version, port, alive, restarts).
    pub qdrant: Value,
    /// `/service-state` `watcher` block (enabled, running, debounce, cooldown).
    pub watcher: Value,
    /// The Rust-computed storage size rollup.
    pub storage: StorageRollup,
    /// `/projects` tenant registry (slots, max, idle TTL) forwarded verbatim.
    pub tenants: Value,
}

/// Derive the storage size rollup from a `/storage/survey` body. The totals sum
/// every returned namespace; the detail list is the survey's (already bounded)
/// namespace array. `None` (survey unavailable) degrades to an empty,
/// `available:false` rollup.
pub fn derive_storage_rollup(survey: Option<&Value>) -> StorageRollup {
    let Some(survey) = survey else {
        return StorageRollup::unavailable();
    };
    let mut namespaces = Vec::new();
    let mut total_points = 0u64;
    let mut total_footprint = 0u64;
    let mut live = 0usize;
    let mut orphaned = 0usize;
    if let Some(arr) = survey.get("namespaces").and_then(Value::as_array) {
        for ns in arr {
            let points = ns.get("points").and_then(Value::as_u64).unwrap_or(0);
            let footprint = ns
                .get("footprint_bytes")
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let status = ns
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            match status.as_str() {
                "live" => live += 1,
                "orphaned" => orphaned += 1,
                _ => {}
            }
            total_points = total_points.saturating_add(points);
            total_footprint = total_footprint.saturating_add(footprint);
            namespaces.push(StorageNamespaceSummary {
                prefix: ns
                    .get("prefix")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string(),
                root: ns.get("root").and_then(Value::as_str).map(String::from),
                status,
                points,
                footprint_bytes: footprint,
                collections: ns
                    .get("collections")
                    .and_then(Value::as_array)
                    .map(|c| {
                        c.iter()
                            .filter_map(|v| v.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default(),
            });
        }
    }
    let total_namespaces = survey
        .get("total")
        .and_then(Value::as_u64)
        .map(|t| t as usize)
        .unwrap_or(namespaces.len());
    StorageRollup {
        available: true,
        total_points,
        total_footprint_bytes: total_footprint,
        total_namespaces,
        // The totals/counts sum only the returned namespaces; when rag reports more
        // than were returned (bounded at RAG_OPS_SURVEY_LIMIT), the figures are a
        // lower bound and the consumer must say so (RCR-002).
        truncated: total_namespaces > namespaces.len(),
        live_count: live,
        orphaned_count: orphaned,
        namespaces,
    }
}

/// Combine the Tier-1 reads into the aggregated [`RagOpsState`]. Pure (testable
/// without a transport): the broker fetches the three reads and passes them here.
pub fn derive_rag_ops_state(
    service_state: &Value,
    storage_survey: Option<&Value>,
    projects: &Value,
) -> RagOpsState {
    RagOpsState {
        index: service_state.get("index").cloned().unwrap_or(Value::Null),
        qdrant: service_state.get("qdrant").cloned().unwrap_or(Value::Null),
        watcher: service_state.get("watcher").cloned().unwrap_or(Value::Null),
        storage: derive_storage_rollup(storage_survey),
        tenants: projects.clone(),
    }
}

/// Fetch and aggregate the rag-ops snapshot: `/service-state` + `/storage/survey`
/// (bounded, tolerated when 409 in local-only mode) + `/projects`. One brokered
/// call instead of three from the frontend, with the size rollup computed in Rust.
pub fn fetch_rag_ops_state(
    transport: &impl RagTransport,
    project_root: &str,
) -> Result<RagOpsState> {
    let service = service_state(transport, project_root)?;
    // Storage survey is server-mode-only: any survey error (409 local-only, a
    // transient fault) degrades the storage block, never the whole snapshot.
    let survey = storage_survey(transport, Some(RAG_OPS_SURVEY_LIMIT)).ok();
    let projects = projects(transport)?;
    Ok(derive_rag_ops_state(&service, survey.as_ref(), &projects))
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

    #[test]
    fn storage_survey_hits_the_path_with_a_bounded_limit() {
        let t = FakeTransport::returning(vec![r#"{"namespaces":[],"total":0}"#]);
        storage_survey(&t, Some(64)).unwrap();
        assert_eq!(t.calls.borrow()[0].0, "/storage/survey?limit=64");
    }

    #[test]
    fn storage_rollup_sums_points_and_bytes_and_counts_statuses() {
        let survey = json!({
            "namespaces": [
                {"prefix": "raa_", "root": "/a", "status": "live",
                 "points": 100, "footprint_bytes": 2048, "collections": ["raa_vault_docs"]},
                {"prefix": "rbb_", "root": "/b", "status": "live",
                 "points": 50, "footprint_bytes": 1024, "collections": ["rbb_vault_docs"]},
                {"prefix": "rcc_", "root": null, "status": "orphaned",
                 "points": 7, "footprint_bytes": 512, "collections": ["rcc_vault_docs"]},
            ],
            "total": 3, "returned": 3
        });
        let rollup = derive_storage_rollup(Some(&survey));
        assert!(rollup.available);
        assert_eq!(rollup.total_points, 157);
        assert_eq!(rollup.total_footprint_bytes, 3584);
        assert_eq!(rollup.live_count, 2);
        assert_eq!(rollup.orphaned_count, 1);
        assert_eq!(rollup.total_namespaces, 3);
        assert_eq!(rollup.namespaces.len(), 3);
        assert_eq!(rollup.namespaces[2].root, None);
        assert!(
            !rollup.truncated,
            "total == returned, so the rollup is exact, not truncated"
        );
    }

    #[test]
    fn storage_rollup_marks_truncated_when_total_exceeds_returned() {
        // rag reports more namespaces than it returned (bounded at the survey
        // limit): the summed totals cover only the returned slice, so the rollup
        // must flag itself truncated (RCR-002 honesty).
        let survey = json!({
            "namespaces": [
                {"prefix": "raa_", "root": "/a", "status": "live",
                 "points": 100, "footprint_bytes": 2048, "collections": ["raa_vault_docs"]},
            ],
            "total": 200, "returned": 1
        });
        let rollup = derive_storage_rollup(Some(&survey));
        assert!(rollup.available);
        assert_eq!(rollup.total_namespaces, 200);
        assert_eq!(rollup.namespaces.len(), 1);
        assert!(
            rollup.truncated,
            "total (200) > returned (1) → the summed totals are a lower bound"
        );
        // The summed figures are the (partial) first-slice totals, not the machine total.
        assert_eq!(rollup.total_points, 100);
    }

    #[test]
    fn storage_rollup_degrades_when_survey_unavailable() {
        // local-only mode (409) -> survey is None -> the storage block degrades,
        // the rest of the ops-state still serves.
        let rollup = derive_storage_rollup(None);
        assert!(!rollup.available);
        assert_eq!(rollup.total_points, 0);
        assert!(rollup.namespaces.is_empty());
    }

    #[test]
    fn rag_ops_state_forwards_verbatim_blocks_and_computes_storage() {
        let service = json!({
            "index": {"vault_count": 42, "cuda": true},
            "qdrant": {"mode": "server", "version": "1.18.2", "port": 8765, "alive": true},
            "watcher": {"running": true}
        });
        let survey = json!({"namespaces": [
            {"prefix": "rx_", "status": "live", "points": 9, "footprint_bytes": 100}
        ], "total": 1});
        let projects = json!({"projects": [], "max_projects": 4});
        let state = derive_rag_ops_state(&service, Some(&survey), &projects);
        assert_eq!(state.index["vault_count"], 42);
        assert_eq!(state.qdrant["version"], "1.18.2");
        assert_eq!(state.watcher["running"], true);
        assert_eq!(state.tenants["max_projects"], 4);
        assert_eq!(state.storage.total_points, 9);
        assert!(state.storage.available);
    }
}
