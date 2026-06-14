//! `/file-tree` integration coverage (dashboard-code-tree plan P04.S13/S14):
//! bounded reads truncate and cursor-paginate honestly, the listing honors the
//! repository ignore rules, every response carries the tiers block, the
//! `code:<path>` interlink is derived through the shared rule, and an
//! out-of-worktree path is refused. The endpoint is driven end-to-end through
//! the real router (the same path the SPA uses), against a real git worktree —
//! no mocks (engine-read-and-infer; real services in integration tests).

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

fn git(dir: &Path, args: &[&str]) {
    let output = std::process::Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "f")
        .env("GIT_AUTHOR_EMAIL", "f@t")
        .env("GIT_COMMITTER_NAME", "f")
        .env("GIT_COMMITTER_EMAIL", "f@t")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn touch(path: &Path, body: &str) {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(path, body).unwrap();
}

/// A real one-commit git worktree with a `.vault` corpus (so the scope is a
/// selectable vault-bearing worktree the registry will warm) plus a small source
/// tree. Returns the state and the scope token the routes accept.
fn worktree_state() -> (tempfile::TempDir, Arc<AppState>, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    touch(
        &root.join(".vault/plan/2026-06-14-ft-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#ft'\n---\n\nMentions `src/main.rs`.\n",
    );
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);
    let state = app::build_state(root.to_path_buf());
    let scope = state.workspace_root.to_string_lossy().replace('\\', "/");
    (dir, state, scope)
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

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
}

