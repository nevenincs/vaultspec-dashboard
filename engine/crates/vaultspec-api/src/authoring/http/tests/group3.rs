//! Apply test group (module-decomposition). See ./helpers.rs.

use super::helpers::*;
use super::helpers2::*;

/// NEGATIVE: a delegated command whose delegator is absent is refused (confused-deputy
/// fence) — the actor itself is registered and active, but its delegator is not.
#[tokio::test]
async fn a_delegated_command_with_an_absent_delegator_is_refused() {
    let (_dir, state) = fixture_state();
    // Delegation provenance lives on the TOKEN, never the actor record. Register the
    // delegate's base identity (active), then mint a token that resolves to the
    // delegated principal whose delegator `human:absent` is NEVER registered — the
    // delegation standing guard (confused-deputy fence) must refuse.
    let delegate_base = ActorRef {
        id: ActorId::new("agent:delegate").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };
    register_actor(&state, &delegate_base);
    let token = issue_token_in_state(&state, &delegated_agent());
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, envelope) = post_authoring(
        router,
        "/v1/sessions",
        &token,
        request_fixture(EndpointFamily::Session),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{envelope}");
    assert_eq!(envelope["error_kind"], AUTHORIZATION_DENIED_KIND);
    assert!(
        envelope["error"]
            .as_str()
            .unwrap_or_default()
            .contains("delegat"),
        "the refusal names the delegation fence: {envelope}"
    );
}

/// NEGATIVE: a registered System actor is refused from the semantic tool surface at
/// the `/execute` seam (tool-requester guard) — a denial VALUE on the unified envelope.
#[tokio::test]
async fn execute_refuses_a_system_actor_from_the_tool_surface() {
    let (_dir, state) = fixture_state();
    let system = system_requester();
    // Registered active, so it passes the standing floor; the tool-requester guard
    // then refuses it (only Human/Agent may drive the tool surface).
    register_actor(&state, &system);
    let token = issue_token_in_state(&state, &system);
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, envelope) = post_authoring(
        router,
        "/v1/runs/run_1/agent-tools/execute",
        &token,
        request_fixture(EndpointFamily::AgentToolExecute),
    )
    .await;

    assert_eq!(
        status,
        StatusCode::OK,
        "the tool-requester refusal is a denial VALUE: {envelope}"
    );
    assert_eq!(envelope["data"]["status"], "denied");
    assert!(
        envelope["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("tool surface")),
        "the denial names the tool-surface guard: {envelope}"
    );
}

/// NEGATIVE (the real confused-deputy fence): a create whose target claims a DIFFERENT
/// worktree path than the active workspace is refused by the document-scope guard as a
/// 200 denial VALUE — the actor is registered and standing, so the refusal is a command
/// outcome, never a fault. (A legitimate same-workspace create is verified by
/// `create_proposal_opens_a_draft_changeset_under_the_resolved_actor`, which resolves a
/// real document in the active workspace and now passes the scope guard before creating.)
#[tokio::test]
async fn create_proposal_refuses_a_cross_workspace_target() {
    let (_dir, state) = fixture_state();
    let author = agent();
    register_actor(&state, &author);
    let token = issue_token_in_state(&state, &author);

    // A target scope that can never equal the active workspace's scope_token.
    let foreign_scope = "/some/other/worktree";
    assert_ne!(
        foreign_scope,
        active_authorized_scope(&state),
        "the spoofed scope must differ from the active workspace"
    );
    let body = create_proposal_targeting_scope("changeset_cross_1", foreign_scope);
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, envelope) = post_authoring(router, "/v1/proposals", &token, body).await;

    assert_eq!(
        status,
        StatusCode::OK,
        "a scope refusal is a denial VALUE, not a fault: {envelope}"
    );
    assert_eq!(envelope["data"]["status"], "denied");
    assert!(
        envelope["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("scope")),
        "the denial names the scope fence: {envelope}"
    );
}

