//! Apply test group (module-decomposition). See ./helpers.rs.

use super::helpers::*;
use super::helpers2::*;

#[tokio::test]
async fn a_resolved_principal_and_a_valid_body_yield_the_server_actor() {
    let (_state_dir, state) = fixture_state();
    // W14.P42a: the extractor now runs the standing floor, so the resolved actor
    // must be a registered, active actor to extract a command.
    register_actor(&state, &agent());
    let (_token_dir, principal) = resolved_principal(&agent());

    let command = extract(
        &state,
        Some(PrincipalResolution::Resolved(principal)),
        &request_fixture(EndpointFamily::Session),
    )
    .await
    .unwrap_or_else(|_| panic!("valid session command extracts"));

    // The command's actor is the SERVER-RESOLVED principal, never a body claim.
    assert_eq!(command.actor(), &agent());
    assert_eq!(command.command(), CommandKind::CreateSession);
    assert_eq!(command.idempotency_key().as_str(), "idem:session:create");
    assert_eq!(command.payload().scope, "scope_a");
}

#[tokio::test]
async fn missing_unknown_and_unavailable_principals_are_distinct_rejections() {
    let (_state_dir, state) = fixture_state();
    let body = request_fixture(EndpointFamily::Session);

    // No resolution at all (route not middleware-covered) → treated as missing.
    let (status, envelope) = extract(&state, None, &body).await.unwrap_err();
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(envelope["error_kind"], TOKEN_MISSING_KIND);
    assert!(envelope["tiers"]["semantic"]["available"].is_boolean());

    let (status, envelope) = extract(
        &state,
        Some(PrincipalResolution::Denied(PrincipalDenial::MissingToken)),
        &body,
    )
    .await
    .unwrap_err();
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(envelope["error_kind"], TOKEN_MISSING_KIND);

    let (status, envelope) = extract(
        &state,
        Some(PrincipalResolution::Denied(
            PrincipalDenial::UnknownPrincipal,
        )),
        &body,
    )
    .await
    .unwrap_err();
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(envelope["error_kind"], TOKEN_UNKNOWN_KIND);

    let (status, envelope) = extract(&state, Some(PrincipalResolution::Unavailable), &body)
        .await
        .unwrap_err();
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(envelope["error_kind"], STORE_UNAVAILABLE_KIND);
}

#[tokio::test]
async fn a_body_claimed_actor_is_rejected_as_an_unknown_field() {
    let (_state_dir, state) = fixture_state();
    let (_token_dir, principal) = resolved_principal(&agent());

    // A2.3 FALSIFIER: even WITH a valid resolved principal, a body that tries
    // to claim an actor is rejected — the envelope has no actor field
    // (deny_unknown_fields), so kind:Human can never be smuggled.
    let claims_actor = json!({
        "api_version": "v1",
        "command": "create_session",
        "actor": {"id": "human:alice", "kind": "human"},
        "idempotency_key": "idem:session:create",
        "payload": {"scope": "scope_a", "title": "Agentic authoring"}
    });
    let (status, envelope) = extract(
        &state,
        Some(PrincipalResolution::Resolved(principal)),
        &claims_actor,
    )
    .await
    .unwrap_err();

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(envelope["error_kind"], REQUEST_INVALID_KIND);
    assert!(
        envelope["error"].as_str().unwrap().contains("actor"),
        "the rejection names the offending unknown `actor` field: {envelope}"
    );
}

#[tokio::test]
async fn a_malformed_body_is_rejected_as_invalid() {
    let (_state_dir, state) = fixture_state();
    let (_token_dir, principal) = resolved_principal(&agent());

    let (status, envelope) = extract(
        &state,
        Some(PrincipalResolution::Resolved(principal)),
        &json!({ "api_version": "v1" }),
    )
    .await
    .unwrap_err();

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(envelope["error_kind"], REQUEST_INVALID_KIND);
}

// --- read / projection handlers -------------------------------------------

#[tokio::test]
async fn list_proposals_over_an_empty_store_serves_an_honest_empty_page() {
    let (_dir, state) = fixture_state();
    let response = list_proposals(State(state.clone())).await;

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["data"]["items"], json!([]));
    assert_eq!(body["data"]["truncated"], false);
    assert_eq!(body["data"]["cap"], 200);
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the projection rides the shared tiers envelope"
    );
}

#[tokio::test]
async fn project_proposal_for_an_unknown_changeset_is_a_typed_404() {
    let (_dir, state) = fixture_state();
    let response =
        project_proposal(State(state.clone()), Path("changeset_absent".to_string())).await;

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error_kind"], "authoring_proposal_not_found");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn project_proposal_rejects_an_invalid_changeset_id() {
    let (_dir, state) = fixture_state();
    let response = project_proposal(State(state.clone()), Path("bad id".to_string())).await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["error_kind"], REQUEST_INVALID_KIND);
}

