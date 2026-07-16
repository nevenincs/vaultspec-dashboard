use super::*;

#[tokio::test]
async fn graph_asof_echoes_the_resolved_sha_and_interpretation_for_both_token_forms() {
    // ADD-901: /graph/asof MUST echo the chosen interpretation (revision
    // vs ms-timestamp) AND the resolved 40-char sha, for BOTH a revision
    // token (`HEAD`) and a millisecond-timestamp token.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-asof-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#asof'\n---\n\nbody\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);

    let head_sha = {
        let out = std::process::Command::new("git")
            .current_dir(root)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };

    // build_state warms + indexes the launch scope's cell eagerly.
    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    // Revision token: resolves to HEAD's sha, interpretation `revision`.
    let (status, body) = get_with_token(
        router.clone(),
        &format!("/graph/asof?scope={}&t=HEAD", urlencode(&scope)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "revision token: {body}");
    assert_eq!(body["data"]["resolved_sha"], head_sha, "echoes HEAD sha");
    assert_eq!(body["data"]["interpretation"], "revision");
    assert_eq!(body["data"]["t"], "HEAD", "raw t echo preserved");

    // Millisecond-timestamp token: a far-future epoch-ms resolves to the
    // latest commit (HEAD), interpretation `timestamp`.
    let future_ms = (app::now_ms() + 1_000_000).to_string();
    let (status, body) = get_with_token(
        router,
        &format!("/graph/asof?scope={}&t={future_ms}", urlencode(&scope)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "timestamp token: {body}");
    assert_eq!(
        body["data"]["resolved_sha"], head_sha,
        "epoch-ms resolves to the latest commit's sha"
    );
    assert_eq!(body["data"]["interpretation"], "timestamp");
}

#[tokio::test]
async fn history_serves_bounded_subject_bearing_commits_newest_first() {
    // status-overview ADR: GET /history?scope=&limit=N returns the last N
    // commits as {hash, short_hash, subject, ts, node_ids}, newest-first,
    // enveloped with the tiers block, bounded by a hard ceiling. The
    // subject is the one new datum — the commit message's first line — that
    // /events never carried.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();

    // Commit 1: a vault doc -> correlates to a doc node id.
    std::fs::write(
        root.join(".vault/plan/2026-06-16-hist-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#hist'\n---\n\nbody\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "feat: add the hist plan"]);

    // Commit 2: a vault doc that will be removed before the graph is
    // served; history must not advertise stale doc ids to the dashboard
    // selection surface.
    let stale_doc = root.join(".vault/plan/2026-06-16-removed-plan.md");
    std::fs::write(
        &stale_doc,
        "---\ntags:\n  - '#plan'\n  - '#hist'\n---\n\nremoved\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "feat: add removed plan"]);

    // Commit 3: remove the vault doc so the current graph no longer owns
    // its node id.
    std::fs::remove_file(&stale_doc).unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "docs: remove old plan"]);

    // Commit 4: a plain edit -> the newest commit.
    std::fs::write(root.join("README.md"), "readme\n").unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "docs: add a readme"]);

    let head_sha = {
        let out = std::process::Command::new("git")
            .current_dir(root)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };

    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router.clone(),
        &format!("/history?scope={}", urlencode(&scope)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "history ok: {body}");

    // Every response carries the tiers block (shared envelope).
    assert!(body["tiers"].is_object(), "tiers block present: {body}");

    let commits = body["data"]["commits"].as_array().expect("commits array");
    assert_eq!(commits.len(), 4, "all commits served");

    // Newest-first: the README commit is first, with its subject line.
    assert_eq!(commits[0]["hash"], head_sha, "newest commit first");
    assert_eq!(
        commits[0]["short_hash"],
        head_sha.chars().take(8).collect::<String>()
    );
    assert_eq!(commits[0]["subject"], "docs: add a readme");
    assert!(
        commits[0]["ts"].as_i64().unwrap() > 1_000_000_000_000,
        "ms ts"
    );

    // The older vault-touching commit carries its subject AND correlates to
    // the document node (the commit→doc cross-link the rail uses).
    let hist_commit = commits
        .iter()
        .find(|commit| commit["subject"] == "feat: add the hist plan")
        .expect("hist plan commit present");
    let node_ids: Vec<String> = hist_commit["node_ids"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap().to_string())
        .collect();
    assert!(
        node_ids.iter().any(|id| id.starts_with("commit:")),
        "the commit's own node id is present: {node_ids:?}"
    );
    assert!(
        node_ids.contains(&"doc:2026-06-16-hist-plan".to_string()),
        "the touched vault doc is correlated: {node_ids:?}"
    );
    for commit in commits {
        let commit_node_ids: Vec<String> = commit["node_ids"]
            .as_array()
            .unwrap()
            .iter()
            .map(|v| v.as_str().unwrap().to_string())
            .collect();
        assert!(
            !commit_node_ids.contains(&"doc:2026-06-16-removed-plan".to_string()),
            "history only advertises current graph-known doc ids: {commit_node_ids:?}"
        );
    }

    // No truncation when the request is within the ceiling.
    assert!(body["data"]["truncated"].is_null(), "no truncation: {body}");
}

#[tokio::test]
async fn history_clamps_an_over_ceiling_limit_and_reports_it() {
    // bounded-by-default / graph-queries-are-bounded-by-default: a request
    // above MAX_HISTORY_LIMIT is clamped to the ceiling and the clamp is
    // stated in the truncated block, never an unbounded walk.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::write(root.join("a.txt"), "a\n").unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "one"]);

    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let over = routes::history::MAX_HISTORY_LIMIT + 50;
    let (status, body) = get_with_token(
        router,
        &format!("/history?scope={}&limit={over}", urlencode(&scope)),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "history ok: {body}");
    assert_eq!(
        body["data"]["truncated"]["requested"].as_u64().unwrap() as usize,
        over,
        "the over-ceiling request is reported"
    );
    // Only one commit exists, so the returned count reflects the real walk,
    // not the ceiling — but the clamp is still honestly reported.
    assert_eq!(body["data"]["commits"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn history_unknown_scope_is_a_tiered_400() {
    // A bad scope 400s honestly with the tiers block (shared envelope),
    // distinguishable from a backend-down degradation.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::write(root.join("a.txt"), "a\n").unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "one"]);

    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) =
        get_with_token(router, "/history?scope=/no/such/worktree", Some(&token)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "bad scope 400: {body}");
    assert!(body["tiers"].is_object(), "error carries tiers: {body}");
}

#[tokio::test]
async fn graph_query_as_of_echoes_the_resolved_sha_and_interpretation() {
    // M-F1 / ADD-901: the POST /graph/query as_of path must echo the same
    // resolution facts /graph/asof carries — the 40-char resolved_sha and
    // the chosen interpretation — for BOTH a millisecond-timestamp token
    // and a revision token. The present (no-as_of) view echoes neither
    // (null), so the additive fields never lie about resolution.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-q-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#q'\n---\n\nbody\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);

    let head_sha = {
        let out = std::process::Command::new("git")
            .current_dir(root)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };

    // build_state warms + indexes the launch scope's cell eagerly.
    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    // Revision token (`HEAD`): resolves to HEAD's sha, interpretation
    // `revision`; the raw as_of echo is preserved.
    let (status, body) = post_json_with_token(
        router.clone(),
        "/graph/query",
        json!({"scope": scope, "as_of": "HEAD"}),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "revision as_of: {body}");
    assert_eq!(
        body["data"]["resolved_sha"], head_sha,
        "echoes HEAD sha for a revision as_of"
    );
    assert_eq!(body["data"]["interpretation"], "revision");
    assert_eq!(body["data"]["as_of"], "HEAD", "raw as_of echo preserved");

    // Millisecond-timestamp token: a far-future epoch-ms resolves to the
    // latest commit (HEAD), interpretation `timestamp`.
    let future_ms = (app::now_ms() + 1_000_000).to_string();
    let (status, body) = post_json_with_token(
        router.clone(),
        "/graph/query",
        json!({"scope": scope, "as_of": future_ms.clone()}),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "timestamp as_of: {body}");
    assert_eq!(
        body["data"]["resolved_sha"], head_sha,
        "epoch-ms as_of resolves to the latest commit's sha"
    );
    assert_eq!(body["data"]["interpretation"], "timestamp");
    assert_eq!(body["data"]["as_of"], future_ms, "raw as_of echo preserved");

    // Present view (no as_of): both fields are null — there is no token to
    // resolve, and the additive fields must not invent a resolution.
    let (status, body) = post_json_with_token(
        router,
        "/graph/query",
        json!({"scope": scope}),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "present view: {body}");
    assert!(
        body["data"]["resolved_sha"].is_null(),
        "no resolved_sha without as_of"
    );
    assert!(
        body["data"]["interpretation"].is_null(),
        "no interpretation without as_of"
    );
}

#[tokio::test]
async fn graph_lineage_carries_the_tiers_block_on_the_success_envelope() {
    // W01.P02.S14: GET /graph/lineage returns the dated nodes + the arcs
    // among them through the SHARED envelope, so the per-tier tiers block
    // rides the success body. Semantic is reported present-only (excluded
    // from the range lineage) while declared stays truthful per scope.
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
    // Two dated, lane-owning documents in range.
    std::fs::write(
        dir.path().join(".vault/adr/2026-06-12-lin-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#lin'\ndate: '2026-06-12'\n---\n\n# `lin` adr\n\nbody\n",
    )
    .unwrap();
    std::fs::write(
        dir.path().join(".vault/plan/2026-06-13-lin-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#lin'\ndate: '2026-06-13'\n---\n\n# `lin` plan\n\nbody\n",
    )
    .unwrap();
    let state = app::build_state(dir.path().to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        &format!(
            "/graph/lineage?scope={}&from=2026-06-01&to=2026-06-30",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "lineage success: {body}");
    // The dated nodes ride the data payload.
    assert!(
        body["data"]["nodes"].is_array(),
        "the lineage nodes ride the data payload"
    );
    assert!(body["data"]["arcs"].is_array(), "the arcs ride the payload");
    // Tiers block on success, built through the shared envelope.
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the success envelope carries the tiers block"
    );
    assert_eq!(
        body["tiers"]["semantic"]["available"], false,
        "semantic is present-only, excluded from the range lineage"
    );
    assert!(
        body["tiers"]["declared"]["available"].is_boolean(),
        "declared tier reported truthfully per scope"
    );
}

#[tokio::test]
async fn graph_lineage_unknown_scope_400s_with_the_tiers_block() {
    // W01.P02.S15: the lineage ERROR path (an unknown scope) also returns
    // through the shared envelope, so the tiers block rides the error body —
    // a healthy-looking error never ships without degradation truth.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        "/graph/lineage?scope=/nowhere/at/all&from=2026-06-01&to=2026-06-30",
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].is_string(), "honest error message");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the 400 still carries the tiers block"
    );
}

#[tokio::test]
async fn graph_lineage_inverted_range_and_bad_filter_400_with_the_tiers_block() {
    // W01.P02.S11/S15: a client-error on a VALID scope (inverted range or a
    // malformed/unknown-facet filter) also rides the shared error envelope.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    // Inverted range: from > to is a 400, not a silently-empty slice.
    let (status, body) = get_with_token(
        router.clone(),
        &format!(
            "/graph/lineage?scope={}&from=2026-06-30&to=2026-06-01",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "inverted range: {body}");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the inverted-range 400 carries the tiers block"
    );

    // An unknown filter facet is rejected by the projection's validation and
    // shaped through the shared envelope. The JSON value is fully
    // percent-encoded so the query string is a valid URI.
    let bad_filter = percent_encode(r#"{"tiers":{"not-a-tier":true}}"#);
    let (status, body) = get_with_token(
        router,
        &format!(
            "/graph/lineage?scope={}&filter={bad_filter}",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "bad filter: {body}");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the bad-filter 400 carries the tiers block"
    );
}

#[tokio::test]
async fn graph_lineage_asof_serves_a_bounded_slice_with_the_tiers_block_and_resolved_sha() {
    // dashboard-timeline ADR deferred fast-follow: GET /graph/lineage with a
    // `t` token serves the BLOB-TRUE lineage as of T — the historical graph
    // resolved from the git object DB, projected by the same bounded lineage
    // projection — through the SHARED envelope. The as-of tiers block rides
    // the success body (semantic present-only/excluded, structural stale-at-T)
    // and the resolved sha + interpretation are echoed, matching /graph/asof.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
            root.join(".vault/adr/2026-06-12-asoflin-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#asoflin'\ndate: '2026-06-12'\n---\n\n# `asoflin` adr\n\nbody\n",
        )
        .unwrap();
    std::fs::write(
            root.join(".vault/plan/2026-06-13-asoflin-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#asoflin'\ndate: '2026-06-13'\n---\n\n# `asoflin` plan\n\nbody\n",
        )
        .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);

    let head_sha = {
        let out = std::process::Command::new("git")
            .current_dir(root)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };

    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        &format!(
            "/graph/lineage?scope={}&from=2026-06-01&to=2026-06-30&t=HEAD",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "as-of lineage success: {body}");
    assert!(
        body["data"]["nodes"].is_array(),
        "the as-of lineage nodes ride the data payload"
    );
    assert!(
        body["data"]["arcs"].is_array(),
        "the as-of arcs ride the payload"
    );
    // The historical graph resolved from the git object DB is non-empty: the
    // two committed, in-range, lane-owning documents are projected.
    assert_eq!(
        body["data"]["nodes"].as_array().unwrap().len(),
        2,
        "the blob-true as-of slice projects the committed documents"
    );
    // Resolved-sha + interpretation echoed, matching /graph/asof (ADD-901).
    assert_eq!(
        body["data"]["resolved_sha"], head_sha,
        "the as-of lineage echoes the resolved HEAD sha"
    );
    assert_eq!(body["data"]["interpretation"], "revision");
    // The as-of tiers block rides the success envelope: semantic excluded
    // (present-only) and structural reported (degraded-to-stale-at-T).
    assert_eq!(
        body["tiers"]["semantic"]["available"], false,
        "semantic is present-only, excluded from the historical lineage"
    );
    assert!(
        body["tiers"]["structural"]["reason"].is_string(),
        "structural carries the stale-at-T reason in the as-of view"
    );
}

#[tokio::test]
async fn graph_diff_echoes_both_resolved_shas_and_interpretations() {
    // GET /graph/diff resolves BOTH endpoints FRESH per token and echoes
    // each endpoint's resolved sha + interpretation (ADD-901), matching
    // /graph/asof. The historical builds route through the cell's by-sha
    // as-of cache, so the echo MUST come from the fresh per-request resolve
    // (not the sha-keyed cache, which carries no token reading) — this test
    // guards that contract for the diff handler. Two committed snapshots give
    // a real from != to diff (not the same-commit fast path); the second
    // commit ADDS a document so the snapshots genuinely differ.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::write(
        root.join(".vault/adr/2026-06-12-diffy-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#diffy'\ndate: '2026-06-12'\n---\n\n# `diffy` adr\n\nbody\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "first"]);
    let from_sha = {
        let out = std::process::Command::new("git")
            .current_dir(root)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };

    // Second commit ADDS a plan document — a structural change between the
    // two snapshots.
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
            root.join(".vault/plan/2026-06-13-diffy-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#diffy'\ndate: '2026-06-13'\n---\n\n# `diffy` plan\n\nbody\n",
        )
        .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "second"]);
    let to_sha = {
        let out = std::process::Command::new("git")
            .current_dir(root)
            .args(["rev-parse", "HEAD"])
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    };
    assert_ne!(from_sha, to_sha, "the two commits differ");

    let state = app::build_state(root.to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    // Real diff (from != to): both shas + interpretations echoed, deltas an
    // array, and the as-of tiers block rides the success envelope.
    let (status, body) = get_with_token(
        router.clone(),
        &format!(
            "/graph/diff?scope={}&from=HEAD~1&to=HEAD&granularity=document",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "diff success: {body}");
    assert!(body["data"]["deltas"].is_array(), "deltas ride the payload");
    assert_eq!(
        body["data"]["from_resolved_sha"], from_sha,
        "from echoes the first commit's resolved sha"
    );
    assert_eq!(
        body["data"]["to_resolved_sha"], to_sha,
        "to echoes HEAD's resolved sha"
    );
    assert_eq!(body["data"]["from_interpretation"], "revision");
    assert_eq!(body["data"]["to_interpretation"], "revision");
    assert_eq!(
        body["tiers"]["semantic"]["available"], false,
        "semantic is present-only, excluded from the historical diff"
    );

    // Same-commit fast path (from == to): the delta log is empty by
    // definition, yet BOTH resolved shas are still echoed (ADD-901) — a
    // client that diffs HEAD against itself still learns the resolution.
    let (status, body) = get_with_token(
        router,
        &format!(
            "/graph/diff?scope={}&from=HEAD&to=HEAD&granularity=document",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "same-commit diff success: {body}");
    assert_eq!(
        body["data"]["deltas"].as_array().unwrap().len(),
        0,
        "an identical from/to yields an empty delta log"
    );
    assert_eq!(body["data"]["from_resolved_sha"], to_sha);
    assert_eq!(body["data"]["to_resolved_sha"], to_sha);
}

#[tokio::test]
async fn graph_lineage_asof_unresolvable_token_400s_with_the_tiers_block() {
    // The as-of lineage ERROR path: an unresolvable `t` token is a client
    // error shaped through the shared revision_error helper, so the error
    // body carries the tiers block — a healthy-looking error never ships
    // without degradation truth.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        &format!(
            "/graph/lineage?scope={}&t=not-a-real-ref-or-sha",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "unresolvable t: {body}");
    assert!(body["error"].is_string(), "honest revision error message");
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "the unresolvable-t 400 still carries the tiers block"
    );
}

#[tokio::test]
async fn graph_lineage_present_view_echoes_null_resolution() {
    // The no-`t` (present) path is unchanged and echoes neither resolution
    // field — the additive fields never invent a resolution that did not
    // happen (mirrors the graph_query present branch's null echoes).
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/adr")).unwrap();
    std::fs::write(
            dir.path().join(".vault/adr/2026-06-12-presentlin-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#presentlin'\ndate: '2026-06-12'\n---\n\n# `presentlin` adr\n\nbody\n",
        )
        .unwrap();
    let state = app::build_state(dir.path().to_path_buf());
    let token = state.bearer.clone();
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    let router = build_router(state);

    let (status, body) = get_with_token(
        router,
        &format!(
            "/graph/lineage?scope={}&from=2026-06-01&to=2026-06-30",
            urlencode(&scope)
        ),
        Some(&token),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "present lineage: {body}");
    assert!(
        body["data"]["resolved_sha"].is_null(),
        "no resolved_sha without t"
    );
    assert!(
        body["data"]["interpretation"].is_null(),
        "no interpretation without t"
    );
}
