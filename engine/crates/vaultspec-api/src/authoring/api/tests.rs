use super::*;
use axum::Json;
use serde_json::json;
use std::collections::HashSet;
use std::sync::Arc;

fn fixture_state() -> (tempfile::TempDir, Arc<crate::app::AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::write(
        dir.path()
            .join(".vault/plan/2026-06-30-authoring-api-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n",
    )
    .unwrap();
    let state = crate::app::build_state(dir.path().to_path_buf());
    (dir, state)
}

#[test]
fn route_fixtures_cover_every_family_with_versioned_authoring_paths() {
    let expected: HashSet<EndpointFamily> = EndpointFamily::ALL.iter().copied().collect();
    let actual: HashSet<EndpointFamily> = ROUTE_FIXTURES
        .iter()
        .map(|fixture| fixture.family)
        .collect();
    assert_eq!(
        actual, expected,
        "every endpoint family has a route fixture"
    );

    for fixture in ROUTE_FIXTURES {
        assert!(
            fixture.path_template.starts_with("/authoring/v1/"),
            "authoring route fixtures are versioned: {fixture:?}"
        );
        assert!(
            !fixture.negative_contract_cases.is_empty(),
            "every fixture carries at least one negative contract case: {fixture:?}"
        );
        assert_eq!(
            fixture.idempotency_required, fixture.mutating,
            "only mutating fixtures require idempotency in W01.P04: {fixture:?}"
        );
    }
}

#[test]
fn request_and_response_fixtures_are_versioned_for_every_family() {
    for family in EndpointFamily::ALL {
        let request = request_fixture(*family);
        let response = response_fixture(*family);
        assert_eq!(request["api_version"], "v1", "request fixture: {family:?}");
        assert_eq!(
            response["api_version"], "v1",
            "response fixture: {family:?}"
        );
        assert_eq!(response["latest_outbox_seq"], 42);
    }
}

#[test]
fn command_envelope_carries_no_actor_requires_idempotency_and_rejects_unknown_fields() {
    let valid = request_fixture(EndpointFamily::Session);
    let parsed: CommandEnvelope<CreateSessionRequest> =
        serde_json::from_value(valid).expect("valid command fixture parses");
    assert_eq!(parsed.command, CommandKind::CreateSession);
    assert_eq!(parsed.idempotency_key.as_str(), "idem:session:create");

    // A2.3 FALSIFIER: the wire envelope has NO actor field, so a client that
    // tries to CLAIM an identity in the body is rejected as an unknown field
    // (deny_unknown_fields) — kind:Human can never be smuggled. Actor resolves
    // only from the principal token via ResolvedCommand.
    let claims_actor = json!({
        "api_version": "v1",
        "command": "create_session",
        "actor": {"id": "human:alice", "kind": "human"},
        "idempotency_key": "idem:session:create",
        "payload": {"scope": "scope_a", "title": "Agentic authoring"}
    });
    let err =
        serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(claims_actor).unwrap_err();
    assert!(
        err.to_string().contains("unknown field") && err.to_string().contains("actor"),
        "a body-claimed actor is rejected as an unknown field (A2.3): {err}"
    );

    let missing_key = json!({
        "api_version": "v1",
        "command": "create_session",
        "payload": {"scope": "scope_a", "title": "Agentic authoring"}
    });
    let err =
        serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(missing_key).unwrap_err();
    assert!(
        err.to_string().contains("idempotency_key"),
        "missing idempotency key is rejected: {err}"
    );

    let unknown_top_level = json!({
        "api_version": "v1",
        "command": "create_session",
        "idempotency_key": "idem:session:create",
        "payload": {"scope": "scope_a", "title": "Agentic authoring"},
        "core_verb": "vault set-body"
    });
    let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_top_level)
        .unwrap_err();
    assert!(
        err.to_string().contains("unknown field"),
        "unknown top-level fields are rejected: {err}"
    );

    let unknown_payload = json!({
        "api_version": "v1",
        "command": "create_session",
        "idempotency_key": "idem:session:create",
        "payload": {
            "scope": "scope_a",
            "title": "Agentic authoring",
            "extra": true
        }
    });
    let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_payload)
        .unwrap_err();
    assert!(
        err.to_string().contains("unknown field"),
        "unknown payload fields are rejected: {err}"
    );
}

