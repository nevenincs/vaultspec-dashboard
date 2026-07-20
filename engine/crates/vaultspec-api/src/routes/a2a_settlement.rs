//! The authenticated A2A terminal-settlement callback
//! (a2a-product-provisioning W02.P05.S41).
//!
//! `POST /internal/a2a/run-terminal` is the RECEIVING end of the gateway's
//! fire-and-forget terminal-settlement emission (a2a `desktop/settlement.py`).
//! When a run reaches a durable terminal state, the gateway POSTs a bounded,
//! secret-free `{run_id, lease_id, terminal_status}` body authenticated with the
//! dashboard-created ATTACH-CONTROL credential (never the worker-IPC secret), and
//! the dashboard revokes exactly that run's hashed token bundle.
//!
//! This route is deliberately OUTSIDE the fixed six-verb `/ops/a2a` orchestration
//! whitelist and off the machine `bearer_gate` path set — it is an internal
//! gateway->dashboard callback, not a browser API verb. It authenticates on its
//! own by verifying the presented `Authorization: Bearer <attach-control>` against
//! the stored attach-control credential (constant-time), so a machine bearer, the
//! worker-IPC secret, or any unrelated credential is rejected (S153). Settlement
//! is idempotent and revokes the bundle only after verifying the callback's lease
//! id matches the one bound at commit (defense-in-depth atop the auth).

use std::sync::Arc;

use axum::Json;
use axum::extract::{FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use serde_json::{Value, json};

use crate::a2a_run_leases::SettleOutcome;
use crate::app::{AppState, now_ms};

type ApiResult = Result<Json<Value>, (StatusCode, Json<Value>)>;

/// The durably-terminal A2A run statuses (a2a `thread/enums.TERMINAL_STATUSES`).
/// A settlement callback carries one of these; `input_required` and every other
/// active status is NOT terminal (its lease is retained, S44).
const TERMINAL_STATUSES: &[&str] = &["completed", "failed", "cancelled"];

/// The bounded terminal-settlement callback body — mirrors the a2a producer's
/// `TerminalSettlement` shape exactly. Secret-free by construction: no actor
/// token, no worker-IPC secret, only non-secret identities + the terminal status.
#[derive(Debug, serde::Deserialize)]
pub(crate) struct TerminalSettlementBody {
    pub run_id: String,
    pub lease_id: String,
    pub terminal_status: String,
}

/// A REQUIRED extractor witnessing that the request presented the dashboard-
/// created attach-control credential (S41/S153). Because a handler takes it as an
/// argument, the auth is enforced BY CONSTRUCTION — the handler body cannot run
/// unless this passed, and it runs BEFORE the body is read. It reads
/// `Authorization: Bearer <secret>` and constant-time compares against the stored
/// attach-control credential, so the machine bearer, the worker-IPC secret, an
/// unrelated credential, a missing header, or a malformed one all fail closed
/// with a 401. Any future `/internal/a2a/*` route reuses it.
pub(crate) struct AttachControlAuth;

/// Extract the attach-control bearer from the `Authorization` header.
fn presented_attach_control(headers: &HeaderMap) -> Option<&str> {
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}

impl FromRequestParts<Arc<AppState>> for AttachControlAuth {
    type Rejection = (StatusCode, Json<Value>);

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        let ok = presented_attach_control(&parts.headers)
            .is_some_and(|token| state.a2a_lifecycle.verify_attach_control(token));
        if ok {
            Ok(AttachControlAuth)
        } else {
            Err(crate::routes::api_error_kind(
                state,
                StatusCode::UNAUTHORIZED,
                "attach_control_required",
                "terminal settlement requires the dashboard attach-control credential".to_string(),
            ))
        }
    }
}