/// The acquire route issues a lease row carrying the monotonic fencing token a holder
/// later presents at apply — a fresh, held lease under the resolved principal.
#[tokio::test]
async fn acquire_lease_route_returns_a_held_lease_and_fencing_token() {
    let (_dir, state) = fixture_state();
    let holder = agent();
    register_actor(&state, &holder);
    let token = issue_token_in_state(&state, &holder);
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, envelope) = post_authoring(
        router,
        "/v1/leases",
        &token,
        lease_acquire_body("idem:lease:a1"),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{envelope}");
    assert_eq!(envelope["data"]["status"], "allowed");
    assert_eq!(envelope["data"]["lease"]["state"], "held");
    assert!(
        envelope["data"]["lease"]["fencing_token"]
            .as_i64()
            .is_some_and(|fencing_token| fencing_token >= 1),
        "a fresh lease issues a monotonic fencing token: {envelope}"
    );
    assert!(envelope["tiers"]["semantic"]["available"].is_boolean());
}

/// A second actor holding no lease cannot release another holder's live lease — the
/// release is a denial VALUE and the lease stands.
#[tokio::test]
async fn a_non_owner_lease_release_is_refused_as_a_value() {
    let (_dir, state) = fixture_state();
    let owner = agent();
    let other = human_reviewer();
    register_actor(&state, &owner);
    register_actor(&state, &other);
    let owner_token = issue_token_in_state(&state, &owner);
    let other_token = issue_token_in_state(&state, &other);

    // The owner acquires the lease.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (acquire_status, acquire_envelope) = post_authoring(
        router,
        "/v1/leases",
        &owner_token,
        lease_acquire_body("idem:lease:own"),
    )
    .await;
    assert_eq!(acquire_status, StatusCode::OK, "{acquire_envelope}");
    assert_eq!(acquire_envelope["data"]["status"], "allowed");

    // A different, standing actor tries to release it → refused as a value.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/leases/release",
        &other_token,
        lease_release_body("idem:lease:rel"),
    )
    .await;

    assert_eq!(
        status,
        StatusCode::OK,
        "a non-owner release is a denial VALUE, not a fault: {envelope}"
    );
    assert_eq!(envelope["data"]["status"], "denied");
    assert!(
        envelope["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("holder")),
        "the denial names the owner-only rule: {envelope}"
    );
}

/// The full comment lifecycle over the REAL router + REAL store + REAL worktree
/// file: create anchors to a live heading section; editing the section orphans the
/// comment (content-hash mismatch, never a silent re-anchor); an explicit re-anchor
/// re-binds it; delete removes it. Anchor resolution is backend-served throughout.
#[tokio::test]
async fn comment_route_create_list_orphan_reanchor_and_delete() {
    let (_dir, state) = fixture_state();
    let author = agent();
    register_actor(&state, &author);
    let token = issue_token_in_state(&state, &author);

    let original = "# Comment Fixture\n\n## Alpha\n\nalpha body\n";
    let alpha_section = "## Alpha\n\nalpha body\n";
    write_worktree_doc(&state, COMMENT_DOC_REL, original);

    // Create a comment anchored to the live Alpha section.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, env) = post_authoring(
        router,
        &format!("/v1/documents/{COMMENT_NODE_ID}/comments"),
        &token,
        create_comment_envelope(
            "idem:comment:create",
            selector_for(alpha_section, "Alpha"),
            "check this section",
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{env}");
    let comment_id = env["data"]["comment"]["comment_id"]
        .as_str()
        .expect("create serves the comment id")
        .to_string();
    assert_eq!(env["data"]["comment"]["resolved"], false);

    // List: the comment resolves as anchored against the live body.
    let list_uri = format!("/v1/documents/{COMMENT_NODE_ID}/comments");
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, env) = send_authoring(router, "GET", &list_uri, None, None).await;
    assert_eq!(status, StatusCode::OK, "{env}");
    assert_eq!(env["data"]["comments"].as_array().unwrap().len(), 1);
    assert_eq!(env["data"]["comments"][0]["orphaned"], false);
    assert_eq!(env["data"]["comments"][0]["anchor"]["state"], "anchored");

    // Edit the commented section on disk → the comment orphans with a typed
    // content-hash mismatch, still listed (never dropped, never re-anchored).
    write_worktree_doc(
        &state,
        COMMENT_DOC_REL,
        "# Comment Fixture\n\n## Alpha\n\nALPHA REWRITTEN\n",
    );
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, env) = send_authoring(router, "GET", &list_uri, None, None).await;
    assert_eq!(status, StatusCode::OK, "{env}");
    assert_eq!(env["data"]["comments"][0]["orphaned"], true);
    assert_eq!(
        env["data"]["comments"][0]["anchor"]["evidence"]["reason"],
        "content_hash_mismatch"
    );

    // Re-anchor to the CURRENT section (explicit mutation) → anchored again.
    let fresh = selector_for("## Alpha\n\nALPHA REWRITTEN\n", "Alpha");
    let reanchor_body = serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::UpdateComment,
        idempotency_key: IdempotencyKey::new("idem:comment:reanchor").unwrap(),
        payload: CommentUpdateRequest::Reanchor { selector: fresh },
    })
    .unwrap();
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, env) = send_authoring(
        router,
        "PATCH",
        &format!("/v1/comments/{comment_id}"),
        Some(&token),
        Some(reanchor_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{env}");
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (_status, env) = send_authoring(router, "GET", &list_uri, None, None).await;
    assert_eq!(env["data"]["comments"][0]["orphaned"], false);

    // Delete → the listing empties, and a replayed delete is an idempotent no-op.
    let delete_body = serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::DeleteComment,
        idempotency_key: IdempotencyKey::new("idem:comment:delete").unwrap(),
        payload: DeleteCommentRequest::default(),
    })
    .unwrap();
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, env) = send_authoring(
        router,
        "DELETE",
        &format!("/v1/comments/{comment_id}"),
        Some(&token),
        Some(delete_body),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{env}");
    assert_eq!(env["data"]["deleted"], true);

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (_status, env) = send_authoring(router, "GET", &list_uri, None, None).await;
    assert_eq!(env["data"]["comments"].as_array().unwrap().len(), 0);
}

