//! Code-corpus wire conformance (codebase-graphing ADR D1/D5, plan W04):
//! `/graph/query` with `corpus: "code"` serves the DISCONNECTED code dataset
//! through the SAME envelope, field set, and ceiling as the vault corpus;
//! the vault default stays byte-compatible (no `corpus` field, no code
//! nodes); corpus-mismatched request facets are typed validation errors that
//! still carry the tiers block. Driven end-to-end through the real router
//! against a real polyglot worktree — no mocks.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

/// A tiny polyglot worktree: one vault doc (the vault corpus) plus Rust and
/// TypeScript sources with real imports (the code corpus).
fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-07-02-cg-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#cg'\n---\n\nThe plan.\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::create_dir_all(root.join("web")).unwrap();
    std::fs::write(root.join("Cargo.toml"), "[package]\nname = \"demo\"\n").unwrap();
    std::fs::write(root.join("src/lib.rs"), "mod util;\n").unwrap();
    std::fs::write(root.join("src/util.rs"), "pub fn u() {}\n").unwrap();
    std::fs::write(
        root.join("web/app.ts"),
        "import { g } from \"./graph\";\nimport React from \"react\";\n",
    )
    .unwrap();
    std::fs::write(root.join("web/graph.ts"), "export const g = 1;\n").unwrap();
    let state = app::build_state(root.to_path_buf());
    (dir, state)
}

