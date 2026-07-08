//! `/code-files` wire conformance (search-providers ADR: the one contract
//! event). The COMPLETE cursor-paginated code-file listing projected off the
//! code corpus `LinkageGraph` — never the DOI-bounded graph slice — so a client
//! holds the whole set to narrow. Verified end-to-end through the real router
//! against real worktrees — no mocks: a full cursor walk equals the projection
//! count with no dup/miss across page boundaries, truncation is stated honestly,
//! and a code-graphless cell degrades to an honest empty listing (never a 5xx).

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

/// A polyglot worktree: one vault doc (ignored by the code walk) plus four real
/// source files (the code corpus) — `src/lib.rs`, `src/util.rs`, `web/app.ts`,
/// `web/graph.ts`.
fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-07-03-sp-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#sp'\n---\n\nThe plan.\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::create_dir_all(root.join("web")).unwrap();
    std::fs::write(root.join("Cargo.toml"), "[package]\nname = \"demo\"\n").unwrap();
    std::fs::write(root.join("src/lib.rs"), "mod util;\n").unwrap();
    std::fs::write(root.join("src/util.rs"), "pub fn u() {}\n").unwrap();
    std::fs::write(root.join("web/app.ts"), "import { g } from \"./graph\";\n").unwrap();
    std::fs::write(root.join("web/graph.ts"), "export const g = 1;\n").unwrap();
    let state = app::build_state(root.to_path_buf());
    (dir, state)
}

/// A vault-only worktree: a real vault doc but ZERO source files, so the code
/// corpus is empty (the code walk ignores `.vault`).
fn vault_only_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-07-03-sp-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#sp'\n---\n\nThe plan.\n",
    )
    .unwrap();
    let state = app::build_state(root.to_path_buf());
    (dir, state)
}

async fn get(router: axum::Router, path: &str, token: &str) -> (StatusCode, serde_json::Value) {
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
        serde_json::from_slice(&bytes).unwrap_or(serde_json::Value::Null),
    )
}

fn served_scope(state: &AppState) -> String {
    state.workspace_root.to_string_lossy().replace('\\', "/")
}

/// Walk the `/code-files` cursor to completion at the given page size,
/// returning every entry in listing order plus the number of pages fetched.
async fn walk_all(
    router: &axum::Router,
    scope: &str,
    token: &str,
    page_size: usize,
) -> (Vec<serde_json::Value>, usize) {
    let mut entries: Vec<serde_json::Value> = Vec::new();
    let mut cursor: Option<String> = None;
    let mut pages = 0;
    // Bounded page cap: the fixture is tiny; this only prevents a runaway loop
    // if pagination ever regressed into non-advancing cursors.
    for _ in 0..1000 {
        let path = match &cursor {
            Some(c) => format!("/code-files?scope={scope}&page_size={page_size}&cursor={c}"),
            None => format!("/code-files?scope={scope}&page_size={page_size}"),
        };
        let (status, body) = get(router.clone(), &path, token).await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert!(body["tiers"].is_object(), "tiers block rides every page");
        pages += 1;
        let page = body["data"]["entries"].as_array().unwrap().clone();
        entries.extend(page);
        match body["next_cursor"].as_str() {
            Some(c) => cursor = Some(c.to_string()),
            None => return (entries, pages),
        }
    }
    panic!("cursor walk did not terminate");
}