/// `POST /internal/a2a/run-terminal` — the attach-control-authenticated terminal
/// settlement callback (S41). The `AttachControlAuth` extractor enforces the
/// credential before this body runs; here it only confirms the status is durably
/// terminal, then idempotently settles the run's lease (revoking exactly its
/// hashed bundle) after verifying the callback lease id.
pub(crate) async fn a2a_run_terminal(
    _auth: AttachControlAuth,
    State(state): State<Arc<AppState>>,
    body: Option<Json<TerminalSettlementBody>>,
) -> ApiResult {
    let Some(Json(body)) = body else {
        return Err(super::api_error_kind(
            &state,
            StatusCode::BAD_REQUEST,
            "invalid_settlement_body",
            "terminal settlement requires a {run_id, lease_id, terminal_status} body".to_string(),
        ));
    };

    // Confirm the reported status is durably terminal — an active status (e.g.
    // input_required) never settles a lease (S44).
    if !TERMINAL_STATUSES.contains(&body.terminal_status.as_str()) {
        return Err(super::api_error_kind(
            &state,
            StatusCode::UNPROCESSABLE_ENTITY,
            "not_terminal",
            format!(
                "settlement status `{}` is not a durable terminal status",
                body.terminal_status
            ),
        ));
    }

    // Idempotently settle: revoke exactly the persisted hashed bundle after
    // verifying the callback lease id matches the bound one. Every outcome is a
    // 200 — the callback is a fire-and-forget notification the gateway must not
    // retry-storm on (unknown/already-settled/mismatch all resolve, never 5xx).
    let leases = state.a2a_run_leases.clone();
    let (run_id, lease_id) = (body.run_id.clone(), body.lease_id.clone());
    let settled = tokio::task::spawn_blocking({
        let (run_id, lease_id) = (run_id.clone(), lease_id.clone());
        move || leases.settle_terminal(&run_id, &lease_id, now_ms())
    })
    .await;
    // A store failure or a task panic is NOT the legitimate "no lease" case: the
    // hashed bundle may still be LIVE and no retry is coming. Collapsing both into
    // a silent `Unknown` 200 leaves the credential live until expiry with no
    // operator signal — so distinguish them and emit a warning, while keeping the
    // 200-always contract and the expiry/reconciliation sweep as the backstop.
    let outcome = match settled {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(error)) => {
            eprintln!(
                "vaultspec serve: a2a terminal settlement failed to persist \
                 (run={run_id} lease={lease_id}): {error}; the hashed bundle \
                 relies on the expiry backstop"
            );
            SettleOutcome::Unknown
        }
        Err(join_error) => {
            eprintln!(
                "vaultspec serve: a2a terminal settlement task did not complete \
                 (run={run_id} lease={lease_id}): {join_error}; the hashed bundle \
                 relies on the expiry backstop"
            );
            SettleOutcome::Unknown
        }
    };

    let data = match outcome {
        SettleOutcome::Settled { revoked } => {
            json!({ "settled": true, "revoked": revoked, "run_id": body.run_id })
        }
        SettleOutcome::AlreadyTerminal => {
            json!({ "settled": false, "reason": "already terminal", "run_id": body.run_id })
        }
        SettleOutcome::Unknown => {
            json!({ "settled": false, "reason": "no lease for run", "run_id": body.run_id })
        }
        SettleOutcome::LeaseMismatch => {
            json!({ "settled": false, "reason": "lease id mismatch", "run_id": body.run_id })
        }
    };
    Ok(super::envelope(
        data,
        super::query_tiers(&state.active_cell()),
        None,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn presented_attach_control_reads_only_a_bearer() {
        let mut headers = HeaderMap::new();
        assert!(presented_attach_control(&headers).is_none());
        headers.insert("authorization", HeaderValue::from_static("Bearer secret-x"));
        assert_eq!(presented_attach_control(&headers), Some("secret-x"));
        headers.insert("authorization", HeaderValue::from_static("Basic abc"));
        assert!(presented_attach_control(&headers).is_none());
    }

    #[test]
    fn terminal_status_set_matches_the_a2a_producer() {
        for s in ["completed", "failed", "cancelled"] {
            assert!(TERMINAL_STATUSES.contains(&s));
        }
        for s in ["input_required", "running", "submitted", "cancelling"] {
            assert!(
                !TERMINAL_STATUSES.contains(&s),
                "`{s}` is active, not terminal"
            );
        }
    }
}
