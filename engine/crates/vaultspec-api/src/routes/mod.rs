//! Route families (contract §3–§8).

pub mod ops;
pub mod query;
pub mod spa;
pub mod stream;
pub mod temporal;

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};

/// The present-view tier block as JSON (rag truthfully stated) for ONE scope.
///
/// Now reads from the resolved per-scope [`ScopeCell`] (W02.P05): rag discovery
/// is scoped to the cell's root, and the declared tier reflects that cell's
/// last rebuild — so a degraded declared tier is reported per scope, not for a
/// single frozen state.
pub(crate) fn query_tiers(cell: &ScopeCell) -> serde_json::Value {
    let mut unavailable: Vec<(&'static str, String)> = Vec::new();
    // Semantic reflects live rag discovery against THIS scope's root.
    if let rag_client::RagAvailability::Unavailable { reason } =
        rag_client::client::discover(&cell.root.join(".vault")).0
    {
        unavailable.push(("semantic", reason));
    }
    // Declared reflects whether the last rebuild ingested core's graph — the
    // tier never claims availability the index could not build.
    if let Ok(status) = cell.declared_status.read()
        && let Some(reason) = status.as_ref()
    {
        unavailable.push(("declared", reason.clone()));
    }
    let refs: Vec<(&'static str, &str)> =
        unavailable.iter().map(|(t, r)| (*t, r.as_str())).collect();
    serde_json::to_value(engine_query::envelope::tiers_block(&refs)).expect("tiers serialize")
}

/// A tier block carrying an explicit `semantic` degradation reason layered onto
/// the real declared-tier status. Degrade paths (rag down, or a per-request rag
/// failure / shape-miss) know semantic is unavailable for THIS response; they
/// must still report the declared tier truthfully (LENSA-02), so this overlays
/// the cell's declared_status the same way query_tiers() does — never
/// defaulting declared to available.
pub(crate) fn degraded_tiers(cell: &ScopeCell, semantic_reason: &str) -> serde_json::Value {
    let mut unavailable: Vec<(&'static str, String)> =
        vec![("semantic", semantic_reason.to_string())];
    if let Ok(status) = cell.declared_status.read()
        && let Some(reason) = status.as_ref()
    {
        unavailable.push(("declared", reason.clone()));
    }
    let refs: Vec<(&'static str, &str)> =
        unavailable.iter().map(|(t, r)| (*t, r.as_str())).collect();
    serde_json::to_value(engine_query::envelope::tiers_block(&refs)).expect("tiers serialize")
}

/// THE shared success envelope (audit L1, contract §2): every HTTP payload
/// travels as `{data, tiers, next_cursor?}` — the CLI's ok/command/status
/// vocabulary is the CLI's own; HTTP conforms to §2.
pub(crate) fn envelope(data: Value, tiers: Value, next_cursor: Option<String>) -> Json<Value> {
    let mut body = serde_json::Map::new();
    body.insert("data".into(), data);
    body.insert("tiers".into(), tiers);
    if let Some(cursor) = next_cursor {
        body.insert("next_cursor".into(), Value::String(cursor));
    }
    Json(Value::Object(body))
}

/// One canonical scope-token form everywhere (audit L2): absolute worktree
/// path, forward slashes, no Windows extended-length prefix.
pub(crate) fn scope_token(path: &std::path::Path) -> String {
    let s = path.to_string_lossy().replace('\\', "/");
    s.strip_prefix("//?/").unwrap_or(&s).to_string()
}

/// THE shared error response (audit N7, contract §2): every error carries
/// the tiers block too — absence of a tier is data even on failures.
///
/// Error paths may fire BEFORE a per-request scope resolves (e.g. an unknown
/// scope 400), so the tiers come from the always-present ACTIVE-scope cell
/// (W02.P05): the bad-scope 400 still carries an honest tiers block.
pub(crate) fn api_error(
    state: &AppState,
    status: StatusCode,
    message: String,
) -> (StatusCode, Json<Value>) {
    (
        status,
        Json(json!({"error": message, "tiers": query_tiers(&state.active_cell())})),
    )
}

/// Client-safe error for an as-of / diff revision that could not be resolved
/// (the `t` / `from` / `to` inputs and `graph/query`'s `as_of`). The
/// underlying gix error string carries the BUILD MACHINE's cargo-registry
/// path and a source `file:line` — an info leak beyond the served root
/// (stress-test finding 2026-06-13). Never echo it: log the full error for
/// operator diagnostics and return only the input the client supplied plus
/// the accepted forms. Sanitisation lives at the API boundary so the engine's
/// internal error types stay rich.
pub(crate) fn revision_error(
    state: &AppState,
    input: &str,
    err: &engine_graph::IndexError,
) -> (StatusCode, Json<Value>) {
    // A `Revision` error is engine-authored and leak-free — echo it verbatim.
    // This preserves the PRECISE cause (e.g. "timestamp N predates the root
    // commit") instead of the generic fallback below, which self-contradicts
    // when the client DID supply a valid timestamp (sweep LOW, 2026-06-13).
    if let engine_graph::IndexError::Revision(msg) = err {
        return api_error(state, StatusCode::BAD_REQUEST, msg.clone());
    }
    eprintln!("vaultspec serve: could not resolve revision `{input}`: {err}");
    api_error(
        state,
        StatusCode::BAD_REQUEST,
        format!(
            "invalid revision `{input}`: expected a commit-ish (branch, tag, or sha) \
             or a millisecond timestamp"
        ),
    )
}
