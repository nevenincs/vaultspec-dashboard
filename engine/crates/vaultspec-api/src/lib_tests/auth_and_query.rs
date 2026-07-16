use super::*;

#[tokio::test]
async fn health_is_ungated_everything_else_is_bearer_gated() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, _) = get_with_token(router.clone(), "/health", None).await;
    assert_eq!(status, StatusCode::OK, "/health ungated");

    let (status, _) = get_with_token(router.clone(), "/status", None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED, "gated without bearer");

    let (status, body) = get_with_token(router, "/status", Some(&token)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["watcher"]["mode"], "starting",
        "no watcher in test state"
    );
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn authoring_status_is_enabled_and_semantic_and_tiered() {
    // W03.P39 mount: the authoring domain is a fenced product API (NOT a
    // core-shaped write proxy) and is now ENABLED — the propose → review →
    // apply → rollback slice is live. The status snapshot reports the boundary
    // + the V1 capability set.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get_with_token(router, "/authoring/status", Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["feature"], authoring::FEATURE_TAG);
    assert_eq!(body["data"]["enabled"], true);
    assert_eq!(body["data"]["status"], "enabled");
    assert_eq!(body["data"]["capabilities"]["proposals"], true);
    assert_eq!(body["data"]["capabilities"]["apply"], true);
    assert_eq!(
        body["data"]["route_family"], "/authoring",
        "the collaborator-facing route family is semantic"
    );
    assert_eq!(
        body["data"]["ownership"]["materialization"], "internal vaultspec-core adapter",
        "core stays hidden behind the future adapter"
    );
    assert_eq!(
        body["data"]["ownership"]["core_routes_are_authoring_contract"], false,
        "authoring status must not expose /ops/core as the authoring API"
    );
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "authoring status carries the tiers block"
    );
}

#[tokio::test]
async fn authoring_command_routes_are_mounted_under_the_principal_layer() {
    // W03.P39 mount smoke: the nested authoring router is reachable — a read
    // flows (principal-permissive) with just the machine bearer, and a command
    // route is mounted AND gated by the principal layer (a machine bearer alone,
    // with no actor token, is a 401 from the ResolvedCommand extractor, never a
    // 404 for an unmounted route).
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) =
        get_with_token(router.clone(), "/authoring/v1/proposals", Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "read is reachable: {body}");
    assert_eq!(body["data"]["items"], json!([]));

    let (status, body) = post_json_with_token(
        router,
        "/authoring/v1/apply-requests",
        json!({
            "api_version": "v1",
            "command": "request_apply",
            "idempotency_key": "idem:mount:apply",
            "payload": {
                "changeset_id": "changeset_mount",
                "approval_id": "approval_mount",
                "targets": []
            }
        }),
        Some(&token),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "a command needs an actor token, not just the machine bearer: {body}"
    );
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the principal denial carries tiers"
    );
}

#[tokio::test]
async fn proposal_append_and_replace_draft_routes_are_mounted_and_principal_gated() {
    // W12.P22 fold-in: the served tool catalog advertises `propose_changeset`
    // append/replace, so those verbs MUST have executable routes (not
    // advertise-what-can't-run). Each is mounted AND principal-gated: a machine
    // bearer with no actor token is a 401 from the extractor, never a 404.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    for verb in ["append", "replace"] {
        let (status, body) = post_json_with_token(
            router.clone(),
            &format!("/authoring/v1/proposals/changeset_mount/{verb}"),
            json!({
                "api_version": "v1",
                "command": "append_draft",
                "idempotency_key": format!("idem:mount:{verb}"),
                "payload": {
                    "changeset_id": "changeset_mount",
                    "expected_revision": "changeset:mount",
                    "summary": "mount smoke",
                    "operations": []
                }
            }),
            Some(&token),
        )
        .await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "the {verb} draft route is mounted and needs an actor token: {body}"
        );
    }
}

#[tokio::test]
async fn authoring_api_misses_and_method_errors_are_tiered_json() {
    // The `/authoring` prefix is an API boundary, not an SPA deep link.
    // Unknown authoring paths and framework method errors must therefore be
    // JSON API errors with tiers, not HTML fallback or tiers-less axum text.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) =
        get_with_token(router.clone(), "/authoring/no-such-route", Some(&token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
    assert!(
        body["error"]
            .as_str()
            .is_some_and(|message| message.contains("unknown API path")),
        "unknown authoring API paths must fail as API JSON: {body}"
    );
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "unknown authoring API path carries tiers"
    );

    let (status, body) =
        post_json_with_token(router, "/authoring/status", json!({}), Some(&token)).await;
    assert_eq!(status, StatusCode::METHOD_NOT_ALLOWED, "{body}");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "method errors carry tiers"
    );
}

