use super::*;

// --- workspace registry wire surface (dashboard-workspace-registry P02) ---

/// Build a real one-commit git workspace with a vault doc at `root`.
fn vault_git_repo(root: &std::path::Path) {
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-14-ws-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#ws'\n---\n\nMentions `src/a.rs`.\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);
}

#[tokio::test]
async fn workspaces_route_lists_the_launch_root_with_tiers_and_active_marker() {
    // GET /workspaces enumerates the registry through the shared envelope:
    // the boot-auto-registered launch root with its id/label/path, the
    // launch-default marker, a reachability state, the active-workspace id,
    // and the per-tier tiers block (every-wire-response-carries-the-tiers).
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    vault_git_repo(root);

    let state = app::build_state(root.to_path_buf());
    // Mirror the boot auto-register (build_state alone does not run it; the
    // serve() boot path does — replicate it here so the route has a root).
    let ws_id = {
        let ws = ingest_git::workspace::Workspace::discover(&state.workspace_root).unwrap();
        routes::scope_token(&ws.common_dir)
    };
    let launch_token = routes::scope_token(&state.workspace_root);
    {
        let us = state.user_state.lock().unwrap();
        us.auto_register_launch(&ws_id, "main", &launch_token, app::now_ms())
            .unwrap();
        us.set_active_workspace(&ws_id, app::now_ms()).unwrap();
    }
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get_with_token(router, "/workspaces", Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let roots = body["data"]["workspaces"]
        .as_array()
        .expect("workspaces array");
    assert_eq!(roots.len(), 1, "only the launch root is registered");
    assert_eq!(roots[0]["id"], ws_id);
    assert_eq!(roots[0]["is_launch"], true, "launch-default marker present");
    assert_eq!(roots[0]["reachable"], true, "launch root probes reachable");
    assert_eq!(body["data"]["active_workspace"], ws_id);
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "carries the tiers block"
    );
}

#[tokio::test]
async fn map_default_workspace_is_unchanged_and_unknown_workspace_400s() {
    // /map without `workspace=` is the unchanged single-workspace default
    // (it enumerates the launch root's worktrees); an unknown registered id
    // 400s honestly with the tiers block.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    vault_git_repo(root);
    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get_with_token(router.clone(), "/map", Some(&token)).await;
    assert_eq!(status, StatusCode::OK, "default /map unchanged: {body}");
    assert!(
        body["data"]["worktrees"]
            .as_array()
            .is_some_and(|w| !w.is_empty()),
        "default /map lists the launch root's worktrees"
    );

    let (status, body) =
        get_with_token(router, "/map?workspace=not-a-registered-root", Some(&token)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "unknown workspace 400s");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the 400 still carries the tiers block"
    );
}