#[tokio::test]
async fn proposal_snapshot_over_an_unknown_changeset_serves_an_empty_history() {
    let (_dir, state) = fixture_state();
    let response =
        proposal_snapshot(State(state.clone()), Path("changeset_absent".to_string())).await;

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["data"]["changeset_id"], "changeset_absent");
    assert!(
        body["data"]["latest"].is_null(),
        "an unknown changeset has no latest revision"
    );
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

// --- the /authoring router-builder skeleton (un-mounted) ------------------

#[tokio::test]
async fn authoring_router_serves_the_list_read_through_the_middleware() {
    let (_dir, state) = fixture_state();
    // The read flows through the permissive principal middleware (no token).
    let router = authoring_router(state.clone()).with_state(state);
    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/proposals")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["data"]["items"], json!([]));
    assert_eq!(body["data"]["cap"], 200);
}

#[tokio::test]
async fn authoring_router_serves_agent_tool_catalog_and_principal_gated_prepare() {
    let (_dir, state) = fixture_state();
    let agent = agent();
    register_actor(&state, &agent);
    let token = issue_token_in_state(&state, &agent);
    let router = authoring_router(state.clone()).with_state(state.clone());

    let catalog_response = router
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/v1/agent-tools")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(catalog_response.status(), StatusCode::OK);
    let catalog = json_body(catalog_response).await;
    assert_eq!(catalog["data"]["tools"][0]["name"], "read_context");
    assert_eq!(
        catalog["data"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|tool| tool["name"] == "request_apply")
            .count(),
        1
    );

    let body = json!({
        "api_version": "v1",
        "command": "request_tool_permission",
        "idempotency_key": "idem:tool:search",
        "payload": {
            "tool_call_id": "tool_call_1",
            "name": "search_graph",
            "input": {
                "query": "approval gate",
                "type": "vault"
            }
        }
    });
    let missing = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/agent-tools/prepare")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(missing.status(), StatusCode::UNAUTHORIZED);

    let (status, prepared) = post_authoring(router, "/v1/agent-tools/prepare", &token, body).await;
    assert_eq!(status, StatusCode::OK, "{prepared}");
    assert_eq!(prepared["data"]["actor"]["id"], agent.id.as_str());
    assert_eq!(prepared["data"]["prepared"]["command"], "search_graph");
    assert_eq!(
        prepared["data"]["prepared"]["dispatch"]["kind"],
        "search_graph"
    );
    assert!(prepared["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn session_route_success_and_principal_error_are_tiered() {
    let (_dir, state) = fixture_state();
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let body = request_fixture(EndpointFamily::Session);
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, envelope) = post_authoring(router, "/v1/sessions", &token, body.clone()).await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(envelope["data"]["command"], "create_session");
    assert_eq!(envelope["data"]["status"], "created");
    assert!(envelope["data"]["session_id"].as_str().is_some());
    assert!(envelope["tiers"]["semantic"]["available"].is_boolean());

    let router = authoring_router(state.clone()).with_state(state);
    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/sessions")
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let envelope = json_body(response).await;

    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(envelope["error_kind"], TOKEN_MISSING_KIND);
    assert!(envelope["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn direct_write_route_is_enabled_by_default_with_no_capability_file() {
    // Uses the CORE-scaffolded fixture (not the bare `fixture_state()`): with
    // no capability file, direct-changeset is authoritative by default, so
    // this save must reach a real APPLIED receipt through the real core.
    let (dir, state) = fixture_state_with_core();
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let doc_ref = ".vault/plan/operation-plan.md";
    let base = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n";
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, body) = post_authoring(
        router,
        "/v1/direct-writes",
        &token,
        direct_write_envelope(
            doc_ref,
            "# Plan\n\nroute body\n",
            &blob_oid(base.as_bytes()),
            "idem:route:on-by-default",
        ),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "applied");
    assert!(
        body["data"].get("legacy").is_none(),
        "the retired legacy comparison must not appear on the outcome: {body}"
    );
    let Json(status_body) = crate::authoring::response::enabled_status(&state);
    assert_eq!(status_body["data"]["capabilities"]["direct_write"], true);
    assert!(
        !dir.path()
            .join(".vault/data/authoring-state/direct-write-capabilities.json")
            .exists(),
        "the enabled default is read, not synthesized by creating config"
    );
}

#[tokio::test]
async fn direct_write_route_is_disabled_by_the_capability_kill_switch() {
    let (dir, state) = fixture_state();
    crate::authoring::direct_write::DirectWriteCapabilities::write_for_tests(
        dir.path(),
        crate::authoring::direct_write::DirectWriteCapabilities::disabled(),
    );
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let doc_ref = ".vault/plan/2026-06-30-authoring-http-plan.md";
    let base = "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n";
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, body) = post_authoring(
        router,
        "/v1/direct-writes",
        &token,
        direct_write_envelope(
            doc_ref,
            "route body",
            &blob_oid(base.as_bytes()),
            "idem:route:off",
        ),
    )
    .await;

    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(body["error_kind"], "authoring_direct_write_disabled");
    let marker = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::DirectWrite, |uow| {
                uow.direct_writes()
                    .record_by_actor_key(&human, &IdempotencyKey::new("idem:route:off").unwrap())
            })
        })
        .unwrap();
    assert!(
        marker.is_none(),
        "flag-off direct route must not create direct-write records"
    );

    let Json(status_body) = crate::authoring::response::enabled_status(&state);
    assert_eq!(status_body["data"]["capabilities"]["direct_write"], false);
}

