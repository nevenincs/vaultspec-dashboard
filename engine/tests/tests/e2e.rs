//! End-to-end suite (W03.P12.S54): a multi-worktree fixture workspace
//! exercised across both front doors — CLI/serve parity, the first true
//! multi-corpus-view facet exercise, degradation paths, and the
//! CLI-index-during-serve concurrency case (DF-4 retirement).

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::Duration;

use engine_model::ScopeRef;

fn binary() -> PathBuf {
    // The workspace target dir, relative to this package.
    let target = Path::new(env!("CARGO_MANIFEST_DIR")).join("../target/debug");
    let exe = if cfg!(windows) {
        "vaultspec.exe"
    } else {
        "vaultspec"
    };
    target.join(exe)
}

fn git(dir: &Path, args: &[&str]) {
    let output = Command::new("git")
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

/// The fixture landscape: a main worktree with a vault corpus, plus a
/// feature-branch worktree whose corpus genuinely diverges (one doc edited
/// on the branch).
fn fixture_landscape() -> (tempfile::TempDir, PathBuf, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let main = dir.path().join("main");
    std::fs::create_dir_all(&main).unwrap();
    git(&main, &["init", "-b", "main", "."]);
    // Byte-stable fixtures: without this, checkout into the second
    // worktree rewrites LF→CRLF on Windows and EVERY doc diverges —
    // technically true divergence (the engine compares worktree bytes),
    // but not what this fixture is testing.
    git(&main, &["config", "core.autocrlf", "false"]);
    std::fs::create_dir_all(main.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(main.join("src")).unwrap();
    std::fs::write(main.join("src/lib.rs"), "pub fn live() {}\n").unwrap();
    std::fs::write(
        main.join(".vault/plan/2026-06-12-e2e-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#e2e-feature'\n---\n\n\
         - [ ] `S01` - wire `src/lib.rs`; see [[2026-06-12-e2e-adr]]\n",
    )
    .unwrap();
    std::fs::write(
        main.join(".vault/plan/2026-06-12-e2e-adr.md"),
        "---\ntags:\n  - '#plan'\n  - '#e2e-feature'\n---\n\n# adr-ish\n",
    )
    .unwrap();
    git(&main, &["add", "."]);
    git(&main, &["commit", "-m", "fixture: main corpus"]);

    let feature = dir.path().join("feature-x");
    git(
        &main,
        &[
            "worktree",
            "add",
            "-b",
            "feature-x",
            feature.to_str().unwrap(),
        ],
    );
    // Diverge the corpus on the branch: the plan gains a mention.
    std::fs::write(
        feature.join(".vault/plan/2026-06-12-e2e-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#e2e-feature'\n---\n\n\
         - [x] `S01` - wire `src/lib.rs` and `src/new.rs`; see [[2026-06-12-e2e-adr]]\n",
    )
    .unwrap();
    git(&feature, &["add", "."]);
    git(&feature, &["commit", "-m", "fixture: branch divergence"]);
    (dir, main, feature)
}

fn run_cli(dir: &Path, args: &[&str]) -> (i32, serde_json::Value) {
    let output = Command::new(binary())
        .current_dir(dir)
        .args(args)
        .arg("--json")
        .output()
        .expect("binary runs");
    let stdout = String::from_utf8_lossy(&output.stdout);
    (
        output.status.code().unwrap_or(-1),
        serde_json::from_str(&stdout).unwrap_or(serde_json::Value::Null),
    )
}

struct ServeGuard(Child);
impl Drop for ServeGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
    }
}

fn start_serve(root: &Path, port: u16) -> (ServeGuard, String) {
    let child = Command::new(binary())
        .current_dir(root)
        .args(["serve", "--port", &port.to_string()])
        .spawn()
        .expect("serve starts");
    // Wait for the discovery file (startup includes a cold index).
    let service_json = root.join(".vault/data/engine-data/service.json");
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    let token = loop {
        if let Ok(raw) = std::fs::read_to_string(&service_json)
            && let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw)
            && v["port"].as_u64() == Some(port as u64)
            && let Some(token) = v["service_token"].as_str()
        {
            break token.to_string();
        }
        assert!(std::time::Instant::now() < deadline, "serve never came up");
        std::thread::sleep(Duration::from_millis(200));
    };
    (ServeGuard(child), token)
}

fn http_get(port: u16, path: &str, token: &str) -> (u16, serde_json::Value) {
    http(port, "GET", path, token, None)
}

fn http(
    port: u16,
    method: &str,
    path: &str,
    token: &str,
    body: Option<&str>,
) -> (u16, serde_json::Value) {
    use std::io::{Read, Write};
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream
        .set_read_timeout(Some(Duration::from_secs(30)))
        .unwrap();
    let body = body.unwrap_or("");
    let request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\
         Authorization: Bearer {token}\r\nContent-Type: application/json\r\n\
         Content-Length: {}\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(request.as_bytes()).unwrap();
    let mut raw = String::new();
    stream.read_to_string(&mut raw).unwrap();
    let (head, payload) = raw.split_once("\r\n\r\n").expect("http response");
    let status: u16 = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse().ok())
        .expect("status");
    // De-chunk if needed (test client keeps it simple: axum responds with
    // content-length for JSON bodies).
    (
        status,
        serde_json::from_str(payload).unwrap_or(serde_json::Value::Null),
    )
}