#[test]
fn nested_authoring_context_rejects_unknown_fields() {
    let unknown_actor = json!({
        "api_version": "v1",
        "command": "create_session",
        "actor": {
            "id": "human:alice",
            "kind": "human",
            "display_name": "Alice"
        },
        "idempotency_key": "idem:session:create",
        "payload": {"scope": "scope_a", "title": "Agentic authoring"}
    });
    let err =
        serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_actor).unwrap_err();
    assert!(
        err.to_string().contains("unknown field"),
        "unknown actor fields are rejected: {err}"
    );

    let unknown_langgraph = json!({
        "api_version": "v1",
        "command": "create_session",
        "idempotency_key": "idem:session:create",
        "payload": {
            "scope": "scope_a",
            "title": "Agentic authoring",
            "langgraph": {
                "thread_id": "thread_1",
                "checkpoint_id": "checkpoint_1",
                "checkpoint_payload": {}
            }
        }
    });
    let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(unknown_langgraph)
        .unwrap_err();
    assert!(
        err.to_string().contains("unknown field") && err.to_string().contains("langgraph"),
        "caller-supplied langgraph refs are rejected at the public command boundary: {err}"
    );

    let unknown_document_ref = json!({
        "api_version": "v1",
        "payload": {
            "document": {
                "kind": "existing",
                "scope": "scope_a",
                "node_id": "doc:adr-1",
                "stem": "adr-1",
                "path": ".vault/adr/adr-1.md",
                "doc_type": "adr",
                "base_revision": "blob:abc123",
                "derived_title": "ADR 1"
            }
        }
    });
    let err = serde_json::from_value::<ReadEnvelope<DocumentSnapshotRequest>>(unknown_document_ref)
        .unwrap_err();
    assert!(
        err.to_string().contains("unknown field"),
        "unknown document_ref fields are rejected: {err}"
    );

    let unknown_aggregate = json!({
        "api_version": "v1",
        "family": "proposal",
        "aggregate": {
            "kind": "changeset",
            "changeset_id": "changeset_1",
            "derived_status": "approved"
        },
        "latest_outbox_seq": 42,
        "snapshot": {"status": "fixture"}
    });
    let err = serde_json::from_value::<SnapshotDto>(unknown_aggregate).unwrap_err();
    assert!(
        err.to_string().contains("unknown field"),
        "unknown aggregate fields are rejected: {err}"
    );
}

#[test]
fn change_fixtures_carry_child_operations_and_revision_fences() {
    let proposal_value = request_fixture(EndpointFamily::Proposal);
    assert!(
        proposal_value["payload"].get("target").is_none(),
        "proposal fixture must not collapse to a single top-level target"
    );
    assert!(
        proposal_value["payload"].get("draft").is_none(),
        "proposal fixture must not collapse to a single top-level draft"
    );

    let proposal: CommandEnvelope<CreateProposalRequest> =
        serde_json::from_value(proposal_value).unwrap();
    assert_eq!(
        proposal.payload.operations.len(),
        2,
        "proposal fixture carries child operations"
    );
    assert!(
        proposal.payload.operations.iter().any(|operation| {
            operation.target.base_revision.is_some() && operation.target.current_revision.is_some()
        }),
        "existing targets carry base and current revision fences"
    );

    // R1: V1 apply names only the changeset + the approval it applies — the
    // per-child targets are re-derived from the applied record + the core fence.
    let apply: CommandEnvelope<ApplyRequest> =
        serde_json::from_value(request_fixture(EndpointFamily::Apply)).unwrap();
    assert_eq!(apply.payload.changeset_id, changeset_id());
    assert_eq!(apply.payload.approval_id, approval_id());

    let direct: CommandEnvelope<DirectWriteRequest> =
        serde_json::from_value(request_fixture(EndpointFamily::DirectWrite)).unwrap();
    assert_eq!(direct.command, CommandKind::DirectWrite);
    assert_eq!(
        direct.payload.doc_ref.as_deref(),
        Some(".vault/adr/adr-1.md")
    );
    assert_eq!(
        direct.payload.expected_blob_hash.as_deref(),
        Some("abc123abc123abc123abc123abc123abc123abcd")
    );

    let rollback: CommandEnvelope<RollbackRequest> =
        serde_json::from_value(request_fixture(EndpointFamily::Rollback)).unwrap();
    assert_eq!(
        rollback.payload.source_children.len(),
        2,
        "rollback names source children explicitly"
    );
    // R1: a rollback child names only its key; the op kind + revision fence are
    // authoritative from the applied source record (no accepted-but-ignored field).
    assert!(
        rollback
            .payload
            .source_children
            .iter()
            .all(|source| !source.source_child_key.is_empty()),
        "rollback sources are named by child key"
    );
}

#[test]
fn future_or_wrong_versions_reject() {
    let mut future = request_fixture(EndpointFamily::Session);
    future["api_version"] = json!("v2");
    let err = serde_json::from_value::<CommandEnvelope<CreateSessionRequest>>(future).unwrap_err();
    assert!(
        err.to_string().contains("unknown variant"),
        "future request versions reject until explicitly supported: {err}"
    );

    let mut event = serde_json::to_value(event_fixture()).unwrap();
    event["schema_version"] = json!("v2");
    let err = serde_json::from_value::<AuthoringEventDto>(event).unwrap_err();
    assert!(
        err.to_string().contains("unknown variant"),
        "future event schema versions reject until explicitly supported: {err}"
    );
}