#[tokio::test]
async fn cursor_walk_to_completion_equals_the_full_projection() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    // A single generous page returns the whole listing (the complete-set rule).
    let (status, body) = get(
        router.clone(),
        &format!("/code-files?scope={scope}&page_size=2000"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let full: Vec<String> = body["data"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["path"].as_str().unwrap().to_string())
        .collect();
    // Every admitted source file mints exactly one code node (files-only), so
    // the listing is the four fixture files, path-sorted; the vault doc and the
    // manifest (`.toml`, not a source language) never appear.
    assert_eq!(
        full,
        vec![
            "src/lib.rs".to_string(),
            "src/util.rs".to_string(),
            "web/app.ts".to_string(),
            "web/graph.ts".to_string(),
        ],
        "{body}"
    );
    // A single page over the whole set carries no continuation cursor.
    assert!(body["next_cursor"].is_null(), "{body}");

    // The minimal row shape is honest: node id, derived language, title.
    let lib = body["data"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["path"] == "src/lib.rs")
        .unwrap();
    assert_eq!(lib["node_id"], "code:src/lib.rs", "hit is navigable");
    assert_eq!(lib["lang"], "rust", "language derived from the extension");
    assert_eq!(
        lib["title"], "demo",
        "the crate entry displays as its package"
    );
    let ts = body["data"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["path"] == "web/app.ts")
        .unwrap();
    assert_eq!(ts["lang"], "typescript");
}

#[tokio::test]
async fn page_boundaries_are_deterministic_with_no_dup_or_miss() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    // The one-page truth.
    let (whole, _) = walk_all(&router, &scope, &token, 2000).await;
    let whole_paths: Vec<&str> = whole.iter().map(|e| e["path"].as_str().unwrap()).collect();

    // A page size below the listing count FORCES multiple pages; the walk must
    // reconstruct the identical listing — no entry duplicated, none skipped
    // across a boundary.
    let (paged, pages) = walk_all(&router, &scope, &token, 2).await;
    assert!(pages >= 2, "page_size=2 over four files must span pages");
    let paged_paths: Vec<&str> = paged.iter().map(|e| e["path"].as_str().unwrap()).collect();
    assert_eq!(
        paged_paths, whole_paths,
        "paged walk equals the whole listing"
    );

    // No duplicate crossed a boundary.
    let mut sorted = paged_paths.clone();
    sorted.sort_unstable();
    sorted.dedup();
    assert_eq!(sorted.len(), paged_paths.len(), "no duplicate across pages");

    // Page-size=1 is the extreme boundary case: one entry per page, still exact.
    let (singles, single_pages) = walk_all(&router, &scope, &token, 1).await;
    assert_eq!(single_pages, 4, "one page per entry");
    let single_paths: Vec<&str> = singles
        .iter()
        .map(|e| e["path"].as_str().unwrap())
        .collect();
    assert_eq!(single_paths, whole_paths);
}

#[tokio::test]
async fn truncation_is_null_when_the_walk_ran_to_completion() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = get(
        router,
        &format!("/code-files?scope={scope}&page_size=2000"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    // The fixture is far below the 50k walk ceiling, so the corpus is complete:
    // `truncated` is present-and-null (a client can read it), never a fabricated
    // block implying an unbounded read nor an absent field hiding the axis.
    assert!(
        body["data"].get("truncated").is_some(),
        "the field is present"
    );
    assert!(
        body["data"]["truncated"].is_null(),
        "honest completeness: {body}"
    );
}

#[tokio::test]
async fn a_code_graphless_cell_serves_an_honest_empty_listing_with_tiers() {
    // Tier parity on a cell with no code graph: an empty listing and an honest
    // tiers block, HTTP 200 — never a 5xx and never a fabricated entry.
    let (_dir, state) = vault_only_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = get(
        router,
        &format!("/code-files?scope={scope}&page_size=2000"),
        &token,
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "graphless is a 200, not a 5xx: {body}"
    );
    assert!(body["tiers"].is_object(), "tiers block rides the response");
    assert!(
        body["data"]["entries"].as_array().unwrap().is_empty(),
        "no source files → empty listing: {body}"
    );
    assert!(
        body["next_cursor"].is_null(),
        "no continuation on an empty set"
    );
    assert!(
        body["data"]["truncated"].is_null(),
        "an empty walk is complete"
    );
}

#[tokio::test]
async fn an_unknown_scope_is_a_typed_error_that_still_carries_tiers() {
    // The error envelope carries tiers too, so a client distinguishes "your
    // request was wrong" from "a backend is down" (wire-contract).
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get(
        router,
        "/code-files?scope=Y:/no/such/scope&page_size=2000",
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(
        body["tiers"].is_object(),
        "error envelope carries tiers: {body}"
    );
}