#[tokio::test]
async fn put_session_registers_a_sibling_then_forgets_it_read_only() {
    // PUT /session add_workspace registers a real sibling git workspace
    // read-only (it appears on /workspaces); forget_workspace removes it.
    // Neither touches the repository on disk — registering only records the
    // operator-supplied path.
    let workspace = tempfile::tempdir().unwrap();
    let main = workspace.path().join("main");
    std::fs::create_dir_all(&main).unwrap();
    vault_git_repo(&main);
    // A SEPARATE git workspace the operator will register.
    let sibling = workspace.path().join("other-project");
    std::fs::create_dir_all(&sibling).unwrap();
    vault_git_repo(&sibling);

    let state = app::build_state(main.clone());
    // Seed the launch root so the registry is non-empty (boot parity).
    let launch_id = {
        let ws = ingest_git::workspace::Workspace::discover(&state.workspace_root).unwrap();
        routes::scope_token(&ws.common_dir)
    };
    {
        let us = state.user_state.lock().unwrap();
        us.auto_register_launch(
            &launch_id,
            "main",
            &routes::scope_token(&state.workspace_root),
            app::now_ms(),
        )
        .unwrap();
    }
    let token = state.bearer.clone();
    let router = build_router(state);

    let sibling_path = routes::scope_token(&std::fs::canonicalize(&sibling).unwrap());
    let (status, body) = put_json_with_token(
        router.clone(),
        "/session",
        json!({ "add_workspace": sibling_path }),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "registering a sibling: {body}");

    let (_, body) = get_with_token(router.clone(), "/workspaces", Some(&token)).await;
    let roots = body["data"]["workspaces"].as_array().unwrap();
    assert_eq!(roots.len(), 2, "launch + the registered sibling");
    let sibling_id = roots
        .iter()
        .find(|r| r["is_launch"] == false)
        .expect("the sibling root")["id"]
        .as_str()
        .unwrap()
        .to_string();

    // The sibling repo on disk is untouched by registration: still exactly
    // the one fixture commit, no new refs/worktrees created by the engine.
    let sibling_commits = {
        let out = std::process::Command::new("git")
            .current_dir(&sibling)
            .args(["rev-list", "--count", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    assert_eq!(sibling_commits, "1", "registration never mutated the repo");

    // Forget the sibling: a config delete only; the registry returns to one.
    let (status, body) = put_json_with_token(
        router.clone(),
        "/session",
        json!({ "forget_workspace": sibling_id }),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "forgetting the sibling: {body}");
    let (_, body) = get_with_token(router, "/workspaces", Some(&token)).await;
    assert_eq!(
        body["data"]["workspaces"].as_array().unwrap().len(),
        1,
        "the sibling is forgotten; the launch root remains"
    );
}

// --- content-fetch route (review-rail-viewers P01) ---

#[tokio::test]
async fn content_route_serves_a_vault_doc_and_a_code_file_with_tiers() {
    // P01.S06: GET /nodes/{id}/content serves the bytes of a doc:<stem> and a
    // code:<path> node through the shared envelope, with path/blob_hash/
    // byte_len/language_hint/text and the tiers block on success.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    let doc_body = "---\ntags:\n  - '#adr'\n  - '#c'\n---\n\n# `c` adr\n\nthe document body\n";
    std::fs::write(root.join(".vault/adr/2026-06-16-c-adr.md"), doc_body).unwrap();
    std::fs::write(root.join("src/main.rs"), "fn main() {}\n").unwrap();

    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    // doc:<stem> resolves to the .vault/adr/<stem>.md file.
    let (status, body) = get_with_token(
        router.clone(),
        &format!(
            "/nodes/doc:2026-06-16-c-adr/content?scope={}",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "doc content: {body}");
    assert_eq!(body["data"]["path"], ".vault/adr/2026-06-16-c-adr.md");
    assert_eq!(body["data"]["text"], doc_body);
    assert_eq!(body["data"]["language_hint"], "markdown");
    assert_eq!(body["data"]["byte_len"], doc_body.len());
    assert!(
        body["data"]["blob_hash"].is_string(),
        "carries the blob_hash"
    );
    assert!(
        body["data"]["truncated"].is_null(),
        "a small doc is not truncated"
    );
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the success envelope carries the tiers block"
    );

    // code:<path> resolves to the worktree file directly. A code id carries
    // slashes, so the client percent-encodes them into one path segment.
    let (status, body) = get_with_token(
        router,
        &format!(
            "/nodes/{}/content?scope={}",
            percent_encode("code:src/main.rs"),
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "code content: {body}");
    assert_eq!(body["data"]["path"], "src/main.rs");
    assert_eq!(body["data"]["text"], "fn main() {}\n");
    assert_eq!(body["data"]["language_hint"], "rust");
}

#[tokio::test]
async fn content_route_byte_caps_a_large_file_with_an_honest_truncated_block() {
    // P01.S06: a file beyond MAX_CONTENT_BYTES is truncated with a truncated
    // block stating the full and served sizes — never an unbounded body.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join("src")).unwrap();
    let big = "x".repeat(routes::content::MAX_CONTENT_BYTES + 4096);
    std::fs::write(root.join("src/big.txt"), &big).unwrap();

    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    // The served body is ~MAX_CONTENT_BYTES (1 MiB), so read it with a
    // generous limit beyond the default 1 MiB the small helpers use.
    let response = router
        .oneshot(
            Request::get(format!(
                "/nodes/{}/content?scope={}",
                percent_encode("code:src/big.txt"),
                urlencode(&scope)
            ))
            .header("host", "127.0.0.1")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 8 << 20)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
    assert_eq!(status, StatusCode::OK, "byte-cap: {body}");
    assert_eq!(body["data"]["byte_len"], big.len(), "full size reported");
    assert_eq!(
        body["data"]["truncated"]["total_bytes"],
        big.len(),
        "truncated block states the full size"
    );
    assert_eq!(
        body["data"]["truncated"]["returned_bytes"],
        routes::content::MAX_CONTENT_BYTES,
        "served exactly the cap"
    );
    assert_eq!(
        body["data"]["text"].as_str().unwrap().len(),
        routes::content::MAX_CONTENT_BYTES,
        "the served text is exactly the cap"
    );
}

#[tokio::test]
async fn content_route_rejects_path_traversal_with_a_tiered_400() {
    // P01.S06: a code id whose path escapes the worktree root is a tiered
    // 400 (request error), distinct from degradation, carrying the tiers
    // block — never a read outside the root.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-16-t-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#t'\n---\n\nbody\n",
    )
    .unwrap();
    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        &format!(
            "/nodes/code:..%2F..%2Fsecrets.txt/content?scope={}",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "traversal 400: {body}");
    assert!(body["error"].is_string(), "honest error message");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the traversal 400 carries the tiers block"
    );
}

#[tokio::test]
async fn content_route_404s_a_missing_code_file_not_a_structural_degradation() {
    // rag-audit fix: a `code:` id naming a path that does NOT exist on disk
    // (the dominant case is a node minted from a doc mention of a since-DELETED
    // file) is a NOT-FOUND request — a tiered 404 so the viewer renders its
    // designed "file unavailable" state — NOT the spurious 400 that conflated a
    // missing file with an unreadable substrate and flooded the console.
    // Mirrors the ref-scope `NotAtRef -> 404`; a genuine IO failure
    // (permissions) still degrades the structural tier as a 400.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-16-d-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#d'\n---\n\nbody\n",
    )
    .unwrap();
    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        &format!(
            "/nodes/{}/content?scope={}",
            percent_encode("code:src/does-not-exist.rs"),
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "missing code file: {body}");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn content_route_404s_an_unknown_doc_stem_and_400s_a_non_content_node() {
    // P01.S06: an unknown doc stem is a 404; a non-content node kind (a
    // feature) is a 400 — both with the tiers block.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router.clone(),
        &format!("/nodes/doc:nope/content?scope={}", urlencode(&scope)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "unknown stem: {body}");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());

    let (status, body) = get_with_token(
        router,
        &format!("/nodes/feature:srv/content?scope={}", urlencode(&scope)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "non-content node: {body}");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn put_session_refuses_forgetting_the_last_launch_root() {
    // The launch workspace cannot be forgotten while it is the only root — a
    // tiered 400, never a disk operation.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    vault_git_repo(root);
    let state = app::build_state(root.to_path_buf());
    let launch_id = {
        let ws = ingest_git::workspace::Workspace::discover(&state.workspace_root).unwrap();
        routes::scope_token(&ws.common_dir)
    };
    {
        let us = state.user_state.lock().unwrap();
        us.auto_register_launch(
            &launch_id,
            "main",
            &routes::scope_token(&state.workspace_root),
            app::now_ms(),
        )
        .unwrap();
    }
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = put_json_with_token(
        router,
        "/session",
        json!({ "forget_workspace": launch_id }),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the refusal carries the tiers block"
    );
}