async fn post(router: axum::Router, path: &str, token: &str, body: Value) -> (StatusCode, Value) {
    let response = router
        .oneshot(
            Request::post(path)
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn get(router: axum::Router, path: &str, token: &str) -> (StatusCode, Value) {
    let response = router
        .oneshot(
            Request::get(path)
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn served_scope(state: &AppState) -> String {
    state.workspace_root.to_string_lossy().replace('\\', "/")
}

fn node_ids(data: &Value) -> Vec<String> {
    data["nodes"]
        .as_array()
        .expect("nodes array")
        .iter()
        .filter_map(|n| n["id"].as_str().map(String::from))
        .collect()
}

#[tokio::test]
async fn code_rollup_serves_package_entry_files_and_meta_edges_through_the_shared_envelope() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "granularity": "feature"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["tiers"].is_object(), "tiers block rides the response");
    let data = &body["data"];
    // Package rollup: the constellation analogue. Every node is a FILE
    // (code-graph-files-only): the crate's entry `src/lib.rs` represents the
    // `src` package; `web/` has no entry file, so its files stand alone.
    let ids = node_ids(data);
    assert_eq!(
        ids,
        vec!["code:src/lib.rs", "code:web/app.ts", "code:web/graph.ts"],
        "{body}"
    );
    assert!(data["edges"].as_array().unwrap().is_empty());
    let meta = data["meta_edges"].as_array().unwrap();
    // src/lib.rs → src/util.rs is INTRA-package and folds away; app.ts →
    // graph.ts crosses two standalone representatives → one ribbon.
    assert_eq!(meta.len(), 1, "{body}");
    assert_eq!(meta[0]["src"], "code:web/app.ts");
    assert_eq!(meta[0]["dst"], "code:web/graph.ts");
    // Field-set parity with the vault response + the additive corpus fields.
    for field in [
        "nodes",
        "edges",
        "meta_edges",
        "filter",
        "as_of",
        "resolved_sha",
        "interpretation",
        "last_seq",
        "truncated",
        "lens",
        "salience_partial",
    ] {
        assert!(data.get(field).is_some(), "missing shared field `{field}`");
    }
    assert_eq!(data["corpus"], "code");
    let extraction = &data["extraction"];
    assert_eq!(extraction["files"], 4, "{body}");
    assert_eq!(extraction["parse_errors"], 0);
    assert_eq!(extraction["imports_internal"], 2);
    assert_eq!(extraction["imports_external"], 1, "react");
    // The package's entry file carries the rollup member count and displays
    // as the package (crate name from the manifest).
    let src_rep = data["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "code:src/lib.rs")
        .unwrap();
    assert_eq!(src_rep["member_count"], 2);
    assert_eq!(src_rep["kind"], "code-artifact");
    assert_eq!(src_rep["package_entry"], true);
    assert_eq!(src_rep["package"], "src");
    assert_eq!(
        src_rep["title"], "demo",
        "entry file displays as its package"
    );
}

#[tokio::test]
async fn code_file_granularity_serves_imports_contains_and_language() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "granularity": "document", "dir_prefix": "src"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let data = &body["data"];
    let ids = node_ids(data);
    // FILES only — a directory never becomes a node (code-graph-files-only).
    assert_eq!(ids, vec!["code:src/lib.rs", "code:src/util.rs"], "{body}");
    let app_node = data["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "code:src/util.rs")
        .unwrap();
    assert_eq!(app_node["language"], "rust");
    assert_eq!(app_node["package"], "src");
    assert_eq!(app_node["package_entry"], false);
    // code-graph-heat ADR: every freshly-written (dated) file serves a
    // percentile recency rank in [0, 1].
    let rank = app_node["recency_rank"].as_f64().expect("recency_rank");
    assert!((0.0..=1.0).contains(&rank), "{rank}");
    let edges = data["edges"].as_array().unwrap();
    let relations: Vec<&str> = edges
        .iter()
        .filter_map(|e| e["relation"].as_str())
        .collect();
    assert!(relations.contains(&"imports"), "{body}");
    assert!(relations.contains(&"contains"), "{body}");
    // Every kept edge connects kept nodes (self-consistent subgraph).
    for e in edges {
        let src = e["src"].as_str().unwrap();
        let dst = e["dst"].as_str().unwrap();
        assert!(ids.iter().any(|i| i == src) && ids.iter().any(|i| i == dst));
    }
}

#[tokio::test]
async fn the_vault_default_is_unchanged_and_the_corpora_never_mix() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    // Default (absent corpus): the pre-corpus contract, no code nodes, and no
    // additive corpus field — byte-compatible for existing clients.
    let (status, body) = post(
        router.clone(),
        "/graph/query",
        &token,
        json!({"scope": scope, "granularity": "document"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let data = &body["data"];
    assert!(data.get("corpus").is_none(), "vault response is unchanged");
    assert!(
        node_ids(data).iter().all(|id| !id.starts_with("code:")),
        "the vault corpus never serves a code node: {body}"
    );

    // The code corpus serves ONLY code nodes (the disconnection invariant).
    let (_, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "granularity": "document"}),
    )
    .await;
    assert!(
        node_ids(&body["data"])
            .iter()
            .all(|id| id.starts_with("code:")),
        "the code corpus never serves a vault node: {body}"
    );
}

#[tokio::test]
async fn corpus_mismatched_requests_are_typed_errors_with_tiers() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    // Unknown corpus.
    let (status, body) = post(
        router.clone(),
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "wat"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["tiers"].is_object(), "error envelope carries tiers");

    // Vault filter facets on the code corpus.
    let (status, body) = post(
        router.clone(),
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "filter": {"doc_types": ["plan"]}}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(body["tiers"].is_object());

    // as_of on the code corpus (present view only).
    let (status, _) = post(
        router.clone(),
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "as_of": "HEAD"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // Code narrowing facets on the vault corpus.
    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "dir_prefix": "src"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(body["tiers"].is_object());
}

/// Run git in `dir` with a pinned identity + committer date (mirrors the asof
/// test helper) so commit times are deterministic inputs to the recency fold.
fn git_at(dir: &std::path::Path, epoch_secs: i64, args: &[&str]) {
    let date = format!("@{epoch_secs} +0000");
    let output = std::process::Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "f")
        .env("GIT_AUTHOR_EMAIL", "f@t")
        .env("GIT_COMMITTER_NAME", "f")
        .env("GIT_COMMITTER_EMAIL", "f@t")
        .env("GIT_AUTHOR_DATE", &date)
        .env("GIT_COMMITTER_DATE", &date)
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

/// code-graph-heat ADR amendment, end to end over a REAL repository: the served
/// recency rank rides COMMIT history (not worktree mtimes — every fixture file
/// is written seconds apart, but the commits are days apart), dirty/untracked
/// work ranks hottest, and an identical-commit block shares one tie rank.
#[tokio::test]
async fn git_recency_ranks_ride_commit_history_and_dirty_state() {
    let (dir, state) = fixture_state();
    let root = dir.path();
    const DAY: i64 = 86_400;
    let t0 = 1_700_000_000; // an arbitrary fixed epoch base
    git_at(root, t0, &["init", "-b", "main", "."]);
    git_at(root, t0, &["add", "."]);
    git_at(root, t0, &["commit", "-m", "base"]); // src/* + web/* all tie at t0
    std::fs::write(root.join("web/app.ts"), "import { g } from \"./graph\";\n").unwrap();
    git_at(root, t0 + 3 * DAY, &["add", "web/app.ts"]);
    git_at(root, t0 + 3 * DAY, &["commit", "-m", "touch app"]); // app.ts newest commit
    // Untracked working-tree file: the hottest tier, from git status truth.
    std::fs::write(root.join("web/scratch.ts"), "export const s = 1;\n").unwrap();

    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);
    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "granularity": "document"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let rank = |id: &str| -> f64 {
        body["data"]["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|n| n["id"] == id)
            .unwrap_or_else(|| panic!("missing {id}"))["recency_rank"]
            .as_f64()
            .unwrap_or_else(|| panic!("{id} has no rank"))
    };
    // Untracked scratch file = hottest; the recommitted app.ts sits between;
    // the t0 block (src/lib.rs, src/util.rs, web/graph.ts) shares ONE cold tie
    // rank despite their mtimes differing from their commit time.
    assert_eq!(rank("code:web/scratch.ts"), 1.0, "{body}");
    assert!(rank("code:web/app.ts") > rank("code:src/lib.rs"), "{body}");
    assert!(
        rank("code:web/app.ts") < rank("code:web/scratch.ts"),
        "{body}"
    );
    assert_eq!(rank("code:src/lib.rs"), rank("code:src/util.rs"), "{body}");
    assert_eq!(rank("code:src/lib.rs"), rank("code:web/graph.ts"), "{body}");
    assert_eq!(rank("code:src/lib.rs"), 0.0, "{body}");
}

/// code-timeline-range ADR: `date_range` + `date_field: "modified"` is the ONE
/// vault-filter facet pair that carries over to the code corpus, narrowing by
/// worktree-mtime day; any other criterion stays a typed error.
#[tokio::test]
async fn code_date_range_narrows_by_worktree_mtime() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    // Wide-open from-bound: every freshly-written fixture file is in range.
    let (status, body) = post(
        router.clone(),
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "granularity": "document",
               "filter": {"date_range": {"from": "1970-01-01"}, "date_field": "modified"}}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(!node_ids(&body["data"]).is_empty());
    // The applied facet is echoed honestly on the response filter block.
    assert_eq!(body["data"]["filter"]["date_field"], "modified");
    assert_eq!(
        body["data"]["filter"]["date_range"]["from"], "1970-01-01",
        "{body}"
    );

    // Far-future from-bound: nothing was modified there yet.
    let (status, body) = post(
        router.clone(),
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code", "granularity": "document",
               "filter": {"date_range": {"from": "2999-01-01"}, "date_field": "modified"}}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(node_ids(&body["data"]).is_empty());

    // A code date_range without the modified criterion is a typed error.
    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "corpus": "code",
               "filter": {"date_range": {"from": "1970-01-01"}}}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(body["tiers"].is_object());
}

#[tokio::test]
async fn filters_serves_the_code_vocabulary_per_corpus() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = get(
        router.clone(),
        &format!("/filters?scope={scope}&corpus=code"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let vocab = &body["data"]["vocabulary"];
    assert_eq!(vocab["languages"], json!(["rust", "typescript"]));
    assert_eq!(vocab["dirs"], json!(["src", "web"]));
    assert_eq!(body["data"]["corpus"], "code");
    // code-timeline-range ADR: the code corpus advertises its mtime span in the
    // same date-bounds shape the vault serves, so the timeline strip fits to it.
    assert!(
        vocab["date_bounds_by_field"]["modified"]["min"].is_string(),
        "{vocab}"
    );
    assert!(vocab["date_bounds"]["max"].is_string());

    // The vault vocabulary stays the vault vocabulary (no code facets).
    let (status, body) = get(router, &format!("/filters?scope={scope}"), &token).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["data"]["vocabulary"].get("languages").is_none());
    assert!(body["data"].get("corpus").is_none());
}

/// Review L2: the language classification is deliberately duplicated between
/// `ingest-code` (extraction) and `engine-query` (faceting) to keep the
/// tree-sitter dependency chain out of the query crate. This parity test is
/// the drift fence: every extension either classifies identically on both
/// sides or is unknown to both.
#[test]
fn language_classification_parity_between_ingest_and_query() {
    use ingest_code::lang::Lang;
    let cases = [
        "a.rs", "a.ts", "a.mts", "a.cts", "a.tsx", "a.js", "a.mjs", "a.cjs", "a.jsx", "a.py",
        "a.md", "a.toml", "a.json", "a",
    ];
    for path in cases {
        let ingest = Lang::from_path(std::path::Path::new(path)).map(|l| l.as_str());
        let query = engine_query::code::language_token(path);
        assert_eq!(ingest, query, "classification drift for `{path}`");
    }
}
