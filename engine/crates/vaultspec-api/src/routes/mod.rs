//! Route families (contract §3–§8).

pub mod a2a_lifecycle;
pub mod a2a_settlement;
pub mod code_files;
pub mod content;
pub mod file_tree;
pub mod fs_browse;
pub mod git;
pub mod github;
pub mod graph;
pub mod history;
pub mod lifecycle;
pub mod ops;
pub mod provision;
pub mod query;
pub mod registry;
pub mod session;
pub mod spa;
pub mod state;
pub mod stream;
pub mod temporal;
pub mod vault_tree;

use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell};

/// The present-view tier block as JSON (rag truthfully stated) for ONE scope.
///
/// Now reads from the resolved per-scope [`ScopeCell`]: rag discovery
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
    tiers_value(&unavailable)
}

/// Tiers block for the DEMO `error` condition: every backing tier reported down
/// with a stated reason.
///
/// The review desk needs the application's real degraded rendering, and the wire
/// contract is explicit that a client derives degradation from the `tiers` block and
/// NEVER from a bare transport failure. So a simulated outage has to arrive as a
/// truthful-shaped envelope with tiers actually marked down — not as a naked 5xx the
/// client is required to ignore.
pub(crate) fn demo_degraded_tiers() -> serde_json::Value {
    tiers_value(&[
        ("declared", "demo: simulated backend outage".to_string()),
        ("semantic", "demo: simulated backend outage".to_string()),
    ])
}

/// Tiers block for the DEMO `normal` condition: every tier reported available.
///
/// A demo host rarely has rag running or the a2a authority verifiable, so the truthful
/// block reports those down and every surface renders degraded — leaving the review
/// desk unable to show a healthy state at all. `normal` therefore asserts health as
/// deliberately as `error` asserts failure.
pub(crate) fn demo_healthy_tiers() -> serde_json::Value {
    let mut tiers = tiers_value(&[]);
    // `tiers_value` overlays the REAL agent-orchestration state after building, so an
    // empty unavailable-list still reports `agent` down on a host with no gateway.
    // Force it available here — otherwise the "healthy" condition ships one tier that
    // is still degraded, which is precisely the confusion this condition exists to
    // remove.
    if let Some(agent) = tiers.get_mut("agent").and_then(|v| v.as_object_mut()) {
        agent.insert("available".to_string(), serde_json::Value::Bool(true));
        agent.insert("reason".to_string(), serde_json::Value::Null);
    }
    tiers
}