#[tokio::test]
async fn direct_write_route_uses_actor_token_and_records_agent_denial_as_value() {
    let (_dir, state) = fixture_state();
    register_actor(&state, &agent());
    let token = issue_token_in_state(&state, &agent());
    let doc_ref = ".vault/plan/2026-06-30-authoring-http-plan.md";
    let base = "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n";
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, body) = post_authoring(
        router,
        "/v1/direct-writes",
        &token,
        direct_write_envelope(
            doc_ref,
            "route denied body",
            &blob_oid(base.as_bytes()),
            "idem:route:agent:denied",
        ),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "agent denial is a value: {body}");
    assert_eq!(body["data"]["status"], "denied");
    assert_eq!(body["data"]["record"]["status"], "denied");
    assert!(
        body["data"]["eligibility"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("agents must propose changesets"))
    );
    // W05.P14: the wire discriminator, set from the actor-kind gate itself.
    assert_eq!(body["data"]["denial_kind"], "forbidden_actor");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
    assert!(
        !body.to_string().contains("route denied body"),
        "route value evidence must not leak the raw requested body: {body}"
    );
}

#[tokio::test]
async fn direct_write_route_rejects_the_wrong_command_kind_before_execution() {
    let (_dir, state) = fixture_state();
    register_actor(&state, &human_reviewer());
    let token = issue_token_in_state(&state, &human_reviewer());
    let doc_ref = ".vault/plan/2026-06-30-authoring-http-plan.md";
    let base = "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n";
    let mut envelope = direct_write_envelope(
        doc_ref,
        "route body",
        &blob_oid(base.as_bytes()),
        "idem:route:wrong-kind",
    );
    envelope["command"] = json!("create_session");
    let router = authoring_router(state.clone()).with_state(state);

    let (status, body) = post_authoring(router, "/v1/direct-writes", &token, envelope).await;

    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(body["error_kind"], REQUEST_INVALID_KIND);
}

#[tokio::test]
async fn direct_write_route_applies_a_frontmatter_edit_through_the_real_core() {
    let (dir, state) = fixture_state_with_core();
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let base = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n";
    let router = authoring_router(state.clone()).with_state(state);

    let (status, body) = post_authoring(
        router,
        "/v1/direct-writes",
        &token,
        direct_write_frontmatter_envelope(
            "operation-plan",
            "2026-08-08",
            &blob_oid(base.as_bytes()),
            "idem:route:frontmatter",
        ),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "applied");
    let saved = std::fs::read_to_string(dir.path().join(".vault/plan/operation-plan.md")).unwrap();
    assert!(saved.contains("date: '2026-08-08'"), "{saved}");
}

#[tokio::test]
async fn direct_write_route_applies_a_rename_through_the_real_core() {
    let (dir, state) = fixture_state_with_core();
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let base = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n";
    let router = authoring_router(state.clone()).with_state(state);

    let (status, body) = post_authoring(
        router,
        "/v1/direct-writes",
        &token,
        direct_write_rename_envelope(
            "operation-plan",
            "operation-plan-renamed",
            &blob_oid(base.as_bytes()),
            "idem:route:rename",
        ),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "applied");
    assert!(!dir.path().join(".vault/plan/operation-plan.md").exists());
    assert!(
        dir.path()
            .join(".vault/plan/operation-plan-renamed.md")
            .exists()
    );
}