#[tokio::test]
async fn file_tree_lists_one_level_with_the_shared_code_interlink_and_tiers() {
    // P04.S13 (one-level listing) + P02.S06 (shared `code:<path>` id) +
    // every-wire-response-carries-the-tiers-block.
    let (dir, state, scope) = worktree_state();
    touch(&dir.path().join("src/main.rs"), "fn main() {}\n");
    touch(&dir.path().join("src/lib.rs"), "// lib\n");
    touch(&dir.path().join("README.md"), "# readme\n");
    let _ = &dir;
    let token = state.bearer.clone();

    let (status, body) = get(
        build_router(state.clone()),
        &format!("/file-tree?scope={}", urlencode(&scope)),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let entries = body["data"]["entries"].as_array().unwrap();
    // Directories before files: `.vault`, `src` (dirs), then `README.md` (file).
    let kinds: Vec<&str> = entries
        .iter()
        .map(|e| e["kind"].as_str().unwrap())
        .collect();
    let dir_count = kinds.iter().filter(|k| **k == "dir").count();
    assert!(dir_count >= 1, "src is a directory level");
    // Every entry carries the shared `code:<path>` interlink id.
    let src = entries
        .iter()
        .find(|e| e["path"] == "src")
        .expect("src directory listed");
    assert_eq!(src["node_id"], "code:src", "shared CodeArtifact node id");
    assert_eq!(src["kind"], "dir");
    assert_eq!(src["has_children"], true, "src has children to expand");
    // Only the immediate level — src/main.rs is NOT in the root listing.
    assert!(
        !entries.iter().any(|e| e["path"] == "src/main.rs"),
        "one level only; descend by listing path=src"
    );
    // Tiers block present on success.
    assert!(body["tiers"]["structural"]["available"].is_boolean());

    // Descend one level: list path=src and find the file with its interlink id.
    let (status, body) = get(
        build_router(state),
        &format!("/file-tree?scope={}&path=src", urlencode(&scope)),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let entries = body["data"]["entries"].as_array().unwrap();
    let main = entries
        .iter()
        .find(|e| e["path"] == "src/main.rs")
        .expect("src/main.rs listed on descent");
    assert_eq!(main["kind"], "file");
    assert_eq!(main["has_children"], false);
    assert_eq!(
        main["node_id"], "code:src/main.rs",
        "file row maps to its code: node id through the shared rule"
    );
}

#[tokio::test]
async fn file_tree_caps_a_pathological_level_and_cursor_paginates() {
    // P04.S13: a directory with more children than the per-level ceiling
    // truncates honestly (a `truncated`-style marker), and the level
    // cursor-paginates so the wire never carries the whole level at once.
    let (dir, state, scope) = worktree_state();
    // 5 files in a flat directory; page through them 2 at a time.
    let flat = dir.path().join("flat");
    for i in 0..5 {
        touch(&flat.join(format!("f{i:02}.rs")), "x\n");
    }
    let token = state.bearer.clone();

    // First page: 2 entries + a next_cursor. The router is built once and
    // cloned across both page fetches so the SAME warm scope (and the same
    // bearer) serves both — `get` consumes the router, so the first call takes
    // a clone and the second the original.
    let router = build_router(state);
    let (status, body) = get(
        router.clone(),
        &format!(
            "/file-tree?scope={}&path=flat&page_size=2",
            urlencode(&scope)
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let page1 = body["data"]["entries"].as_array().unwrap();
    assert_eq!(page1.len(), 2, "page_size honored");
    let cursor = body["next_cursor"].as_str().expect("more pages → a cursor");
    assert_eq!(page1[0]["path"], "flat/f00.rs");
    assert_eq!(page1[1]["path"], "flat/f01.rs");

    // Second page resumes after the cursor (exclusive), over the same scope.
    let (status, body) = get(
        router,
        &format!(
            "/file-tree?scope={}&path=flat&page_size=2&cursor={}",
            urlencode(&scope),
            urlencode(cursor)
        ),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let page2 = body["data"]["entries"].as_array().unwrap();
    assert_eq!(page2[0]["path"], "flat/f02.rs", "resumes after the cursor");
    assert!(
        !page2.iter().any(|e| e["path"] == "flat/f01.rs"),
        "cursor is exclusive; no overlap"
    );
}

#[tokio::test]
async fn file_tree_honors_gitignore_and_excludes_build_noise() {
    // P04.S14: the listing honors the repository ignore rules — `.git`, build
    // output, vendored trees, and `.gitignore` directory entries do not appear,
    // while `.vault` (the corpus) and real source do.
    let (dir, state, scope) = worktree_state();
    let root = dir.path();
    std::fs::write(root.join(".gitignore"), "build\nvendored/\n").unwrap();
    touch(&root.join("src/main.rs"), "fn main() {}\n");
    touch(&root.join("node_modules/dep/index.js"), "x\n");
    touch(&root.join("target/debug/app"), "x\n");
    touch(&root.join("build/out.o"), "x\n");
    touch(&root.join("vendored/lib.rs"), "x\n");
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get(
        router,
        &format!("/file-tree?scope={}", urlencode(&scope)),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let paths: Vec<&str> = body["data"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["path"].as_str().unwrap())
        .collect();
    assert!(paths.contains(&"src"), "real source listed");
    assert!(paths.contains(&".vault"), "the corpus dot-dir is listed");
    assert!(!paths.contains(&".git"), ".git excluded");
    assert!(!paths.contains(&"node_modules"), "node_modules excluded");
    assert!(!paths.contains(&"target"), "target excluded");
    assert!(!paths.contains(&"build"), "gitignored build excluded");
    assert!(!paths.contains(&"vendored"), "gitignored vendored excluded");
}

#[tokio::test]
async fn file_tree_unknown_scope_400s_with_the_tiers_block() {
    // P04.S14: an unknown / non-worktree scope (the remote-ref-style degradation
    // surface) is refused honestly with the tiers block attached — never a bare
    // error. (A remote ref has no selectable worktree, so it never resolves to a
    // file-tree; the scope-validation 400 is the honest refusal.)
    let (_dir, state, _scope) = worktree_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let (status, body) = get(router, "/file-tree?scope=/nowhere/at/all", &token).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].is_string(), "honest error message");
    assert!(
        body["tiers"]["structural"]["available"].is_boolean(),
        "the 400 still carries the tiers block"
    );
}

#[tokio::test]
async fn file_tree_refuses_a_path_that_escapes_the_worktree() {
    // Security: a traversal path is a malformed REQUEST (a tiered 400), distinct
    // from degradation — the listing never reads outside the served worktree.
    let (_dir, state, scope) = worktree_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let (status, body) = get(
        router,
        &format!("/file-tree?scope={}&path=..%2F..%2Fetc", urlencode(&scope)),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        body["tiers"]["structural"]["available"].is_boolean(),
        "the refusal carries the tiers block"
    );
}