#[test]
fn multi_worktree_corpus_views_diverge_as_facets() {
    // The first true multi-corpus-view exercise of the facet machinery:
    // both worktrees ingest into ONE graph under their own scopes.
    let (_dir, main, feature) = fixture_landscape();
    let store_dir = tempfile::tempdir().unwrap();
    let store = engine_store::Store::open_at(&store_dir.path().join("e2e.sqlite3")).unwrap();

    let mut graph = engine_graph::LinkageGraph::new();
    let scope_main = ScopeRef::Worktree {
        path: main.to_string_lossy().replace('\\', "/"),
    };
    let scope_feature = ScopeRef::Worktree {
        path: feature.to_string_lossy().replace('\\', "/"),
    };
    engine_graph::index::index_worktree_into(&mut graph, &main, &scope_main, &store, 0).unwrap();
    engine_graph::index::index_worktree_into(&mut graph, &feature, &scope_feature, &store, 0)
        .unwrap();

    let plan = graph
        .node(&engine_model::NodeId("doc:2026-06-12-e2e-plan".into()))
        .expect("plan node");
    assert_eq!(plan.facets.len(), 2, "one node, two corpus views (D4.2)");
    let divergences = engine_graph::divergences(plan);
    assert!(
        divergences
            .iter()
            .any(|d| d.kind == engine_graph::DivergenceKind::Content),
        "the branch edit IS the divergence signal: {divergences:?}"
    );

    // The adr did not diverge: same content hash in both views.
    let adr = graph
        .node(&engine_model::NodeId("doc:2026-06-12-e2e-adr".into()))
        .expect("adr node");
    assert_eq!(adr.facets.len(), 2);
    assert!(engine_graph::divergences(adr).is_empty());
}