#[tokio::test]
async fn direct_write_route_applies_a_create_document_through_the_real_core() {
    let (dir, state) = fixture_state_with_core();
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let router = authoring_router(state.clone()).with_state(state);

    let (status, body) = post_authoring(
        router,
        "/v1/direct-writes",
        &token,
        direct_write_create_envelope(
            "plan",
            "http-direct-create",
            "HTTP Direct Create",
            "idem:route:create",
        ),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["status"], "applied");
    let child = &body["data"]["record"]["apply_receipt"]["child"];
    assert_eq!(child["outcome"], "applied", "{body}");

    // W03.P09a: the outcome now ECHOES the created document's real
    // identity (path/node-id/stem) — the frontend auto-open restore
    // reads this instead of guessing core's date-slug filename
    // convention client-side. Assert on the ECHOED identity, then use
    // it (not a re-derived guess) to confirm the file landed for real.
    let document_path = child["document_path"]
        .as_str()
        .expect("an applied create echoes its real document_path");
    assert!(
        document_path.contains("http-direct-create"),
        "{document_path}"
    );
    let result_stem = child["result_stem"]
        .as_str()
        .expect("an applied create echoes its real result_stem");
    assert!(result_stem.contains("http-direct-create"), "{result_stem}");
    assert_eq!(
        child["result_node_id"].as_str(),
        Some(format!("doc:{result_stem}").as_str())
    );
    assert!(
        dir.path().join(document_path).exists(),
        "the real vaultspec-core create must land at the ECHOED document_path: {document_path}"
    );
}

#[tokio::test]
async fn direct_write_route_refuses_a_mismatched_scope_pin_as_a_redacted_denial() {
    let (_dir, state) = fixture_state();
    register_actor(&state, &human_reviewer());
    let token = issue_token_in_state(&state, &human_reviewer());
    let doc_ref = ".vault/plan/2026-06-30-authoring-http-plan.md";
    let base = "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n";
    let mut envelope = direct_write_envelope(
        doc_ref,
        "route body",
        &blob_oid(base.as_bytes()),
        "idem:route:scope-mismatch",
    );
    envelope["payload"]["scope"] = json!("/a/completely/different/workspace");
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, body) = post_authoring(router, "/v1/direct-writes", &token, envelope).await;

    assert_eq!(
        status,
        StatusCode::OK,
        "a scope mismatch is a denial VALUE: {body}"
    );
    assert_eq!(body["data"]["status"], "denied");
    assert!(
        body["data"]["eligibility"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("does not match the server's active workspace"))
    );
    // W05.P14: the wire discriminator, set at the scope-pin check itself.
    assert_eq!(body["data"]["denial_kind"], "scope_mismatch");
    assert!(
        !body.to_string().contains("completely/different/workspace"),
        "the denial must never echo the foreign scope back onto the wire: {body}"
    );
    // No ledger side effect: the mismatch is refused before ANY changeset
    // or direct-write record exists for this idempotency key.
    let marker = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::DirectWrite, |uow| {
                uow.direct_writes().record_by_actor_key(
                    &human_reviewer(),
                    &IdempotencyKey::new("idem:route:scope-mismatch").unwrap(),
                )
            })
        })
        .unwrap();
    assert!(
        marker.is_none(),
        "a scope-pin mismatch must not persist a direct-write record"
    );
}

#[tokio::test]
async fn direct_write_route_a_matching_scope_pin_proceeds_and_applies_through_the_real_core() {
    // The positive-path proof the mismatch test above does NOT cover: a
    // pin carrying the identity the FRONTEND actually sends
    // (`engine_model::scope_token`, not `modes::scope_id_for_worktree` —
    // see `scope_pin_mismatch`'s doc) must PROCEED, not be denied.
    let (dir, state) = fixture_state_with_core();
    let human = human_reviewer();
    register_actor(&state, &human);
    let token = issue_token_in_state(&state, &human);
    let base = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n";
    let mut envelope = direct_write_envelope(
        ".vault/plan/operation-plan.md",
        "# Plan\n\nscope-pinned body\n",
        &blob_oid(base.as_bytes()),
        "idem:route:scope-match",
    );
    envelope["payload"]["scope"] = json!(engine_model::scope_token(dir.path()));
    let router = authoring_router(state.clone()).with_state(state);

    let (status, body) = post_authoring(router, "/v1/direct-writes", &token, envelope).await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["data"]["status"], "applied",
        "a scope pin matching engine_model::scope_token must proceed and apply through \
         the real core: {body}"
    );
    let saved = std::fs::read_to_string(dir.path().join(".vault/plan/operation-plan.md")).unwrap();
    assert!(saved.contains("scope-pinned body"), "{saved}");
}

#[test]
fn scope_token_and_scope_id_for_worktree_diverge_on_a_windows_extended_length_root() {
    // Documents the regression class the two tests above guard against:
    // on a `\\?\`-prefixed root (the form a real, long/canonicalized
    // Windows workspace path can carry), `engine_model::scope_token`
    // strips the prefix while `modes::scope_id_for_worktree` does not —
    // comparing a frontend-sent pin against the WRONG one of these two
    // would wrongly deny every save on such a root. Prefix-free roots
    // (every temp-dir test above) coincide either way, which is exactly
    // why this divergence went undetected until a real extended-length
    // root exercised it.
    let extended = std::path::Path::new(r"\\?\C:\Users\example\long-workspace-root");
    let token = engine_model::scope_token(extended);
    let mode_scope = scope_id_for_worktree(extended);
    assert_ne!(
        token, mode_scope,
        "the two normalizations must diverge on an extended-length root — this is \
         precisely why `scope_pin_mismatch` must compare against `scope_token`, never \
         `scope_id_for_worktree`"
    );
    assert!(!token.starts_with("//?/"), "{token}");
    assert!(mode_scope.starts_with("//?/"), "{mode_scope}");
}

