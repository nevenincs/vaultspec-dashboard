//! The transparent, whitelisted ops proxies and the search pass-through
//! (contract §6/§8, W03.P11.S53): sibling envelopes verbatim, no engine
//! semantics — the engine is only the server-side hand a browser SPA
//! lacks (D7.5).
//!
//! Rag verbs run through rag's CLI with `--json` (audit N5): the CLI is
//! rag's documented, guaranteed control surface — its loopback HTTP routes
//! are monitoring-only. The whitelist is R1 exactly: service lifecycle,
//! reindex, watcher status/tuning.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use engine_model::{CanonicalKey, node_id};
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// Sibling stdout ceiling (robustness H1, 2026-06-13): a runaway sibling that
/// streams unbounded stdout would OOM the engine. Sibling `--json` envelopes
/// are small; 8 MiB is orders of magnitude of headroom while bounding the
/// pathological case. Output past the cap is a truncated read, surfaced as a
/// 502 degraded envelope rather than buffered to exhaustion.
pub(crate) const SIBLING_STDOUT_CAP: u64 = 8 * 1024 * 1024;

/// Sibling wall-clock ceiling (robustness H1): an unbounded, untimed sibling
/// subprocess is a DoS + zombie vector — a hung CLI pins an async worker
/// forever. 120s covers a cold rag reindex while still bounding a hang; on
/// timeout the child is killed and a 504 degraded envelope is returned.
pub(crate) const SIBLING_TIMEOUT: Duration = Duration::from_secs(120);

/// The read-only `/ops/git` pass-through and changed-files summary reduction were
/// extracted into `routes::git` (2026-07-12) to shrink this module; the router in
/// `lib.rs` still resolves `routes::ops::ops_git` through this re-export so the
/// registration line stays untouched.
pub use super::git::ops_git;

mod sibling;
use sibling::*;

/// The `/ops/a2a/{verb}` orchestration control pass-through to the resident
/// vaultspec-a2a gateway (a2a-orchestration-edge ADR D1/D2), the rag ops
/// template retargeted at an HTTP sibling.
mod a2a;
pub use a2a::ops_a2a;

/// The `/ops/a2a/runs/{run_id}/stream` run-progress relay (a2a-orchestration-edge
/// ADR D3): a new engine SSE channel re-serving the a2a gateway's run-stream verb
/// with the engine's seq + since-replay + gap contract, degrading to run-status
/// polling when the upstream is down.
mod a2a_stream;
pub use a2a_stream::a2a_run_stream;

#[cfg(test)]
mod tests;

