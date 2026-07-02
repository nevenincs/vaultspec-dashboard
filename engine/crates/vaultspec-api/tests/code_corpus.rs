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
async fn code_rollup_serves_modules_and_meta_edges_through_the_shared_envelope() {
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
    // Module rollup: the constellation analogue.
    let ids = node_ids(data);
    assert_eq!(ids, vec!["code-mod:src", "code-mod:web"], "{body}");
    assert!(data["edges"].as_array().unwrap().is_empty());
    let meta = data["meta_edges"].as_array().unwrap();
    // src/lib.rs → src/util.rs and app.ts → graph.ts are both INTRA-module,
    // so the rollup carries no cross-module ribbon here — honest empty.
    assert!(meta.is_empty(), "{body}");
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
    // Module nodes carry the rollup member count.
    let src_mod = data["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "code-mod:src")
        .unwrap();
    assert_eq!(src_mod["member_count"], 2);
    assert_eq!(src_mod["kind"], "code-module");
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
        json!({"scope": scope, "corpus": "code", "granularity": "document", "dir_prefix": "web"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let data = &body["data"];
    let ids = node_ids(data);
    assert_eq!(
        ids,
        vec!["code-mod:web", "code:web/app.ts", "code:web/graph.ts"],
        "{body}"
    );
    let app_node = data["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "code:web/app.ts")
        .unwrap();
    assert_eq!(app_node["language"], "typescript");
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
        node_ids(data)
            .iter()
            .all(|id| !id.starts_with("code:") && !id.starts_with("code-mod:")),
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
            .all(|id| id.starts_with("code:") || id.starts_with("code-mod:")),
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