/// A comment mutation emits a lifecycle event on the SAME outbox/SSE feed every
/// changeset event rides — so an SSE consumer learns a document's comments changed.
#[tokio::test]
async fn comment_create_emits_a_comment_created_event_on_the_sse_feed() {
    let (_dir, state) = fixture_state();
    let author = agent();
    register_actor(&state, &author);
    let token = issue_token_in_state(&state, &author);
    write_worktree_doc(
        &state,
        COMMENT_DOC_REL,
        "# Comment Fixture\n\n## Alpha\n\nalpha body\n",
    );

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, _env) = post_authoring(
        router,
        &format!("/v1/documents/{COMMENT_NODE_ID}/comments"),
        &token,
        create_comment_envelope(
            "idem:comment:event",
            selector_for("## Alpha\n\nalpha body\n", "Alpha"),
            "eventful note",
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let events = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.outbox().events_after(0, 50)
            })
        })
        .unwrap();
    assert!(
        events
            .iter()
            .any(|event| event.aggregate_kind == "comment"
                && event.event_kind == "comment.created"),
        "a comment.created event must ride the authoring outbox feed"
    );
}

/// The comment routes fence the command kind before any store work — a create
/// envelope carrying the wrong command is a typed bad request.
#[tokio::test]
async fn comment_create_route_rejects_the_wrong_command_kind() {
    let (_dir, state) = fixture_state();
    let author = agent();
    register_actor(&state, &author);
    let token = issue_token_in_state(&state, &author);
    write_worktree_doc(
        &state,
        COMMENT_DOC_REL,
        "# Comment Fixture\n\n## Alpha\n\nalpha body\n",
    );

    // A CreateProposal command sent to the create-comment route: wrong kind → 400.
    let wrong = serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::CreateProposal,
        idempotency_key: IdempotencyKey::new("idem:comment:wrongkind").unwrap(),
        payload: CreateCommentRequest {
            selector: selector_for("## Alpha\n\nalpha body\n", "Alpha"),
            body: "note".to_string(),
        },
    })
    .unwrap();
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, env) = post_authoring(
        router,
        &format!("/v1/documents/{COMMENT_NODE_ID}/comments"),
        &token,
        wrong,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{env}");
    assert_eq!(env["error_kind"], REQUEST_INVALID_KIND);
}

/// The comment routes never accept a client path: the worktree read is derived from
/// the node id through the confined resolver, so a traversal-shaped node id resolves
/// to nothing (a 404) and can never read a file outside the vault. Regression for the
/// arbitrary-file-read finding.
#[tokio::test]
async fn comment_create_rejects_a_traversal_shaped_node_id_without_reading_outside_the_vault() {
    let (dir, state) = fixture_state();
    let author = agent();
    register_actor(&state, &author);
    let token = issue_token_in_state(&state, &author);

    // A secret file OUTSIDE the vault subtree that a traversal would target.
    std::fs::write(dir.path().join("secret.txt"), "TOP SECRET").unwrap();

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, env) = post_authoring(
        router,
        "/v1/documents/doc:..%2F..%2Fsecret/comments",
        &token,
        create_comment_envelope(
            "idem:comment:traversal",
            selector_for("## Alpha\n\nalpha body\n", "Alpha"),
            "should never land",
        ),
    )
    .await;

    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "a traversal-shaped node id must resolve to nothing: {env}"
    );
    assert_eq!(env["error_kind"], "authoring_comment_document_not_found");
    assert!(
        !env.to_string().contains("TOP SECRET"),
        "the outside-vault file's contents must never appear on the wire: {env}"
    );
}