pub async fn ops_core(State(state): State<Arc<AppState>>, Path(verb): Path<String>) -> ApiResult {
    let Some((_, args)) = CORE_WHITELIST.iter().find(|(name, _)| *name == verb) else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (R1)"),
        ));
    };
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling(&state, &runner.invocation, args).await?;
    Ok(super::envelope(
        json!({"envelope": envelope}),
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

fn resolve_core_ops_cell(
    state: &AppState,
    scope: Option<&str>,
) -> Result<Arc<ScopeCell>, (StatusCode, Json<Value>)> {
    match scope {
        Some(scope) => crate::registry::get_or_build(state, scope)
            .map_err(|reason| super::api_error(state, StatusCode::BAD_REQUEST, reason)),
        None => Ok(state.active_cell()),
    }
}

/// The typed request body for `POST /ops/core/autofix` (W04.P06.S15): the optional
/// worktree `scope` and the `feature` tag whose documents are repaired. The feature
/// is validated/bounded BEFORE the subprocess spawns (the injection-guard surface).
#[derive(serde::Deserialize, Default)]
pub struct CoreAutofixBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub feature: String,
    /// Preview the repairs without writing (dry-run-discipline): forwards
    /// `--dry-run` so the editor can show what `--fix` WOULD change before it is
    /// applied. A bulk auto-repair should be previewable, not fire-and-forget.
    #[serde(default)]
    pub dry_run: bool,
}

/// POST `/ops/core/autofix` — forward `vault check all --fix --feature <tag>`
/// through the engine broker so the editor's `fixable` conformance advisories can be
/// repaired without exposing the frontend to vaultspec-core. FEATURE-SCOPED (never
/// the whole vault) to bound the blast radius; the watcher re-ingests the fixed docs
/// and the generation bump signals the frontend. The forwarded envelope rides the
/// shared tiers helper like every other op (read-and-infer preserved: the engine
/// invents no fix semantics — it forwards the sibling's repair verb verbatim).
pub async fn ops_core_autofix(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CoreAutofixBody>,
) -> ApiResult {
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;
    let feature = validate_token(&state, "feature", &body.feature)?;
    let mut args: Vec<String> = vec![
        "vault".into(),
        "check".into(),
        "all".into(),
        "--fix".into(),
        "--feature".into(),
        feature,
    ];
    if body.dry_run {
        args.push("--dry-run".into());
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &arg_refs,
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// The typed request body for `POST /ops/core/archive`: the optional worktree
/// `scope`, the `feature` tag whose documents are archived, and an optional
/// `dry_run` preview flag. The feature is validated/bounded BEFORE the subprocess
/// spawns (the injection-guard surface).
#[derive(serde::Deserialize, Default)]
pub struct CoreArchiveBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub feature: String,
    /// Preview the archive without moving anything (vaultspec-archive-discipline):
    /// forwards `--dry-run` so the dashboard can show WHICH documents move and
    /// WHICH incoming cross-feature `related:` links would break BEFORE applying a
    /// feature-wide retirement. The discipline this destructive verb requires.
    #[serde(default)]
    pub dry_run: bool,
}

/// POST `/ops/core/archive` — forward `vault feature archive <tag>` through the
/// engine broker so the dashboard's left rail can archive a completed feature's
/// documents without exposing the frontend to vaultspec-core. FEATURE-SCOPED (the
/// only archive grain vaultspec-core has — there is no per-document archive verb).
/// Read-and-infer preserved: the engine validates and bounds the feature token and
/// forwards the sibling's envelope VERBATIM under `data.envelope`; it persists
/// nothing and grows no archive semantics. A success and a business refusal
/// (`status:"failed"`, e.g. an unknown tag) BOTH ride one HTTP 200 — the client
/// branches on `envelope.status`, never the HTTP code. The watcher re-ingests the
/// moved documents and the generation bump signals the frontend.
pub async fn ops_core_archive(
    State(state): State<Arc<AppState>>,
    Json(body): Json<CoreArchiveBody>,
) -> ApiResult {
    let cell = resolve_core_ops_cell(&state, body.scope.as_deref())?;
    let feature = validate_token(&state, "feature", &body.feature)?;
    let mut args: Vec<String> = vec!["vault".into(), "feature".into(), "archive".into(), feature];
    if body.dry_run {
        args.push("--dry-run".into());
    }
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let runner = ingest_core::runner::CoreRunner::detect();
    let envelope = run_sibling_write_bounded(
        &state,
        &cell,
        &runner.invocation,
        &arg_refs,
        None,
        SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

/// Validate a bounded kebab/word token (`feature`) for the retained
/// vault-maintenance ops (`/ops/core/autofix`, `/ops/core/archive`):
/// non-empty, not flag-shaped (no leading `-` — the injection vector), and
/// restricted to the kebab/word grammar `[A-Za-z0-9_-]+` so it can never
/// carry a path separator, whitespace, or shell-meaningful character into
/// the sibling argv. The named `field` is woven into the error message.
fn validate_token(
    state: &AppState,
    field: &str,
    token: &str,
) -> Result<String, (StatusCode, Json<Value>)> {
    let ok = !token.is_empty()
        && !token.starts_with('-')
        && token
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !ok {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}` `{token}` must be a non-empty kebab/word token \
                 (letters, digits, `-`, `_`; no leading `-`)"
            ),
        ));
    }
    Ok(token.to_string())
}

// --- /ops/rag/* brokering (rag-control-plane ADR D1/D2) ----------------------
//
// One namespace, two transports: GET reads + POST controls go over rag's HTTP
// service through `rag_client::control` (rag owns its runtime truth, indexing is
// job-based); POST process-lifecycle verbs stay the bounded CLI runner. Every
// response — success, rag-down degradation, and validation error — carries the
// `tiers` block through the shared envelope helper, and rag's envelope passes
// through VERBATIM under `data.envelope` (engine-read-and-infer: zero rag
// semantics; the engine validates, bounds, and forwards).

/// The optional request body for a POST `/ops/rag/{verb}` control verb. Absent
/// for the lifecycle verbs and `quality`. Every field is validated/bounded
/// before it reaches rag (P02.S12); the reindex/watcher `project_root`/`root`
/// is the ENGINE-controlled active scope root unless an explicit evict target
/// is named, so the frontend can never point rag at an arbitrary path through
/// reindex or the watcher.
#[derive(serde::Deserialize, Default)]
pub struct RagControlBody {
    #[serde(default)]
    pub clean: Option<bool>,
    #[serde(default, rename = "type")]
    pub reindex_type: Option<String>,
    #[serde(default)]
    pub initiator_kind: Option<String>,
    #[serde(default)]
    pub debounce_ms: Option<u64>,
    #[serde(default)]
    pub cooldown_s: Option<f64>,
    /// The evict target root (for `project-evict`). Other control verbs operate
    /// on the active scope root and ignore this.
    #[serde(default)]
    pub root: Option<String>,
    /// `server-start` only (D5 arg pass-through): use rag's on-disk local-only
    /// backend (no managed Qdrant) — the only workable backend on CI/offline/
    /// air-gapped hosts. Ignored by every other verb.
    #[serde(default)]
    pub local_only: Option<bool>,
    /// `server-start` only: the service port to bind (bounded, non-privileged).
    #[serde(default)]
    pub port: Option<u16>,
    /// `server-start` only: download the managed Qdrant binary if it is missing,
    /// rather than failing with a needs-install hint.
    #[serde(default)]
    pub qdrant_auto_provision: Option<bool>,
}

/// Watcher debounce ceiling: 10 minutes. A larger value is almost certainly a
/// client bug (ms vs s confusion) and would make the watcher feel dead.
const MAX_WATCH_DEBOUNCE_MS: u64 = 600_000;
/// Watcher cooldown ceiling: 1 hour.
const MAX_WATCH_COOLDOWN_S: f64 = 3_600.0;
/// Brokered rag job snapshots are an activity strip, not an unbounded audit log.
const MAX_RAG_JOBS_LIMIT: u32 = 50;
/// Brokered rag log reads are diagnostic snippets, never an unbounded log stream.
const MAX_RAG_LOG_LINES: u32 = 500;

fn bounded_rag_read_u32(params: &HashMap<String, String>, key: &str, max: u32) -> Option<u32> {
    params
        .get(key)
        .and_then(|value| value.parse::<u32>().ok())
        .map(|value| value.min(max))
}

/// Discover rag and build a bounded control transport to its SERVICE port with
/// `budget` as the per-verb wall-clock, or the truthful "rag unavailable"
/// reason. Degradation is read from discovery (`degradation-is-read-from-tiers`),
/// never guessed from a transport error: a missing/stale `service.json` is the
/// honest "semantic tier down" fact.
fn rag_control_transport(
    cell: &ScopeCell,
    budget: Duration,
) -> Result<rag_client::client::LoopbackTransport, String> {
    match rag_client::client::discover(&cell.root.join(".vault")) {
        (rag_client::RagAvailability::Available, Some(info)) => {
            Ok(rag_client::client::LoopbackTransport {
                port: info.port,
                bearer: info.service_token,
                timeout: budget,
            })
        }
        (rag_client::RagAvailability::Unavailable { reason }, _) => Err(reason),
        _ => Err("rag service discovery returned no service info".to_string()),
    }
}

/// Wrap a brokered rag control result in the shared envelope: rag's value passes
/// through VERBATIM under `data.envelope` with the live tiers block on success;
/// a rag transport/shape fault degrades the `semantic` tier with an empty
/// envelope (never a hard 5xx — the control plane reads degraded state from the
/// tiers block, not an error).
fn brokered_envelope(cell: &ScopeCell, result: rag_client::client::Result<Value>) -> Json<Value> {
    match result {
        Ok(value) => super::envelope(json!({ "envelope": value }), super::query_tiers(cell), None),
        Err(e) => {
            let reason = rag_client::search::degradation_reason(&e);
            super::envelope(
                json!({ "envelope": Value::Null }),
                super::degraded_tiers(cell, reason.as_str()),
                None,
            )
        }
    }
}

/// Offload a blocking rag transport call chain onto the blocking pool (RCR-001).
/// The rag loopback transport is synchronous `std::net` I/O — bounded by a socket
/// timeout + the `MAX_RAG_BODY` cap — but running it DIRECTLY on a Tokio async
/// worker lets a burst of slow/stalled rag reads pin every worker and stall the
/// whole engine (every route, not just rag) up to the largest in-flight budget.
/// The closure OWNS its transport + args; a task join failure (a panic in the
/// blocking call) surfaces as a 500 through the shared error helper. Mirrors the
/// `spawn_blocking` discipline already used for the code-corpus + declared folds.
async fn rag_offload<T: Send + 'static>(
    state: &AppState,
    f: impl FnOnce() -> T + Send + 'static,
) -> Result<T, (StatusCode, Json<Value>)> {
    tokio::task::spawn_blocking(f).await.map_err(|e| {
        super::api_error(
            state,
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("rag read task failed: {e}"),
        )
    })
}

/// GET `/ops/rag/collection-health?collection=<name>` — Tier-2 Qdrant-native
/// health (rag-service-management D6 / W02.P05). Reads Qdrant's documented
/// `GET /collections/{name}` DIRECTLY on its loopback port, but GATED on the
/// Qdrant version reported by rag's `/health`: an unknown/unsupported Qdrant major
/// degrades honestly (`supported:false`, version stated) instead of risking the
/// silent break a rag-side Qdrant change could cause. The collection name is
/// supplied by the caller (sourced from the storage survey) and validated as a
/// single path segment (injection guard). Returns the optimizer/segment/
/// indexed-vs-total health the operations console reads as the "needs repair"
/// signal.
async fn rag_collection_health(
    state: &AppState,
    cell: &ScopeCell,
    params: &HashMap<String, String>,
) -> ApiResult {
    // Validate the collection name as a single, conservative path segment.
    let collection = match params.get("collection") {
        Some(c)
            if !c.is_empty()
                && c.len() <= 256
                && c.chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-') =>
        {
            c.as_str()
        }
        _ => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                "collection-health requires a `collection` query param (alphanumeric, `_`, `-`; <=256 chars)".to_string(),
            ));
        }
    };
    // Qdrant health is only meaningful when rag is running (rag owns Qdrant). The
    // /health probe is blocking socket I/O — offload it (RCR-001).
    let vault = cell.root.join(".vault");
    let probe = rag_offload(state, move || {
        rag_client::client::probe_machine_state(&vault, RAG_LIFECYCLE_HEALTH_TIMEOUT)
    })
    .await?;
    let rag_client::client::RagMachineState::Running { info, health } = probe else {
        return Ok(super::envelope(
            json!({ "envelope": { "supported": false, "reason": "rag service is not running" } }),
            super::degraded_tiers(cell, "rag service is not running (no Qdrant)"),
            None,
        ));
    };
    let version = health.qdrant.as_ref().and_then(|q| q.version.as_deref());
    // Capability/version gate (D6): fail closed on an unrecognized Qdrant major.
    if !rag_client::vectors::qdrant_collection_api_supported(version) {
        return Ok(super::envelope(
            json!({ "envelope": {
                "supported": false,
                "qdrant_version": version,
                "reason": "Qdrant version is not a recognized 1.x; Tier-2 health degraded",
            }}),
            super::query_tiers(cell),
            None,
        ));
    }
    // Reachability gate: in local-only mode there is no Qdrant HTTP endpoint, so a
    // direct read would dial a port nothing listens on. Report `supported:false`
    // honestly with a clear reason rather than degrading on a connection refusal.
    if !health.qdrant.as_ref().is_some_and(|q| q.http_reachable()) {
        return Ok(super::envelope(
            json!({ "envelope": {
                "supported": false,
                "qdrant_version": version,
                "reason": "Qdrant has no HTTP endpoint (local-only mode); Tier-2 health needs server mode",
            }}),
            super::query_tiers(cell),
            None,
        ));
    }
    // Supported: read Qdrant's collection-info directly on its loopback port.
    let transport = rag_client::client::LoopbackTransport {
        port: info.qdrant_port(),
        bearer: None,
        timeout: rag_client::control::READ_BUDGET,
    };
    // Direct Qdrant collection read — blocking socket I/O, offload it (RCR-001).
    // The cheap `.map` result shaping stays on the async thread.
    let collection_owned = collection.to_string();
    let health = rag_offload(state, move || {
        rag_client::vectors::read_collection_health(&transport, &collection_owned)
    })
    .await?;
    let result = health.map(|h| {
        json!({
            "supported": true,
            "qdrant_version": version,
            "collection": collection,
            "health": h,
        })
    });
    Ok(brokered_envelope(cell, result))
}

/// GET `/ops/rag/{verb}` — the brokered rag READ verbs (rag-control-plane ADR
/// D2): service-state, jobs, watcher, projects, readiness, logs, metrics. Each
/// is a bounded HTTP read of rag's resident service, forwarded verbatim with the
/// tiers block. A read against a down rag degrades the semantic tier honestly;
/// an unknown verb 403s before any round-trip.
/// The brokered rag GET read verbs (rag-control-plane ADR D2).
const RAG_READ_VERBS: &[&str] = &[
    "service-state",
    "jobs",
    "watcher",
    "projects",
    "readiness",
    "logs",
    "metrics",
    // The Rust-aggregated size/state snapshot (one call vs six) and the raw
    // per-namespace storage survey (orphan/size detail).
    "ops-state",
    "storage-survey",
    // Tier-2 Qdrant-native collection health (optimizer/segments/indexed), gated
    // on the Qdrant version — the "needs repair" signal rag does not expose.
    "collection-health",
];

/// Storage-survey namespace ceiling for the raw `storage-survey` read verb (the
/// aggregated `ops-state` uses its own bounded survey limit).
const MAX_RAG_SURVEY_LIMIT: u32 = 256;

pub async fn ops_rag_get(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> ApiResult {
    // An unknown read verb 403s BEFORE any discovery or round-trip — the tiers
    // block rides the 403 through the shared error helper.
    if !RAG_READ_VERBS.contains(&verb.as_str()) {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("rag read verb `{verb}` is not brokered (GET /ops/rag)"),
        ));
    }
    let cell = state.active_cell();
    let project_root = cell.root.to_string_lossy().to_string();

    // collection-health is a Tier-2 Qdrant-native read on a DIFFERENT transport
    // (Qdrant's loopback port) gated on the Qdrant version, so it handles its own
    // discovery + transport rather than the standard rag-service one below.
    if verb == "collection-health" {
        return rag_collection_health(&state, &cell, &params).await;
    }

    // Per-verb wall-clock budget (ADR honest difficulty: a fast `/jobs` poll and
    // a slow `/quality` probe need different bounds). Reads are fast — except the
    // survey-bearing aggregates: rag's `/storage/survey` walks the machine store's
    // disk footprints and takes 10s+ on a namespace-heavy store, so those two
    // verbs get the wider survey budget instead of failing the storage rollup
    // closed on every well-populated machine.
    let budget = match verb.as_str() {
        "ops-state" | "storage-survey" => rag_client::control::SURVEY_BUDGET,
        _ => rag_client::control::READ_BUDGET,
    };
    let transport = match rag_control_transport(&cell, budget) {
        Ok(t) => t,
        // rag down/absent: every read degrades to the tier block, never a 5xx.
        Err(reason) => {
            return Ok(super::envelope(
                json!({ "envelope": Value::Null }),
                super::degraded_tiers(&cell, reason.as_str()),
                None,
            ));
        }
    };

    let job_id = params.get("job_id").cloned();
    let limit = bounded_rag_read_u32(&params, "limit", MAX_RAG_JOBS_LIMIT);
    let lines = bounded_rag_read_u32(&params, "lines", MAX_RAG_LOG_LINES);
    let survey_limit = bounded_rag_read_u32(&params, "limit", MAX_RAG_SURVEY_LIMIT);

    // Offload the blocking transport reads onto the blocking pool (RCR-001): the
    // closure owns the transport + args so a slow/stalled read cannot pin a worker.
    let result = rag_offload(&state, move || {
        use rag_client::control;
        match verb.as_str() {
            "service-state" => control::service_state(&transport, &project_root),
            "jobs" => control::jobs(&transport, job_id.as_deref(), limit),
            "watcher" => control::watcher_get(&transport, &project_root),
            "projects" => control::projects(&transport),
            "readiness" => control::readiness(&transport),
            "logs" => control::logs(&transport, lines, job_id.as_deref()),
            // Prometheus text is not JSON; forward it verbatim under a string field.
            "metrics" => control::metrics(&transport).map(|text| json!({ "metrics": text })),
            "storage-survey" => control::storage_survey(&transport, survey_limit),
            // The Rust-aggregated size/state snapshot: fetch + derive, then serialize.
            "ops-state" => control::fetch_rag_ops_state(&transport, &project_root)
                .and_then(|state| serde_json::to_value(state).map_err(Into::into)),
            _ => unreachable!("RAG_READ_VERBS membership is checked above"),
        }
    })
    .await?;
    Ok(brokered_envelope(&cell, result))
}

/// POST `/ops/rag/{verb}` — the brokered rag CONTROL verbs over HTTP (reindex,
/// watcher start/stop/reconfigure, project-evict, quality) and, falling through,
/// the PROCESS-LIFECYCLE verbs on the bounded CLI runner (server start/stop/
/// status/doctor/install). HTTP control args are validated against rag's
/// vocabulary and bounded before forwarding (P02.S12); rag's envelope passes
/// through verbatim with the tiers block.
pub async fn ops_rag(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: Option<Json<RagControlBody>>,
) -> ApiResult {
    let cell = state.active_cell();
    let project_root = cell.root.to_string_lossy().to_string();
    let body = body.map(|Json(b)| b).unwrap_or_default();

    use rag_client::control;

    // HTTP-brokered control verbs (rag's runtime truth, job-based reindex). Each
    // is validated, then forwarded over the bounded control transport.
    let http_verb = matches!(
        verb.as_str(),
        "reindex"
            | "watcher-start"
            | "watcher-stop"
            | "watcher-reconfigure"
            | "project-evict"
            | "quality"
    );
    if http_verb {
        // Validate args BEFORE building the transport so a bad value is a
        // tiers-carrying 400 that never reaches rag (mirrors the search target
        // guard). The dash-prefix guard closes the flag-injection vector.
        let reindex_type = match body.reindex_type.as_deref() {
            None => "vault",
            Some(t @ ("vault" | "code")) => t,
            Some(other) => {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!("reindex `type` `{other}` must be `vault` or `code`"),
                ));
            }
        };
        let initiator_kind = match body.initiator_kind.as_deref() {
            None => "service",
            Some(k @ ("cli" | "mcp" | "service" | "watcher")) => k,
            Some(other) => {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!(
                        "reindex `initiator_kind` `{other}` must be one of cli, mcp, service, watcher"
                    ),
                ));
            }
        };
        if let Some(ms) = body.debounce_ms
            && ms > MAX_WATCH_DEBOUNCE_MS
        {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!(
                    "watcher `debounce_ms` {ms} exceeds the {MAX_WATCH_DEBOUNCE_MS} ms ceiling"
                ),
            ));
        }
        if let Some(s) = body.cooldown_s
            && !(0.0..=MAX_WATCH_COOLDOWN_S).contains(&s)
        {
            return Err(super::api_error(
                &state,
                StatusCode::BAD_REQUEST,
                format!("watcher `cooldown_s` {s} must be within 0..={MAX_WATCH_COOLDOWN_S}"),
            ));
        }
        // The evict target: an explicit body root (a listed project), or the
        // active scope. A dash-prefixed value is rejected as a flag-injection
        // guard, mirroring the diff-path/rev guards.
        let evict_root = match body.root.as_deref() {
            Some(r) if r.starts_with('-') || r.is_empty() => {
                return Err(super::api_error(
                    &state,
                    StatusCode::BAD_REQUEST,
                    format!("evict `root` `{r}` must be a non-empty path (no leading `-`)"),
                ));
            }
            Some(r) => r.to_string(),
            None => project_root.clone(),
        };

        let budget = match verb.as_str() {
            "quality" => control::QUALITY_BUDGET,
            _ => control::CONTROL_BUDGET,
        };
        let transport = match rag_control_transport(&cell, budget) {
            Ok(t) => t,
            Err(reason) => {
                return Ok(super::envelope(
                    json!({ "envelope": Value::Null }),
                    super::degraded_tiers(&cell, reason.as_str()),
                    None,
                ));
            }
        };
        // Offload the blocking control round-trip onto the blocking pool (RCR-001):
        // the closure owns the transport + owned copies of the validated args, so a
        // slow rag control call cannot pin an async worker — matters most for
        // `/quality` (a 60s budget) that several concurrent panels can trigger.
        let reindex_type = reindex_type.to_string();
        let initiator_kind = initiator_kind.to_string();
        let clean = body.clean.unwrap_or(false);
        let debounce_ms = body.debounce_ms;
        let cooldown_s = body.cooldown_s;
        let project_root = project_root.clone();
        let verb_owned = verb.clone();
        let result = rag_offload(&state, move || match verb_owned.as_str() {
            "reindex" => control::reindex(
                &transport,
                &control::ReindexArgs {
                    project_root: &project_root,
                    reindex_type: &reindex_type,
                    clean,
                    initiator_kind: &initiator_kind,
                },
            ),
            "watcher-start" => control::watcher_start(&transport, &project_root),
            "watcher-stop" => control::watcher_stop(&transport, &project_root),
            "watcher-reconfigure" => {
                control::watcher_reconfigure(&transport, &project_root, debounce_ms, cooldown_s)
            }
            "project-evict" => control::projects_evict(&transport, &evict_root),
            "quality" => control::quality(&transport),
            _ => unreachable!("http_verb set guards the match"),
        })
        .await?;
        return Ok(brokered_envelope(&cell, result));
    }

    // Process-lifecycle verbs (a dead service cannot be reached over HTTP, ADR
    // D1). server-start/stop carry the machine-singleton attach-never-own
    // discipline through their dedicated capture handlers: start appends `--json`
    // VERSION-TOLERANTLY (retrying without it when an older rag exits 2 rejecting
    // the option, per `rag_rejected_json`), stop carries no `--json`.
    // status/doctor/install apply the SAME version-tolerant --json retry via
    // `run_sibling_version_tolerant` (ADR D5 / T1-R1), closing the residual where
    // a future rag dropping --json on these verbs would 502 loudly.
    match verb.as_str() {
        "server-start" => start_rag_service(&state, &cell, &body).await,
        "server-stop" => stop_rag_service(&state, &cell).await,
        "server-status" | "server-doctor" | "server-install" => {
            let (_, args) = RAG_CLI_WHITELIST
                .iter()
                .find(|(name, _)| *name == verb)
                .expect("verb is in the version-tolerant lifecycle set");
            let envelope = run_sibling_version_tolerant(&state, &rag_invocation(), args).await?;
            Ok(super::envelope(
                json!({ "envelope": envelope }),
                super::query_tiers(&cell),
                None,
            ))
        }
        _ => Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (rag control plane)"),
        )),
    }
}

/// POST `/ops/rag/storage/{verb}` — the DESTRUCTIVE rag storage broker
/// (rag-storage-broker ADR): `storage-delete`/`storage-prune`/`storage-migrate` run
/// on the bounded CLI subprocess runner (rag exposes them CLI-only), with their
/// arguments validated before the spawn and the dry-run-default/explicit-apply gate
/// applied. A non-whitelisted verb 403s before any subprocess; a malformed argument
/// 400s; rag's `{ok, command, ...}` envelope (including a `would_remove` preview that
/// exits 1) forwards verbatim with the tiers block, and only a genuine
/// spawn/timeout/crash degrades to a gateway error. delete/prune are MACHINE-scoped
/// (no `project_root` derivation); migrate sources its root from the active cell. The
/// engine forwards a validated request to the sibling that OWNS the destructive op and
/// decides no storage policy of its own (`engine-read-and-infer`).
pub async fn ops_rag_storage(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: Option<Json<RagStorageBody>>,
) -> ApiResult {
    let Some((_, fixed)) = RAG_STORAGE_CLI_WHITELIST
        .iter()
        .find(|(name, _)| *name == verb)
    else {
        return Err(super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("storage verb `{verb}` is not whitelisted (rag storage broker)"),
        ));
    };
    let cell = state.active_cell();
    let cell_root = cell.root.to_string_lossy().to_string();
    let body = body.map(|Json(b)| b).unwrap_or_default();
    let args = storage_args_for(&state, &verb, fixed, &cell_root, &body)?;
    let envelope = run_storage_sibling_bounded(
        &state,
        &cell.root,
        &rag_invocation(),
        &args,
        STORAGE_SIBLING_TIMEOUT,
        SIBLING_STDOUT_CAP,
    )
    .await?;
    Ok(super::envelope(
        json!({ "envelope": envelope }),
        super::query_tiers(&cell),
        None,
    ))
}

#[derive(serde::Deserialize)]
pub struct SearchBody {
    #[serde(default)]
    pub scope: Option<String>,
    pub query: String,
    /// `vault` or `code` (rag's vocabulary, forwarded intact).
    #[serde(default, rename = "type")]
    pub target: Option<String>,
    #[serde(default)]
    pub max_results: Option<u32>,
}

/// Validate every user-controlled search argument and build rag's HTTP `/search`
/// request body. The API is a public boundary, so the bounds are enforced here
/// BEFORE anything reaches rag: non-empty query, `MAX_SEARCH_QUERY_CHARS`, the
/// `{vault, code}` target whitelist, and the `MAX_SEARCH_RESULTS` ceiling. The
/// engine's `{vault, code}` target vocabulary maps to rag's `{vault, codebase}`
/// type (rag routes any non-`vault` type to the codebase corpus; the engine
/// sends `codebase` explicitly). `project_root` is the engine-controlled scope
/// root — REQUIRED by rag and never client-supplied, so a caller can never point
/// rag at an arbitrary path. `max_results` maps to rag's `top_k`; absent, rag
/// uses its own default.
fn search_body_for(
    state: &AppState,
    body: &SearchBody,
    project_root: &str,
) -> Result<Value, (StatusCode, Json<Value>)> {
    let query = body.query.trim();
    if query.is_empty() {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            "search query must not be empty".to_string(),
        ));
    }
    if query.chars().count() > MAX_SEARCH_QUERY_CHARS {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("search query exceeds the {MAX_SEARCH_QUERY_CHARS} character ceiling"),
        ));
    }
    // Map the engine's target vocabulary to rag's `type`, folding the whitelist
    // check into the mapping: `vault` (and an absent target, matching the app
    // default) → `vault`; `code` → `codebase`.
    let rag_type = match body.target.as_deref() {
        None | Some("vault") => "vault",
        Some("code") => "codebase",
        Some(other) => {
            return Err(super::api_error(
                state,
                StatusCode::BAD_REQUEST,
                format!("search target `{other}` must be `vault` or `code`"),
            ));
        }
    };
    if let Some(max_results) = body.max_results
        && max_results > MAX_SEARCH_RESULTS
    {
        return Err(super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "search `max_results` {max_results} exceeds the {MAX_SEARCH_RESULTS} result ceiling"
            ),
        ));
    }

    let mut rag_body = json!({
        "query": query,
        "type": rag_type,
        "project_root": project_root,
    });
    if let Some(n) = body.max_results {
        rag_body["top_k"] = json!(n);
    }
    Ok(rag_body)
}

pub async fn search(State(state): State<Arc<AppState>>, Json(body): Json<SearchBody>) -> ApiResult {
    // Search is scoped by the frontend query key/body; absent scope preserves the
    // older active-cell behavior for external callers.
    let cell = match body.scope.as_deref() {
        Some(scope) => crate::registry::get_or_build(&state, scope)
            .map_err(|reason| super::api_error(&state, StatusCode::BAD_REQUEST, reason))?,
        None => state.active_cell(),
    };
    // Validate and bound every user-controlled search argument BEFORE anything
    // reaches rag, and build rag's HTTP `/search` body. These guards keep query
    // size, result count, and target vocabulary inside the API contract.
    let project_root = cell.root.to_string_lossy().to_string();
    let rag_body = search_body_for(&state, &body, &project_root)?;

    // Build the bounded loopback transport to the resident rag service (D1).
    // Discovery is the availability gate: a missing/stale service.json is the
    // honest "semantic tier down" fact — degrade to the tier block with empty
    // results, never a dead control (contract §8, degradation-is-read-from-tiers).
    let transport = match rag_control_transport(&cell, SEARCH_HTTP_BUDGET) {
        Ok(t) => t,
        Err(reason) => {
            return Ok(super::envelope(
                json!({"results": []}),
                super::degraded_tiers(&cell, reason.as_str()),
                None,
            ));
        }
    };

    // POST to rag's `/search` over the resident service, offloaded onto the
    // blocking pool (RCR-001) so a slow search never pins an async worker. A
    // transport fault (service down mid-flight, timeout, unreadable body) must
    // DEGRADE the semantic tier here via the truthful degradation reason, never a
    // hard 502/504: search is a degradable surface (contract §8) while the rest
    // of the engine stays fully available.
    let rag_envelope = match rag_offload(&state, move || {
        rag_client::search::http_search(&transport, &rag_body)
    })
    .await?
    {
        Ok(envelope) => envelope,
        Err(e) => {
            let reason = rag_client::search::degradation_reason(&e);
            return Ok(super::envelope(
                json!({"results": []}),
                super::degraded_tiers(&cell, reason.as_str()),
                None,
            ));
        }
    };

    // The shared D4 freshness epoch rides the annotated envelope (D3). Served from
    // the short-TTL cache ONLY — never a second blocking `/jobs` round-trip on the
    // search path: a warm slot annotates the epoch, a cold/expired slot annotates
    // an honest absent marker (null). The `/graph/embeddings` poll keeps the slot
    // warm, so both planes share one invalidation key without taxing every search.
    let semantic_epoch = state.semantic_epoch_cache.fresh();

    // Flatten rag's envelope to the contract §2 shape and annotate each hit
    // with its engine node id (§8 value-add) plus the freshness epoch. A shape
    // miss degrades the `semantic` tier truthfully — never a healthy-looking empty
    // result and never a foreign envelope passed through unflattened.
    match flatten_and_annotate(&rag_envelope, semantic_epoch) {
        Ok(data) => Ok(super::envelope(data, super::query_tiers(&cell), None)),
        Err(miss) => {
            let reason = miss.reason();
            Ok(super::envelope(
                json!({"results": []}),
                super::degraded_tiers(&cell, reason.as_str()),
                None,
            ))
        }
    }
}

/// A rag search hit in rag's real HTTP `/search` result shape (verified live
/// against rag 0.2.28). The engine reads only the fields it needs to derive the
/// click-through node id; every field of the original hit passes through to the
/// client verbatim (the hit travels as its JSON `Value`).
///
/// The trap this shape documents: `source` is the search-type DISCRIMINATOR
/// (`vault` for docs, `codebase` — historically `code` — for code), NOT a path.
/// The path lives in `path` (with code symbols in `function_name` /
/// `class_name`). An earlier annotation read `source` as a path and mis-derived
/// every id; a later one matched only `code` and null-id'd every live `codebase`
/// hit.
#[derive(Debug, Default, serde::Deserialize)]
struct RagHitShape {
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    source_path: Option<String>,
    #[serde(default)]
    function_name: Option<String>,
    #[serde(default)]
    class_name: Option<String>,
}

/// Derive the engine node id a rag hit clicks through to, or `None` on a
/// typed miss — shape drift where the discriminator is unknown/absent, or the
/// path the discriminator requires is missing. A miss is annotated as an
/// explicit `null`, never a dropped or guessed id.
fn hit_node_id(hit: &RagHitShape) -> Option<String> {
    match hit.source.as_deref() {
        Some("vault") => {
            let path = hit.path.as_deref()?;
            let file = path.rsplit(['/', '\\']).next().unwrap_or(path);
            let stem = file.strip_suffix(".md").unwrap_or(file);
            Some(node_id(&CanonicalKey::Document { stem }).0)
        }
        // The live rag service emits `codebase` for the code corpus; an older
        // recorded fixture used `code`. Accept both so a code hit always clicks
        // through (a `code`-only match silently null-ids every live code result).
        Some("code") | Some("codebase") => {
            let path = hit.path.as_deref().or(hit.source_path.as_deref())?;
            let symbol = hit.function_name.as_deref().or(hit.class_name.as_deref());
            Some(node_id(&CanonicalKey::CodeArtifact { path, symbol }).0)
        }
        _ => None,
    }
}

/// A typed miss reading rag's flat search envelope: the 2xx response did not
/// carry the top-level `results` list the contract §8 pass-through requires.
/// A rag HTTP-level failure never reaches here — the loopback transport maps a
/// non-2xx status to a typed error the handler degrades on before annotation.
/// Surfaced as a `semantic`-tier degradation so the client never reads a shape
/// drift as a healthy empty result.
#[derive(Debug)]
enum SearchShapeMiss {
    NoResults,
}

impl SearchShapeMiss {
    fn reason(&self) -> String {
        match self {
            SearchShapeMiss::NoResults => {
                // rag answered 2xx but the body carried no `results` list: most
                // often the scope is not yet indexed, otherwise a genuine
                // response-shape drift. An empty `results` array is NOT this
                // case — it is a healthy zero-match success.
                "rag returned no results payload (scope unindexed, or response shape drift)"
                    .to_string()
            }
        }
    }
}

/// Annotate rag's FLAT search envelope (rag-integration-hardening D1/D3): each
/// hit in the top-level `results` list gains the engine's node-id value-add, and
/// the envelope gains the shared D4 `semantic_epoch`; every other field of the
/// flat envelope (`request_id`, `summary`, `timing`, `index_state`, ...) — rag's
/// native freshness block `index_state` included — passes through verbatim. rag's
/// HTTP `/search` response is already flat (no nested `{ok, command, data}`
/// wrapper to strip), so this annotates in place. `semantic_epoch` is `Some` when
/// the shared cache served a warm epoch and `None` (annotated as an explicit
/// `null` — freshness unknown, never a fabricated `0`) when the slot was
/// cold/failed. A 2xx response missing the `results` list is a typed shape miss
/// the caller degrades the `semantic` tier on.
fn flatten_and_annotate(
    rag: &Value,
    semantic_epoch: Option<u64>,
) -> Result<Value, SearchShapeMiss> {
    let results = rag
        .get("results")
        .and_then(Value::as_array)
        .ok_or(SearchShapeMiss::NoResults)?;

    let annotated: Vec<Value> = results
        .iter()
        .map(|hit| {
            let nid = serde_json::from_value::<RagHitShape>(hit.clone())
                .ok()
                .and_then(|shape| hit_node_id(&shape));
            let mut hit = hit.clone();
            if let Some(obj) = hit.as_object_mut() {
                obj.insert(
                    "node_id".to_string(),
                    nid.map(Value::String).unwrap_or(Value::Null),
                );
            }
            hit
        })
        .collect();

    let mut out = rag.clone();
    out["results"] = Value::Array(annotated);
    // Engine value-add (D3): the shared D4 semantic epoch rides the annotated
    // envelope so downstream builds key one invalidation across search AND
    // embeddings. `None` (a cold/failed epoch read) annotates an explicit `null` —
    // freshness unknown — never a fabricated `0`. rag's own `index_state` and every
    // other flat field passed through verbatim in the `rag.clone()` above.
    out["semantic_epoch"] = semantic_epoch.map(|e| json!(e)).unwrap_or(Value::Null);
    Ok(out)
}