#[tokio::test]
async fn authoring_status_reports_enabled_direct_write_capability_through_router() {
    let (_dir, state) = fixture_state();
    let router = authoring_router(state.clone()).with_state(state);
    let response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/status")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["capabilities"]["direct_write"], true);
    assert!(
        body["data"]["capabilities"]
            .get("direct_write_dual_run")
            .is_none(),
        "the retired dual_run capability flag must not be served: {body}"
    );
    assert!(
        body["data"]["capabilities"]
            .get("direct_write_authority")
            .is_none(),
        "the retired legacy-authority capability flag must not be served: {body}"
    );
}

#[tokio::test]
async fn create_proposal_opens_a_draft_changeset_under_the_resolved_actor() {
    let (dir, state) = fixture_state();
    register_actor(&state, &agent());
    let (_token_dir, principal) = resolved_principal(&agent());

    let response = create_proposal(
        State(state.clone()),
        create_command(principal, dir.path(), "changeset_http_1", "idem:create:1"),
    )
    .await;

    let status = response.status();
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(status, StatusCode::OK, "create failed: {body}");
    assert_eq!(body["data"]["changeset_id"], "changeset_http_1");
    assert_eq!(body["data"]["status"], "draft");
    assert_eq!(body["data"]["command"], "create_proposal");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn create_proposal_replays_a_duplicate_idempotent_command() {
    let (dir, state) = fixture_state();
    register_actor(&state, &agent());

    let (_d1, principal1) = resolved_principal(&agent());
    let first = create_proposal(
        State(state.clone()),
        create_command(principal1, dir.path(), "changeset_http_2", "idem:create:2"),
    )
    .await;
    assert_eq!(first.status(), StatusCode::OK);

    // Same actor + idempotency key + request → the recorded outcome replays.
    let (_d2, principal2) = resolved_principal(&agent());
    let second = create_proposal(
        State(state.clone()),
        create_command(principal2, dir.path(), "changeset_http_2", "idem:create:2"),
    )
    .await;
    assert_eq!(second.status(), StatusCode::OK);
    let bytes = to_bytes(second.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["data"]["changeset_id"], "changeset_http_2");
    assert_eq!(body["data"]["command"], "create_proposal");
}

#[tokio::test]
async fn operation_mode_policy_write_denies_agent_principal() {
    let (_dir, state) = fixture_state();
    register_actor(&state, &agent());
    let (_token_dir, principal) = resolved_principal(&agent());

    let response = set_operation_mode(
        State(state.clone()),
        mode_command(
            principal,
            OperationMode::Autonomous,
            "idem:mode:agent-denied",
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["status"], "denied");
    assert_eq!(body["data"]["command"], "set_operation_mode");
    assert!(
        body["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("human or system")),
        "unexpected denial body: {body}"
    );
    let scope_id = scope_id_for_worktree(&state.active_workspace_root());
    let mode = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.modes().current_mode(&scope_id)
            })
        })
        .unwrap();
    assert_eq!(mode, OperationMode::Manual);
}

#[tokio::test]
async fn an_ineligible_command_is_a_200_denial_not_a_4xx_fault() {
    // Denials-are-values (ADR): an eligibility refusal rides the SUCCESS
    // envelope (200) as a denied decision carrying the domain reason — never a
    // 4xx. The fault map (`command_error_response`) only ever sees genuine
    // `StoreError`s; a denial never reaches it.
    let (_dir, state) = fixture_state();
    let eligibility = crate::authoring::model::ActionEligibility::denied(
        CommandKind::AppendDraft,
        "changeset is terminal and cannot be mutated",
    );
    let response = proposal_result_response(&state, ProposalCommandResult::Denied { eligibility });

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "a denial is a 200 value, not a fault"
    );
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["data"]["status"], "denied");
    assert_eq!(body["data"]["allowed"], false);
    assert_eq!(body["data"]["command"], "append_draft");
    assert!(
        body["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("terminal")),
        "the denial carries the domain reason: {body}"
    );
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the denial rides the shared tiers envelope"
    );
}

// ---- W14.P42a S259: conflict serve route ---------------------------------------