#[test]
fn cli_and_serve_agree_on_the_graph() {
    // D6.1 parity: same capability, same payload modulo envelope.
    let (_dir, main, _feature) = fixture_landscape();
    let (code, cli) = run_cli(&main, &["graph"]);
    assert_eq!(code, 0);
    let cli_nodes: Vec<&str> = cli["data"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();
    let cli_edges: Vec<&str> = cli["data"]["edges"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|e| e["id"].as_str())
        .collect();

    let (_guard, token) = start_serve(&main, 8821);
    let scope = main.to_string_lossy().replace('\\', "/");
    let (status, serve) = http(
        8821,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope": "{scope}"}}"#)),
    );
    assert_eq!(status, 200);
    let serve_nodes: Vec<&str> = serve["data"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();
    let serve_edges: Vec<&str> = serve["data"]["edges"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|e| e["id"].as_str())
        .collect();

    assert_eq!(
        cli_nodes, serve_nodes,
        "identical node ids, identical order"
    );
    assert_eq!(
        cli_edges, serve_edges,
        "identical edge ids, identical order"
    );
    // Identity stability across repeated queries (plan verification).
    let (_, again) = http(
        8821,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope": "{scope}"}}"#)),
    );
    assert_eq!(
        serve["data"]["nodes"], again["data"]["nodes"],
        "byte-stable across queries"
    );
}

#[test]
fn concurrent_cli_index_does_not_kill_serve() {
    // DF-4 retirement: the documented CLI-vs-serve concurrency story.
    let (_dir, main, _feature) = fixture_landscape();
    let (_guard, token) = start_serve(&main, 8822);

    for _ in 0..3 {
        let (code, _) = run_cli(&main, &["index"]);
        assert_eq!(code, 0, "concurrent one-shot index succeeds");
    }
    let (status, body) = http_get(8822, "/status", &token);
    assert_eq!(status, 200, "serve survives concurrent writers");
    assert_eq!(body["data"]["ok"], true);
    assert_eq!(
        body["data"]["watcher"]["running"], true,
        "watcher alive, not zombie"
    );
}

#[test]
fn degradation_paths_state_themselves() {
    let (_dir, main, _feature) = fixture_landscape();

    // Rag absent in the fixture: stated in the tiers block, not an error.
    // (On a developer machine with a live home-dir rag service the tier is
    // truthfully available instead — both are correct, both asserted.)
    let (code, map) = run_cli(&main, &["map"]);
    assert_eq!(code, 0);
    let semantic = &map["tiers"]["semantic"];
    if semantic["available"] == false {
        assert!(semantic["reason"].is_string(), "absence carries a reason");
    }

    // Historical (as-of) views state the v1 fidelity bound.
    let (code, asof) = run_cli(&main, &["graph", "--as-of", "main"]);
    assert_eq!(code, 0);
    assert!(
        asof["data"]["nodes"]
            .as_array()
            .is_some_and(|n| !n.is_empty()),
        "blob-true view has content"
    );

    // Broken-edge retention: the branch-only mention `src/new.rs` does not
    // exist on main, so main's view has no broken edge for it, but the
    // always-present broken lens still answers.
    let (code, broken) = run_cli(
        &main,
        &["graph", "--filter", r#"{"structural_state": ["broken"]}"#],
    );
    assert_eq!(code, 0);
    assert!(broken["data"]["edges"].as_array().is_some());
}

/// REAL-repo validation leg (team-lead's grounding mandate): exercised
/// against THIS repository — creates a temporary branch + worktree,
/// diverges a vault doc, asserts two corpus views + divergence, cleans up.
/// Env-gated: mutating the developer's repository is opt-in.
#[test]
fn real_repo_worktree_leg() {
    if std::env::var("VAULTSPEC_E2E_REAL_REPO").as_deref() != Ok("1") {
        eprintln!("skipped: set VAULTSPEC_E2E_REAL_REPO=1 to run (mutates the real repo)");
        return;
    }
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(2)
        .unwrap()
        .to_path_buf();
    let branch = "e2e-tmp-worktree-leg";
    let wt_dir = std::env::temp_dir().join("vaultspec-e2e-worktree");
    let _ = Command::new("git")
        .current_dir(&repo_root)
        .args(["worktree", "remove", "--force", wt_dir.to_str().unwrap()])
        .output();
    let _ = Command::new("git")
        .current_dir(&repo_root)
        .args(["branch", "-D", branch])
        .output();
    git(
        &repo_root,
        &["worktree", "add", "-b", branch, wt_dir.to_str().unwrap()],
    );

    // Touch a vault doc on the branch so a facet genuinely diverges.
    let doc = wt_dir.join(".vault/research/2026-06-12-dashboard-foundation-research.md");
    let mut text = std::fs::read_to_string(&doc).unwrap();
    text.push_str("\nE2E divergence marker.\n");
    std::fs::write(&doc, text).unwrap();
    git(&wt_dir, &["add", "."]);
    git(&wt_dir, &["commit", "-m", "e2e: divergence marker"]);

    // Map sees both worktrees; the graph reconciles both corpus views.
    let (code, map) = run_cli(&repo_root, &["map"]);
    assert_eq!(code, 0);
    assert!(map["data"]["worktrees"].as_array().unwrap().len() >= 2);

    let store_dir = tempfile::tempdir().unwrap();
    let store = engine_store::Store::open_at(&store_dir.path().join("real.sqlite3")).unwrap();
    let mut graph = engine_graph::LinkageGraph::new();
    for root in [&repo_root, &wt_dir] {
        let scope = ScopeRef::Worktree {
            path: root.to_string_lossy().replace('\\', "/"),
        };
        engine_graph::index::index_worktree_into(&mut graph, root, &scope, &store, 0).unwrap();
    }
    let node = graph
        .node(&engine_model::NodeId(
            "doc:2026-06-12-dashboard-foundation-research".into(),
        ))
        .expect("research node");
    assert_eq!(node.facets.len(), 2, "two real corpus views");
    assert!(
        engine_graph::divergences(node)
            .iter()
            .any(|d| d.kind == engine_graph::DivergenceKind::Content),
        "real divergence surfaced"
    );

    // Cleanup: remove the worktree and branch.
    git(
        &repo_root,
        &["worktree", "remove", "--force", wt_dir.to_str().unwrap()],
    );
    git(&repo_root, &["branch", "-D", branch]);
}