#[test]
fn semantic_fixtures_do_not_expose_core_shaped_verbs() {
    for fixture in ROUTE_FIXTURES {
        let route = fixture.path_template;
        assert!(!route.contains("/ops/core"), "route is semantic: {route}");
        assert!(
            !route.contains("vaultspec-core"),
            "route is semantic: {route}"
        );
        if let Some(command) = fixture.command {
            let value = serde_json::to_value(command).unwrap();
            let command_name = value.as_str().unwrap();
            assert!(
                !command_name.contains("core") && !command_name.contains("vaultspec_core"),
                "command is semantic: {command_name}"
            );
        }
    }
}

#[test]
fn response_fixtures_are_tiered_when_served_through_authoring_envelope() {
    let (_dir, state) = fixture_state();
    let Json(body) =
        super::super::response::snapshot(&state, response_fixture(EndpointFamily::Recovery));

    assert_eq!(body["data"]["api_version"], "v1");
    assert_eq!(body["data"]["family"], "recovery");
    assert_eq!(body["data"]["latest_outbox_seq"], 42);
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "versioned recovery fixture rides the shared tiers envelope"
    );

    let Json(degraded) = super::super::response::degraded_snapshot(
        &state,
        "semantic",
        "authoring projection unavailable",
        serde_json::to_value(degraded_snapshot_fixture(EndpointFamily::Recovery)).unwrap(),
    );
    assert_eq!(degraded["data"]["api_version"], "v1");
    assert_eq!(degraded["data"]["unavailable_tier"], "semantic");
    assert_eq!(degraded["tiers"]["semantic"]["available"], false);
}

#[test]
fn list_error_and_degraded_fixtures_are_versioned() {
    let page = serde_json::to_value(list_page_fixture(EndpointFamily::Review)).unwrap();
    let error = serde_json::to_value(typed_error_fixture()).unwrap();
    let degraded = serde_json::to_value(degraded_snapshot_fixture(EndpointFamily::Stream)).unwrap();

    assert_eq!(page["api_version"], "v1");
    assert_eq!(page["family"], "review");
    assert_eq!(page["next_cursor"], "cursor_42");
    assert_eq!(error["api_version"], "v1");
    assert_eq!(error["error_kind"], "authoring_validation_failed");
    assert_eq!(degraded["api_version"], "v1");
    assert_eq!(degraded["family"], "stream");
    assert_eq!(degraded["unavailable_tier"], "semantic");
}

#[test]
fn lifecycle_event_fixtures_are_versioned_and_not_status_names() {
    let event = serde_json::to_value(event_fixture()).unwrap();

    assert_eq!(event["schema_version"], "v1");
    assert_eq!(event["timestamp_ms"], 1_775_000_000_000i64);
    assert_eq!(event["event"], "approval_resolved");
    assert_ne!(
        event["event"], "approved",
        "events are transition records, not a second status vocabulary"
    );
    assert_eq!(event["payload"]["decision"], "approve");
    assert_eq!(event["idempotency_key"], "idem:review:approve");
}

#[test]
fn document_fixture_covers_provisional_create_identity() {
    let document = serde_json::to_value(provisional_document_fixture()).unwrap();

    assert_eq!(document["kind"], "provisional_create");
    assert_eq!(document["provisional_doc_id"], "provisional_doc_1");
    assert_eq!(document["collision_status"], "available");
}

#[test]
fn document_response_fixture_preserves_document_identity() {
    let response = response_fixture(EndpointFamily::Document);

    assert_eq!(response["aggregate"]["kind"], "document");
    assert_eq!(response["aggregate"]["document"]["kind"], "existing");
    assert_eq!(
        response["aggregate"]["document"]["base_revision"],
        "blob:abc123"
    );
}

#[test]
fn command_receipt_fixture_carries_actor_command_and_idempotency() {
    let dto = CommandReceiptDto {
        api_version: ApiVersion::V1,
        status: CommandReceiptStatus::Accepted,
        aggregate: AggregateRef::Proposal {
            proposal_id: proposal_id(),
        },
        receipt: receipt(CommandKind::CreateProposal, "idem:proposal:create"),
    };
    let value = serde_json::to_value(dto).unwrap();

    assert_eq!(value["api_version"], "v1");
    assert_eq!(value["status"], "accepted");
    assert_eq!(value["receipt"]["command"], "create_proposal");
    assert_eq!(value["receipt"]["actor"]["kind"], "human");
    assert_eq!(value["receipt"]["idempotency_key"], "idem:proposal:create");
}
