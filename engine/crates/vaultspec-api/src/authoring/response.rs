use axum::Json;
use axum::http::StatusCode;
use serde_json::{Value, json};

use crate::app::AppState;

pub fn snapshot(state: &AppState, data: Value) -> Json<Value> {
    crate::routes::envelope(data, crate::routes::query_tiers(&state.active_cell()), None)
}

// W01.P02 establishes this shared response grammar before later route phases
// consume every helper.
#[allow(dead_code)]
pub fn degraded_snapshot(
    state: &AppState,
    tier: &'static str,
    reason: &str,
    data: Value,
) -> Json<Value> {
    crate::routes::envelope(
        data,
        crate::routes::degraded_tiers_for(&state.active_cell(), tier, reason),
        None,
    )
}

// W01.P02 establishes this shared response grammar before later command phases
// consume every helper.
#[allow(dead_code)]
pub fn command_receipt(state: &AppState, receipt: Value) -> Json<Value> {
    snapshot(state, json!({ "receipt": receipt }))
}

// W01.P02 establishes this shared response grammar before later validation and
// conflict phases consume every helper.
#[allow(dead_code)]
pub fn typed_error(
    state: &AppState,
    status: StatusCode,
    kind: &str,
    message: &str,
) -> (StatusCode, Json<Value>) {
    crate::routes::api_error_kind(state, status, kind, message.to_string())
}

/// The ENABLED authoring status (W03.P39 mount): the domain is live now that the
/// propose → review → apply → rollback routes are mounted. Same ownership map as
/// the disabled shell; the capability flags report exactly what V1 serves.
pub fn enabled_status(state: &AppState) -> Json<Value> {
    snapshot(state, enabled_status_data(state))
}

pub fn enabled_status_data(state: &AppState) -> Value {
    let direct =
        super::direct_write::DirectWriteCapabilities::for_worktree(&state.active_workspace_root());
    json!({
        "feature": super::FEATURE_TAG,
        "enabled": true,
        "status": "enabled",
        "route_family": super::ROUTE_FAMILY,
        "ownership": {
            "backend": "vaultspec-api authoring domain",
            "materialization": "internal vaultspec-core adapter",
            "collaborator_contract": "semantic authoring API",
            "core_routes_are_authoring_contract": false,
        },
        "capabilities": {
            // Live in the V1 walking skeleton (W03.P39).
            "proposals": true,
            "review": true,
            "apply": true,
            "rollback": true,
            "direct_write": direct.enabled,
            // Deferred to later increments.
            "sessions": true,
            "leases": false,
            "streams": true,
            "langgraph": false,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-30-authoring-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n",
        )
        .unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    #[test]
    fn enabled_status_is_backend_served_and_tiered() {
        let (_dir, state) = fixture_state();
        let Json(body) = enabled_status(&state);

        assert_eq!(body["data"]["feature"], super::super::FEATURE_TAG);
        assert_eq!(body["data"]["enabled"], true);
        assert_eq!(body["data"]["status"], "enabled");
        assert_eq!(body["data"]["route_family"], super::super::ROUTE_FAMILY);
        assert_eq!(body["data"]["capabilities"]["proposals"], true);
        assert_eq!(body["data"]["capabilities"]["apply"], true);
        // Direct-changeset is the sole editor-save path, on by default (W14.P47);
        // no capability file is present in this fixture.
        assert_eq!(body["data"]["capabilities"]["direct_write"], true);
        assert!(
            body["data"]["capabilities"]
                .get("direct_write_dual_run")
                .is_none(),
            "the retired dual_run capability flag must not be served"
        );
        assert!(
            body["data"]["capabilities"]
                .get("direct_write_authority")
                .is_none(),
            "the retired legacy-authority capability flag must not be served"
        );
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "enabled snapshots carry tiers"
        );
    }

    #[test]
    fn enabled_status_reports_the_capability_kill_switch() {
        let (dir, state) = fixture_state();
        super::super::direct_write::DirectWriteCapabilities::write_for_tests(
            dir.path(),
            super::super::direct_write::DirectWriteCapabilities::disabled(),
        );
        let Json(body) = enabled_status(&state);

        assert_eq!(body["data"]["capabilities"]["direct_write"], false);
    }

    #[test]
    fn command_receipt_uses_the_shared_snapshot_shape() {
        let (_dir, state) = fixture_state();
        let Json(body) = command_receipt(
            &state,
            json!({
                "command_id": "cmd_1",
                "status": "accepted",
            }),
        );

        assert_eq!(body["data"]["receipt"]["command_id"], "cmd_1");
        assert_eq!(body["data"]["receipt"]["status"], "accepted");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "command receipts must carry tiers"
        );
    }

    #[test]
    fn typed_error_carries_kind_message_and_tiers() {
        let (_dir, state) = fixture_state();
        let (status, Json(body)) = typed_error(
            &state,
            StatusCode::CONFLICT,
            "authoring_conflict",
            "proposal base is stale",
        );

        assert_eq!(status, StatusCode::CONFLICT);
        assert_eq!(body["error_kind"], "authoring_conflict");
        assert_eq!(body["error"], "proposal base is stale");
        assert!(
            body["tiers"]["semantic"]["available"].is_boolean(),
            "typed errors must carry tiers"
        );
    }

    #[test]
    fn degraded_snapshot_marks_the_named_tier_unavailable() {
        let (_dir, state) = fixture_state();
        let Json(body) = degraded_snapshot(
            &state,
            "structural",
            "authoring projection unavailable",
            json!({"ok": false}),
        );

        assert_eq!(body["data"]["ok"], false);
        assert_eq!(body["tiers"]["structural"]["available"], false);
        assert_eq!(
            body["tiers"]["structural"]["reason"],
            "authoring projection unavailable"
        );
    }
}
