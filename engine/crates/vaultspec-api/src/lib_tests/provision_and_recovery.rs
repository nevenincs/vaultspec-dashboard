use super::*;

#[tokio::test]
async fn search_rejects_unknown_scope_in_the_request_body() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = post_json_with_token(
        router,
        "/search",
        json!({
            "scope": "/no/such/worktree",
            "query": "graph state",
            "type": "vault"
        }),
        Some(&token),
    )
    .await;

    assert_eq!(status, StatusCode::BAD_REQUEST, "bad search scope: {body}");
    assert!(
        body.get("tiers").is_some(),
        "search scope validation error must carry tiers: {body}"
    );
}

// --- provisioning plane (project-provisioning ADR) -----------------------

#[tokio::test]
async fn provision_status_serves_the_projection_over_tiers() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get_with_token(router, "/provision/status", Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "provision status: {body}");
    let data = &body["data"];
    // Backend-served projection (never client-derived): every decision field
    // present and typed.
    assert!(data["target"].is_string(), "target path served: {body}");
    assert!(data["managed"].is_boolean(), "managed served: {body}");
    assert!(
        data["recommended"].is_string(),
        "recommended served: {body}"
    );
    // The fixture root has a `.vault/` but is not a git repo, so the projection
    // reports the git gate honestly and recommends fixing that first.
    assert_eq!(
        data["git"]["present"], false,
        "fixture is not a git repo: {body}"
    );
    assert_eq!(
        data["framework"]["vault_present"], true,
        "fixture has a vault: {body}"
    );
    assert_eq!(
        data["recommended"], "not-a-git-project",
        "git gate leads: {body}"
    );
    assert!(
        data["core"]["floor"].is_string(),
        "core floor declared: {body}"
    );
    assert!(
        data["rag"]["floor"].is_string(),
        "rag floor declared: {body}"
    );
    assert!(
        body["tiers"].is_object(),
        "provision status carries tiers: {body}"
    );
}

#[tokio::test]
async fn provision_run_force_without_confirm_is_refused_before_any_spawn() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = post_json_with_token(
        router,
        "/provision/run",
        json!({ "action": "install", "provider": "all", "force": true }),
        Some(&token),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "force needs confirm: {body}"
    );
    assert_eq!(body["error_kind"], "confirm_required", "typed gate: {body}");
    assert!(
        body["tiers"].is_object(),
        "gate error carries tiers: {body}"
    );
}

#[tokio::test]
async fn provision_run_install_without_provider_is_a_typed_error() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = post_json_with_token(
        router,
        "/provision/run",
        json!({ "action": "install" }),
        Some(&token),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "install needs provider: {body}"
    );
    assert_eq!(
        body["error_kind"], "provider_required",
        "typed error kind: {body}"
    );
}

#[tokio::test]
async fn provision_run_rejects_an_unknown_workspace_target() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    // A migrate targets a project; naming an unregistered workspace id must be
    // an honest 400 — a target resolves ONLY through the registry.
    let (status, body) = post_json_with_token(
        router,
        "/provision/run",
        json!({ "action": "migrate", "workspace": "no-such-workspace-id" }),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "unknown workspace: {body}");
    assert!(
        body["tiers"].is_object(),
        "target error carries tiers: {body}"
    );
}

#[tokio::test]
async fn provision_job_unknown_id_is_404_with_tiers() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) =
        get_with_token(router, "/provision/jobs/prov-does-not-exist", Some(&token)).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "unknown job: {body}");
    assert!(body["tiers"].is_object(), "404 carries tiers: {body}");
}

#[tokio::test]
async fn provision_run_is_job_shaped_and_pollable() {
    // Exercises the run -> job-id -> poll plumbing over the real wire without
    // asserting an installer OUTCOME (a real install/acquire is the by-hand
    // step): a migrate against the fixture spawns the resolved core verb (or
    // fails fast to spawn when core is absent, as the adversarial suite runs),
    // and either way the job is created, retrievable, and reaches a terminal
    // state. No mock — the actual subprocess runner drives it.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = post_json_with_token(
        router.clone(),
        "/provision/run",
        json!({ "action": "migrate" }),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "run accepted: {body}");
    let id = body["data"]["job"]["id"]
        .as_str()
        .expect("job id served")
        .to_string();
    assert_eq!(
        body["data"]["job"]["state"], "running",
        "job starts running: {body}"
    );
    assert_eq!(
        body["data"]["attached"], false,
        "fresh job not attached: {body}"
    );

    // Poll to a terminal state (bounded): migrations on a tiny fixture, or a
    // fast spawn failure, both settle quickly.
    let mut last = Value::Null;
    for _ in 0..100 {
        let (s, b) = get_with_token(
            router.clone(),
            &format!("/provision/jobs/{id}"),
            Some(&token),
        )
        .await;
        assert_eq!(s, StatusCode::OK, "job pollable: {b}");
        last = b["data"]["job"].clone();
        let st = last["state"].as_str().unwrap_or("");
        assert!(
            matches!(st, "running" | "succeeded" | "failed"),
            "valid state {st}: {last}"
        );
        if st != "running" {
            assert!(
                last["outcome"].is_object(),
                "terminal job carries an outcome: {last}"
            );
            return;
        }
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    panic!("job {id} did not reach a terminal state in time: {last}");
}

#[tokio::test]
async fn a_poisoned_lock_degrades_instead_of_cascading_into_a_permanent_outage() {
    // Robustness H2 regression: a panic while a lock guard is held poisons
    // that lock. WITHOUT poison recovery, every later `.lock()/.read()`
    // re-panics → one transient panic = permanent total outage. With the
    // `unwrap_or_else(|e| e.into_inner())` recovery (paired with the
    // CatchPanicLayer), the engine keeps serving.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    // The per-scope live locks now live on the active scope's cell.
    let cell = state.active_cell();

    // Poison the graph, meta-cache, and ring locks by panicking while each
    // guard is held — exactly the shape of a handler panicking mid-commit.
    // The catch must NOT propagate; we catch the unwind at the seam.
    for poisoner in [
        {
            let c = cell.clone();
            std::thread::spawn(move || {
                let _g = c.graph.write().unwrap();
                panic!("poison the graph lock");
            })
        },
        {
            let c = cell.clone();
            std::thread::spawn(move || {
                let _g = c.meta_cache.lock().unwrap();
                panic!("poison the meta-cache lock");
            })
        },
        {
            let c = cell.clone();
            std::thread::spawn(move || {
                let _g = c.ring.lock().unwrap();
                panic!("poison the ring lock");
            })
        },
    ] {
        assert!(
            poisoner.join().is_err(),
            "poisoner thread must have panicked"
        );
    }

    // The locks are now poisoned. Direct accessors must recover, not panic.
    let graph = cell.graph_arc();
    assert!(
        graph.node_count() > 0,
        "graph_arc recovers a poisoned RwLock"
    );
    let meta = cell.meta_edges();
    let _ = meta.len(); // meta_edges recovers the poisoned Mutex

    // And the live front door still serves a request end-to-end despite the
    // three poisoned locks — the cascade is contained.
    let router = build_router(state);
    let (status, body) = get_with_token(router.clone(), "/status", Some(&token)).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "engine still serves after a lock-poison event"
    );
    assert_eq!(body["data"]["ok"], true);
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}