#[tokio::test]
async fn node_family_serves_from_the_live_graph() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let (status, body) = get_with_token(
        router.clone(),
        "/nodes/doc:2026-06-12-srv-plan",
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["data"]["detail"]["bundle"]["node"]["id"],
        "doc:2026-06-12-srv-plan"
    );

    let (status, _) = get_with_token(router, "/nodes/doc:nope", Some(&token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "unknown node: truthful 404");
}

#[tokio::test]
async fn scope_validation_rejects_unserved_scopes() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let served = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);
    let (status, _) = get_with_token(
        router.clone(),
        "/filters?scope=/somewhere/else",
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, body) = get_with_token(
        router,
        &format!("/filters?scope={}", urlencode(&served)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["data"]["vocabulary"]["tiers"].is_array());
}

#[tokio::test]
async fn graph_embeddings_carries_generation_and_degrades_semantic_when_rag_is_down() {
    // graph-semantic-embeddings ADR D7/D8: /graph/embeddings rides the shared
    // envelope so the tiers block is carried on every response, stamps the
    // graph generation it was read at, and — with rag/Qdrant down in this
    // test environment — reports the semantic tier Unavailable and returns NO
    // vectors (honest degradation, never a bare error). The bad-scope path
    // still 400s honestly with the tiers block attached.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let served = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    // Unknown scope: a tiered 400 (the bad-scope honesty path).
    let (status, _) = get_with_token(
        router.clone(),
        "/graph/embeddings?scope=/nowhere",
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Served scope, rag absent: 200 with an empty embedding set, the
    // generation stamp, and the semantic tier reported Unavailable.
    let (status, body) = get_with_token(
        router,
        &format!("/graph/embeddings?scope={}", urlencode(&served)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    // The shared envelope carries the tiers block (every-wire-response rule);
    // semantic is Unavailable because rag/Qdrant is not running here (D7).
    assert_eq!(body["tiers"]["semantic"]["available"], Value::Bool(false));
    // No vectors served while rag is down — honest absence, not an error.
    assert_eq!(
        body["data"]["embeddings"].as_array().map(|a| a.len()),
        Some(0)
    );
    // The generation stamp the client caches per generation (D8) is present
    // and is an integer (read off the cell's generation counter).
    assert!(body["data"]["generation"].is_u64());
    // truncated is null on a degraded read (no bound fired).
    assert_eq!(body["data"]["truncated"], Value::Null);
}

#[tokio::test]
async fn pipeline_returns_active_artifacts_with_the_tiers_block_on_success() {
    // W02.P05.S25: /pipeline returns the in-flight artifacts (active plan +
    // proposed ADR) with the tiers block on success. A complete plan and a
    // rejected ADR must be excluded — the projection is bounded to active.
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
    // Active plan (one open step), tier L3.
    std::fs::write(
            dir.path().join(".vault/plan/2026-06-14-w-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#w'\ntier: L3\n---\n\n- [x] `S01` - did it.\n- [ ] `S02` - todo.\n",
        )
        .unwrap();
    // Complete plan — excluded.
    std::fs::write(
        dir.path().join(".vault/plan/2026-06-14-done-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#w'\ntier: L1\n---\n\n- [x] `S01` - done.\n",
    )
    .unwrap();
    // Proposed ADR — included.
    std::fs::write(
            dir.path().join(".vault/adr/2026-06-14-w-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#w'\n---\n\n# `w` adr: `t` | (**status:** `proposed`)\n\nbody\n",
        )
        .unwrap();
    // Rejected ADR — excluded.
    std::fs::write(
            dir.path().join(".vault/adr/2026-06-14-no-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#w'\n---\n\n# `no` adr: `t` | (**status:** `rejected`)\n\nbody\n",
        )
        .unwrap();
    let state = app::build_state(dir.path().to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        &format!("/pipeline?scope={}", urlencode(&scope)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "pipeline success: {body}");
    let artifacts = body["data"]["artifacts"].as_array().unwrap();
    let stems: Vec<&str> = artifacts
        .iter()
        .map(|a| a["stem"].as_str().unwrap())
        .collect();
    assert_eq!(
        stems,
        vec!["2026-06-14-w-adr", "2026-06-14-w-plan"],
        "active plan + proposed ADR only, sorted by stable id"
    );
    // The active plan carries tier, progress, and the execute phase.
    let plan = artifacts
        .iter()
        .find(|a| a["stem"] == "2026-06-14-w-plan")
        .unwrap();
    assert_eq!(plan["tier"], "L3");
    assert_eq!(plan["progress"]["done"], 1);
    assert_eq!(plan["progress"]["total"], 2);
    assert_eq!(plan["phase"], "execute");
    // The proposed ADR carries its status and the adr phase.
    let adr = artifacts
        .iter()
        .find(|a| a["stem"] == "2026-06-14-w-adr")
        .unwrap();
    assert_eq!(adr["status"], "proposed");
    assert_eq!(adr["phase"], "adr");
    // Tiers block present on success.
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn plan_interior_carries_the_tiers_block_and_404s_an_unknown_node() {
    // W03.P08.S47: /nodes/{id}/plan-interior carries the tiers block on
    // success and 404s an unknown node, through the shared envelope.
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::write(
        dir.path().join(".vault/plan/2026-06-14-pi-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#pi'\ntier: L3\n---\n\n# `pi` plan\n\n\
             ## Wave `W01` - w\n\n### Phase `W01.P01` - p\n\n\
             - [x] `W01.P01.S01` - done it.\n- [ ] `W01.P01.S02` - todo.\n",
    )
    .unwrap();
    let state = app::build_state(dir.path().to_path_buf());
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get_with_token(
        router.clone(),
        "/nodes/doc:2026-06-14-pi-plan/plan-interior",
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "plan interior: {body}");
    let interior = &body["data"]["interior"];
    assert_eq!(interior["plan_node_id"], "doc:2026-06-14-pi-plan");
    let waves = interior["waves"].as_array().unwrap();
    assert_eq!(waves.len(), 1);
    let steps = waves[0]["phases"][0]["steps"].as_array().unwrap();
    assert_eq!(steps.len(), 2);
    assert_eq!(steps[0]["id"], "S01");
    assert_eq!(steps[0]["done"], true);
    assert_eq!(steps[1]["done"], false);
    // The wave carries a full-subtree rollup, and the plan a structural
    // summary with the derived completion state — served, not client-derived.
    assert_eq!(waves[0]["rollup"]["done"], 1);
    assert_eq!(waves[0]["rollup"]["total"], 2);
    let summary = &interior["summary"];
    assert_eq!(summary["wave_count"], 1);
    assert_eq!(summary["phase_count"], 1);
    assert_eq!(summary["step_count"], 2);
    assert_eq!(summary["done_count"], 1);
    assert_eq!(summary["plan_state"], "in-progress");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "tiers block on success"
    );

    // Unknown node → truthful 404 with the tiers block.
    let (status, body) = get_with_token(
        router.clone(),
        "/nodes/doc:nope/plan-interior",
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body["tiers"]["semantic"]["available"].is_boolean());

    // A non-plan node (the wave container itself) also 404s — it has no
    // plan interior.
    let (status, _) = get_with_token(
        router,
        "/nodes/plan:2026-06-14-pi-plan%2FW01/plan-interior",
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "a container is not a plan");
}

#[tokio::test]
async fn pipeline_unknown_scope_400s_with_the_tiers_block() {
    // W02.P05.S26: an unknown scope 400s with the tiers block attached,
    // never a hand-built body — the shared envelope/api_error path.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let (status, body) =
        get_with_token(router, "/pipeline?scope=/nowhere/at/all", Some(&token)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].is_string(), "honest error message");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the 400 still carries the tiers block"
    );
}

#[tokio::test]
async fn ops_whitelist_rejects_unlisted_verbs() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let response = router
        .oneshot(
            Request::post("/ops/core/vault-archive")
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::FORBIDDEN, "R1 whitelist");
}

#[tokio::test]
async fn served_tiers_carry_the_component_handshake() {
    // P02.S08/S09 (dashboard-packaging D6): every served tiers block
    // declares the component floors, with rag honestly version-less and —
    // in this fixture workspace, which has no rag service — semantic
    // truthfully unavailable alongside its component block.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let (status, body) = get_with_token(router, "/status", Some(&token)).await;
    assert_eq!(status, StatusCode::OK);
    let core = &body["tiers"]["declared"]["component"];
    assert_eq!(core["name"], "vaultspec-core");
    assert_eq!(core["floor"], "0.1.36");
    assert!(
        core["meets_floor"].is_boolean() || core["meets_floor"].is_null(),
        "floor verdict is served, never guessed: {core}"
    );
    let rag = &body["tiers"]["semantic"]["component"];
    assert_eq!(rag["name"], "vaultspec-rag");
    assert_eq!(rag["floor"], "0.2.28");
    assert!(rag["version"].is_null(), "rag version is honestly unknown");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "availability stays the tier computation's verdict"
    );
}

// Without the embed-spa feature the fixture workspace has no bundle, so
// the deep link resolves to the placeholder; with the feature the
// embedded store answers first and the placeholder is unreachable — the
// embedded suite below owns that case.