/// Serialize a tiers block and decorate it with the component compatibility
/// handshake: every served tiers block — success and
/// error, all three degradation builders — carries the declared floors and
/// probed versions, so clients read component compatibility from the one
/// envelope they already trust.
fn tiers_value(unavailable: &[(&'static str, String)]) -> serde_json::Value {
    let refs: Vec<(&'static str, &str)> =
        unavailable.iter().map(|(t, r)| (*t, r.as_str())).collect();
    let mut tiers =
        serde_json::to_value(engine_query::envelope::tiers_block(&refs)).expect("tiers serialize");
    // Overlay the REAL agent-orchestration state onto the degraded-honest seed:
    // the engine-query base seeds `agent`
    // unavailable so absence can never masquerade as availability; here the
    // product controller's machine-global classification flips it to available
    // when a usable gateway is live, or replaces the reason with the truthful
    // one. An explicit `agent` degradation passed by a caller (the a2a
    // pass-through) is authoritative and is never overwritten.
    if !unavailable.iter().any(|(t, _)| *t == "agent") {
        let (available, reason) = a2a_lifecycle::resolve_agent_tier();
        if let Some(obj) = tiers.as_object_mut() {
            let mut agent = serde_json::Map::new();
            agent.insert("available".into(), Value::Bool(available));
            if let Some(reason) = reason {
                agent.insert("reason".into(), Value::String(reason));
            }
            obj.insert("agent".into(), Value::Object(agent));
        }
    }
    crate::handshake::decorate_tiers(&mut tiers);
    tiers
}

/// A tier block carrying an explicit `semantic` degradation reason layered onto
/// the real declared-tier status. Degrade paths (rag down, or a per-request rag
/// failure / shape-miss) know semantic is unavailable for THIS response; they
/// must still report the declared tier truthfully, so this overlays
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
    tiers_value(&unavailable)
}

/// A tier block degrading ONE named tier with an explicit reason, layered onto
/// the real declared-tier status (worktree-only honest degradation). The
/// file-tree's `structural` degradation (a scope with no
/// listable working tree) rides this: the named tier is marked unavailable while
/// the declared tier still reports truthfully (the same overlay `query_tiers` and
/// `degraded_tiers` apply), so the code mode renders a designed degraded state
/// rather than a bare error or a healthy-looking empty.
pub(crate) fn degraded_tiers_for(
    cell: &ScopeCell,
    tier: &'static str,
    reason: &str,
) -> serde_json::Value {
    let mut unavailable: Vec<(&'static str, String)> = vec![(tier, reason.to_string())];
    if let Ok(status) = cell.declared_status.read()
        && let Some(declared_reason) = status.as_ref()
        && tier != "declared"
    {
        unavailable.push(("declared", declared_reason.clone()));
    }
    tiers_value(&unavailable)
}

/// THE shared success envelope (contract §2): every HTTP payload
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

/// One canonical scope-token form everywhere: delegates to the
/// single shared canonicaliser in `engine_model` so the CLI and serve doors
/// mint identity-bearing scope tokens identically.
pub(crate) use engine_model::scope_token;

/// THE shared error response (contract §2): every error carries
/// the tiers block too — absence of a tier is data even on failures.
///
/// Error paths may fire BEFORE a per-request scope resolves (e.g. an unknown
/// scope 400), so the tiers come from the always-present ACTIVE-scope cell:
/// the bad-scope 400 still carries an honest tiers block.
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

/// Map a bounded-subprocess fault to the degraded envelope, preserving the
/// status code and wording every hand-copied runner used before they shared one
/// lifecycle: a breached wall clock is a 504, every other fault a 502. A
/// non-zero CHILD exit is not a fault here — that is a completed run each route
/// interprets against its own envelope contract.
pub(crate) fn bounded_fault_error(
    state: &AppState,
    program: &str,
    limits: crate::bounded_child::BoundedLimits,
    fault: crate::bounded_child::BoundedFault,
) -> (StatusCode, Json<Value>) {
    use crate::bounded_child::BoundedFault;
    let (status, detail) = match fault {
        BoundedFault::Spawn(error) => (
            StatusCode::BAD_GATEWAY,
            format!("spawning {program}: {error}"),
        ),
        BoundedFault::Read(error) => (
            StatusCode::BAD_GATEWAY,
            format!("reading {program} output: {error}"),
        ),
        BoundedFault::Timeout => (
            StatusCode::GATEWAY_TIMEOUT,
            format!("{program} timed out after {}s", limits.timeout.as_secs()),
        ),
        BoundedFault::OverCap => (
            StatusCode::BAD_GATEWAY,
            format!(
                "{program} produced over {} bytes of output (capped)",
                limits.cap
            ),
        ),
        BoundedFault::Wait(error) => (
            StatusCode::BAD_GATEWAY,
            format!("awaiting {program} exit: {error}"),
        ),
    };
    api_error(state, status, detail)
}

/// An error carrying a machine-readable `error_kind` beside the message and the
/// tiers block (dashboard-settings: typed settings-validation errors). The kind
/// lets the client distinguish "your write was invalid" — and WHY — from "a
/// backend tier is down", without parsing the human message. Built through this
/// shared helper so no route hand-rolls a tiers-less or kind-less error body.
pub(crate) fn api_error_kind(
    state: &AppState,
    status: StatusCode,
    kind: &str,
    message: String,
) -> (StatusCode, Json<Value>) {
    (
        status,
        Json(json!({
            "error": message,
            "error_kind": kind,
            "tiers": query_tiers(&state.active_cell()),
        })),
    )
}

/// Client-safe error for an as-of / diff revision that could not be resolved
/// (the `t` / `from` / `to` inputs and `graph/query`'s `as_of`). The
/// underlying gix error string carries the BUILD MACHINE's cargo-registry
/// path and a source `file:line` — an info leak beyond the served root
/// (a stress-test finding). Never echo it: log the full error for
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
    // when the client DID supply a valid timestamp.
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