/// agent-wire-gaps D3 (S26): a client that lost the `/execute` `awaiting_permission`
/// response recovers its pending interrupts from the bounded listing route — raise
/// order, pending flagged, honest `truncated` — and a resolved interrupt serves its
/// decision through the typed projection rather than an opaque string.
#[tokio::test]
async fn run_interrupt_listing_recovers_pending_and_serves_typed_decisions() {
    let (_dir, state) = fixture_state();
    let reviewer = human_reviewer();
    register_actor(&state, &reviewer);
    let token = issue_token_in_state(&state, &reviewer);

    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::ResumeRun, |uow| {
                for (id, call, at) in [
                    ("interrupt_list_1", "call_list_1", 100),
                    ("interrupt_list_2", "call_list_2", 200),
                ] {
                    uow.interrupts().record_interrupt(
                        crate::authoring::interrupts::RecordInterruptInput {
                            interrupt_id: InterruptId::new(id).unwrap(),
                            run_id: RunId::new("run_list_1").unwrap(),
                            kind: crate::authoring::interrupts::InterruptKind::ToolPermission,
                            tool_call_id: Some(ToolCallId::new(call).unwrap()),
                            proposal_id: None,
                            idempotency_key: format!("idem:seed:{id}"),
                            created_at_ms: at,
                        },
                    )?;
                }
                Ok(())
            })
        })
        .unwrap();

    // Recovery read: both interrupts pending, raise order, not truncated.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/runs/run_list_1/interrupts")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    let items = body["data"]["items"].as_array().expect("items array");
    assert_eq!(items.len(), 2, "{body}");
    assert_eq!(items[0]["interrupt_id"], "interrupt_list_1", "raise order");
    assert_eq!(items[1]["interrupt_id"], "interrupt_list_2");
    assert!(items.iter().all(|i| i["resume_state"] == "pending"));
    assert_eq!(body["data"]["truncated"], false);

    // Resolve the first through the existing resume route, then re-read: the
    // listing serves it resolved with a decision projection, never a raw string.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, _) = post_authoring(
        router,
        "/v1/interrupts/interrupt_list_1/resume",
        &token,
        request_fixture(EndpointFamily::Interrupt),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let router = authoring_router(state.clone()).with_state(state);
    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/runs/run_list_1/interrupts")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body = json_body(response).await;
    let items = body["data"]["items"].as_array().expect("items array");
    let resolved = items
        .iter()
        .find(|i| i["interrupt_id"] == "interrupt_list_1")
        .expect("resolved row present");
    assert_eq!(resolved["resume_state"], "resolved", "{body}");
    assert!(
        resolved["decision"].is_object() || resolved["decision"] == "decision_unreadable",
        "decision is the typed projection or the honest degradation marker: {body}"
    );
}

/// agent-wire-gaps D5 (S26): `GET /v1/mode` serves the DEFAULT record on a fresh
/// store and round-trips the mode write — the same record, read pre-proposal with
/// no token (principal-permissive read).
#[tokio::test]
async fn mode_read_serves_default_and_round_trips_the_write() {
    let (_dir, state) = fixture_state();

    // Fresh store: the default record, from the same resolution the policy uses.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/mode")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["mode"], "manual", "default record: {body}");
    assert!(
        body["data"]["scope_id"]
            .as_str()
            .is_some_and(|s| !s.is_empty())
    );
    assert!(body["tiers"].is_object(), "every response carries tiers");

    // Write through the shipped POST, then the read serves the same record.
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/mode",
        &token,
        request_fixture(EndpointFamily::Mode),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{envelope}");
    let written_mode = envelope["data"]["mode"].clone();

    let router = authoring_router(state.clone()).with_state(state);
    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/mode")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let body = json_body(response).await;
    assert_eq!(body["data"]["mode"], written_mode, "round-trip: {body}");
}