/// The conflict route serves an HONEST empty report for a proposal whose base is still
/// current — the "your base is current" value the review view renders directly.
#[tokio::test]
async fn conflict_report_route_serves_no_conflict_for_a_current_base() {
    let (dir, state) = fixture_state();
    let _submitted = create_then_submit(&state, dir.path(), "changeset_conflict_clean").await;

    let response = proposal_conflicts(
        State(state.clone()),
        axum::extract::Path("changeset_conflict_clean".to_string()),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["has_conflict"], false, "{body}");
    assert_eq!(body["data"]["findings"], json!([]));
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

/// The conflict route serves a base-staleness finding when the target document was
/// edited out-of-band since the proposal was drafted (ADDITIVE to the cheap `conflict`
/// field; the served detail is the full deterministic report).
#[tokio::test]
async fn conflict_report_route_serves_a_stale_base_conflict() {
    let (dir, state) = fixture_state();
    let _submitted = create_then_submit(&state, dir.path(), "changeset_conflict_stale").await;
    // An out-of-band edit to the target document since the proposal was drafted.
    std::fs::write(
        dir.path().join(".vault/plan/operation-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nedited out of band\n",
    )
    .unwrap();

    let response = proposal_conflicts(
        State(state.clone()),
        axum::extract::Path("changeset_conflict_stale".to_string()),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(
        body["data"]["has_conflict"], true,
        "a stale base is a served conflict: {body}"
    );
    let kind = body["data"]["findings"][0]["kind"]
        .as_str()
        .unwrap_or_default();
    assert!(
        kind == "stale_base_revision" || kind == "stale_whole_document_draft",
        "the finding names the stale base: {body}"
    );
}

/// A read of the conflict route for an unknown changeset is a typed 404, like the
/// proposal projection route.
#[tokio::test]
async fn conflict_report_route_for_an_unknown_changeset_is_a_typed_404() {
    let (_dir, state) = fixture_state();
    let response = proposal_conflicts(
        State(state.clone()),
        axum::extract::Path("changeset_absent".to_string()),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let body = json_body(response).await;
    assert_eq!(body["error_kind"], "authoring_proposal_not_found");
}

#[tokio::test]
async fn rebase_route_rebases_a_conflicted_changeset_to_a_fresh_draft_and_replays() {
    let (dir, state) = fixture_state();
    let conflicted_rev =
        create_and_drive_to_conflicted(&state, dir.path(), "changeset_rebase_ok").await;
    // An out-of-band edit stales the conflicted child's recorded base.
    std::fs::write(
        dir.path().join(".vault/plan/operation-plan.md"),
        EDITED_PLAN_BODY,
    )
    .unwrap();

    let (_d2, p2) = resolved_principal(&agent());
    let response = rebase_changeset(
        State(state.clone()),
        axum::extract::Path("changeset_rebase_ok".to_string()),
        rebase_command(p2, "changeset_rebase_ok", &conflicted_rev, "idem:rebase:ok"),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["status"], "draft", "{body}");
    assert_eq!(body["data"]["command"], "rebase");
    assert_eq!(body["data"]["changeset_id"], "changeset_rebase_ok");

    let changeset_id = ChangesetId::new("changeset_rebase_ok").unwrap();
    let after_rebase = latest_changeset_revision_for_test(&state, &changeset_id);

    // A REPLAY under the same idempotency key does NOT append a second revision.
    let (_d3, p3) = resolved_principal(&agent());
    let replay = rebase_changeset(
        State(state.clone()),
        axum::extract::Path("changeset_rebase_ok".to_string()),
        rebase_command(p3, "changeset_rebase_ok", &conflicted_rev, "idem:rebase:ok"),
    )
    .await;
    assert_eq!(replay.status(), StatusCode::OK);
    assert_eq!(
        latest_changeset_revision_for_test(&state, &changeset_id),
        after_rebase,
        "a replayed rebase appends no second revision (idempotent)"
    );
}

#[tokio::test]
async fn rebase_route_denies_a_non_conflicted_head_as_a_value() {
    let (dir, state) = fixture_state();
    // create_then_submit drives to NeedsReview — a non-conflicted head with no rebase arc.
    let _ = create_then_submit(&state, dir.path(), "changeset_rebase_nc").await;
    let changeset_id = ChangesetId::new("changeset_rebase_nc").unwrap();
    let revision = latest_changeset_revision_for_test(&state, &changeset_id);

    let (_d, p) = resolved_principal(&agent());
    let response = rebase_changeset(
        State(state.clone()),
        axum::extract::Path("changeset_rebase_nc".to_string()),
        rebase_command(p, "changeset_rebase_nc", &revision, "idem:rebase:nc"),
    )
    .await;

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "a non-conflicted rebase is a denial VALUE, not a fault"
    );
    let body = json_body(response).await;
    assert_eq!(body["data"]["status"], "denied", "{body}");
}

#[tokio::test]
async fn rebase_route_rejects_a_stale_expected_revision_as_a_409() {
    let (dir, state) = fixture_state();
    let _ = create_then_submit(&state, dir.path(), "changeset_rebase_stale").await;

    let (_d, p) = resolved_principal(&agent());
    let response = rebase_changeset(
        State(state.clone()),
        axum::extract::Path("changeset_rebase_stale".to_string()),
        rebase_command(
            p,
            "changeset_rebase_stale",
            &RevisionToken::new("proposal:not-the-head").unwrap(),
            "idem:rebase:stale",
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body = json_body(response).await;
    assert_eq!(body["error_kind"], "authoring_stale_revision");
}

#[tokio::test]
async fn rebase_route_rejects_a_path_body_changeset_mismatch() {
    let (_dir, state) = fixture_state();
    let (_d, p) = resolved_principal(&agent());
    // The body names a DIFFERENT changeset than the path — a coherence 400.
    let response = rebase_changeset(
        State(state.clone()),
        axum::extract::Path("changeset_path".to_string()),
        rebase_command(
            p,
            "changeset_body",
            &RevisionToken::new("proposal:rev1").unwrap(),
            "idem:rebase:mismatch",
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = json_body(response).await;
    assert_eq!(body["error_kind"], REQUEST_INVALID_KIND);
}

#[tokio::test]
async fn replacement_route_supersedes_the_source_and_creates_a_candidate() {
    let (dir, state) = fixture_state();
    register_actor(&state, &agent());
    let (_d, principal) = resolved_principal(&agent());
    let created = create_proposal(
        State(state.clone()),
        create_command(
            principal,
            dir.path(),
            "changeset_repl_src",
            "idem:create:repl",
        ),
    )
    .await;
    assert_eq!(created.status(), StatusCode::OK);

    // Drive the source to a non-terminal, non-conflicted head (NeedsReview) — no rebase
    // arc, so replacement is the explicit path.
    let source = ChangesetId::new("changeset_repl_src").unwrap();
    append_status_revision_for_test(&state, &source, ChangesetStatus::Proposed, 201);
    append_status_revision_for_test(&state, &source, ChangesetStatus::NeedsReview, 202);
    let source_rev = latest_changeset_revision_for_test(&state, &source);
    // An out-of-band edit staled the source base.
    std::fs::write(
        dir.path().join(".vault/plan/operation-plan.md"),
        EDITED_PLAN_BODY,
    )
    .unwrap();

    let (_d2, p2) = resolved_principal(&agent());
    let response = create_replacement(
        State(state.clone()),
        replacement_command(
            p2,
            "changeset_repl_src",
            &source_rev,
            "changeset_repl_new",
            "idem:repl",
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    // BOTH legs are surfaced: a fresh Draft candidate + the source superseded.
    assert_eq!(body["data"]["replacement"]["status"], "draft", "{body}");
    assert_eq!(
        body["data"]["replacement"]["changeset_id"],
        "changeset_repl_new"
    );
    assert_eq!(
        body["data"]["supersession"]["status"], "superseded",
        "the source was superseded: {body}"
    );

    // The durable heads confirm both legs.
    assert_eq!(
        changeset_status_for_test(&state, &source),
        ChangesetStatus::Superseded
    );
    assert_eq!(
        changeset_status_for_test(&state, &ChangesetId::new("changeset_repl_new").unwrap()),
        ChangesetStatus::Draft
    );
}

#[tokio::test]
async fn a_second_reviewer_claim_is_blocked_as_a_value() {
    let (dir, state) = fixture_state();
    let _ = create_then_submit(&state, dir.path(), "changeset_claim_contend").await;
    let (reviewer_a, reviewer_b) = (human_reviewer(), human_reviewer_b());
    register_actor(&state, &reviewer_a);
    register_actor(&state, &reviewer_b);
    let token_a = issue_token_in_state(&state, &reviewer_a);
    let token_b = issue_token_in_state(&state, &reviewer_b);

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status_a, envelope_a) = post_authoring(
        router,
        "/v1/review-claims",
        &token_a,
        review_claim_body("changeset_claim_contend", "idem:claim:a"),
    )
    .await;
    assert_eq!(status_a, StatusCode::OK, "{envelope_a}");
    assert_eq!(envelope_a["data"]["status"], "allowed");
    assert_eq!(envelope_a["data"]["claim"]["state"], "held");

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status_b, envelope_b) = post_authoring(
        router,
        "/v1/review-claims",
        &token_b,
        review_claim_body("changeset_claim_contend", "idem:claim:b"),
    )
    .await;
    assert_eq!(
        status_b,
        StatusCode::OK,
        "a contended claim is a denial VALUE: {envelope_b}"
    );
    assert_eq!(envelope_b["data"]["status"], "denied");
    assert!(
        envelope_b["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("different reviewer")),
        "the denial names the contention: {envelope_b}"
    );
}

#[tokio::test]
async fn an_automated_self_review_claim_is_refused() {
    let (dir, state) = fixture_state();
    // The proposer is `agent()` (registered by create_then_submit).
    let _ = create_then_submit(&state, dir.path(), "changeset_claim_self").await;
    let agent_token = issue_token_in_state(&state, &agent());

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/review-claims",
        &agent_token,
        review_claim_body("changeset_claim_self", "idem:claim:self"),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(envelope["data"]["status"], "denied", "{envelope}");
    assert!(
        envelope["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("its own")),
        "the self-review ban is named: {envelope}"
    );
}

#[tokio::test]
async fn a_non_holder_review_release_is_refused() {
    let (dir, state) = fixture_state();
    let _ = create_then_submit(&state, dir.path(), "changeset_claim_rel").await;
    let (reviewer_a, reviewer_b) = (human_reviewer(), human_reviewer_b());
    register_actor(&state, &reviewer_a);
    register_actor(&state, &reviewer_b);
    let token_a = issue_token_in_state(&state, &reviewer_a);
    let token_b = issue_token_in_state(&state, &reviewer_b);

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status_a, _) = post_authoring(
        router,
        "/v1/review-claims",
        &token_a,
        review_claim_body("changeset_claim_rel", "idem:claim:a"),
    )
    .await;
    assert_eq!(status_a, StatusCode::OK);

    // Reviewer B cannot release A's claim.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status_b, envelope_b) = post_authoring(
        router,
        "/v1/review-claims/release",
        &token_b,
        review_release_body("changeset_claim_rel", "idem:release:b"),
    )
    .await;
    assert_eq!(status_b, StatusCode::OK, "a non-holder release is a value");
    assert_eq!(envelope_b["data"]["status"], "denied");
    assert!(
        envelope_b["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("holding")),
        "the holder-only rule is named: {envelope_b}"
    );
}

#[tokio::test]
async fn respond_records_a_clarification_and_keeps_the_item_claimed() {
    let (dir, state) = fixture_state();
    let _ = create_then_submit(&state, dir.path(), "changeset_claim_resp").await;
    let reviewer = human_reviewer();
    register_actor(&state, &reviewer);
    let token = issue_token_in_state(&state, &reviewer);

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status_claim, _) = post_authoring(
        router,
        "/v1/review-claims",
        &token,
        review_claim_body("changeset_claim_resp", "idem:claim:resp"),
    )
    .await;
    assert_eq!(status_claim, StatusCode::OK);

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/review-claims/respond",
        &token,
        review_respond_body(
            "changeset_claim_resp",
            "please clarify the scope",
            "idem:respond",
        ),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{envelope}");
    assert_eq!(envelope["data"]["status"], "allowed");
    assert_eq!(
        envelope["data"]["claim"]["state"], "held",
        "the item stays claimed while the exchange runs: {envelope}"
    );
    assert_eq!(
        envelope["data"]["claim"]["latest_clarification"]["comment"],
        "please clarify the scope"
    );
}

#[tokio::test]
async fn review_queue_route_serves_the_needs_review_items_bounded() {
    let (dir, state) = fixture_state();
    let _ = create_then_submit(&state, dir.path(), "changeset_queue_1").await;

    let response = review_queue(State(state.clone())).await;
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["cap"], 200);
    assert_eq!(body["data"]["truncated"], false);
    let items = body["data"]["items"].as_array().expect("items array");
    assert!(!items.is_empty(), "the needs-review item is queued: {body}");
    assert!(
        ["queued", "claimed", "decision_submitted", "closed"]
            .contains(&items[0]["station_state"].as_str().unwrap_or_default()),
        "the item carries a composed four-state: {body}"
    );
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn provenance_route_serves_a_bounded_redacted_trail() {
    let (dir, state) = fixture_state();
    let _ = create_then_submit(&state, dir.path(), "changeset_prov_1").await;

    let response = proposal_provenance(
        State(state.clone()),
        axum::extract::Path("changeset_prov_1".to_string()),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["changeset_id"], "changeset_prov_1");
    assert_eq!(body["data"]["cap"], 200);
    let entries = body["data"]["entries"].as_array().expect("entries array");
    assert!(
        !entries.is_empty(),
        "the trail has revision entries: {body}"
    );
    // Redaction: any material ref surfaces id + content hash + byte length ONLY.
    for entry in entries {
        for material in entry["materials"].as_array().expect("materials array") {
            assert!(material["id"].is_string());
            assert!(material["content_hash"].is_string());
            assert!(material["byte_len"].is_number());
        }
    }
    // The trail never leaks a raw document body (only fingerprints).
    assert!(
        !body.to_string().to_lowercase().contains("new body"),
        "provenance must not leak a raw document body: {body}"
    );
}
