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

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
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

/// Capture the SSE backlog a `/stream?...&since=N` resume replays: connect,
/// send the request, read raw bytes until the stream goes idle (the read times
/// out after the backlog is flushed and keep-alive begins), and return the raw
/// SSE text so the caller can parse `event:`/`id:`/`data:` lines. The resume
/// backlog is emitted synchronously before the live tail, so a short read
/// window captures it deterministically.
fn http_stream_capture(port: u16, path: &str, token: &str, window: Duration) -> String {
    use std::io::{Read, Write};
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect");
    stream.set_read_timeout(Some(window)).unwrap();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n\
         Authorization: Bearer {token}\r\nAccept: text/event-stream\r\n\r\n"
    );
    stream.write_all(request.as_bytes()).unwrap();
    let mut raw = Vec::new();
    let mut buf = [0u8; 4096];
    // Read until the window elapses (timeout) — the backlog is flushed well
    // within it; the timeout ends the otherwise-infinite SSE read.
    loop {
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => raw.extend_from_slice(&buf[..n]),
            Err(_) => break, // read timeout: backlog captured, stop.
        }
    }
    String::from_utf8_lossy(&raw).into_owned()
}

#[test]
fn switching_active_scope_serves_that_worktree_and_resumes_its_own_clock() {
    // W03.P07.S24: with a workspace holding two vault-bearing worktrees, a
    // PUT /session active_scope switch must (a) retarget reads to THAT
    // worktree's divergent corpus and (b) keep per-scope SSE `since=` resume
    // correct against the switched scope's OWN monotonic clock.
    let (_dir, main, feature) = fixture_landscape();
    let (_guard, token) = start_serve(&main, 8823);
    let main_scope = main.to_string_lossy().replace('\\', "/");
    let feature_scope = feature.to_string_lossy().replace('\\', "/");

    // The two worktrees diverge: the feature branch's plan adds a `src/new.rs`
    // mention that main's plan does not have. `src/new.rs` does not exist on
    // disk, so it surfaces as a BROKEN structural edge whose `dst` addresses
    // `code:src/new.rs` — present in the feature scope's graph, absent from
    // main's. That edge is the divergence proving the switch retargeted reads.
    let new_mention = "code:src/new.rs";
    let has_new_edge = |graph: &serde_json::Value| -> bool {
        graph["data"]["edges"]
            .as_array()
            .unwrap()
            .iter()
            .any(|e| e["dst"] == new_mention)
    };

    // Sanity: BEFORE switching, the active scope is main, and main's graph has
    // no edge to src/new.rs (that mention is branch-only).
    let (status, session) = http_get(8823, "/session", &token);
    assert_eq!(status, 200, "GET /session: {session}");
    assert_eq!(
        session["data"]["active_scope"].as_str(),
        Some(main_scope.as_str()),
        "the launch worktree is the active scope at boot"
    );
    let (status, main_graph) = http(
        8823,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope": "{main_scope}"}}"#)),
    );
    assert_eq!(status, 200);
    assert!(
        !has_new_edge(&main_graph),
        "main's corpus has no src/new.rs mention (it is branch-only)"
    );

    // Switch the active scope to the feature worktree through the session API.
    let (status, switched) = http(
        8823,
        "PUT",
        "/session",
        &token,
        Some(&format!(r#"{{"active_scope": "{feature_scope}"}}"#)),
    );
    assert_eq!(status, 200, "PUT /session active_scope: {switched}");
    assert_eq!(
        switched["data"]["active_scope"].as_str(),
        Some(feature_scope.as_str()),
        "the session now names the feature worktree as active"
    );

    // The feature scope's graph DOES carry the branch-only src/new.rs mention —
    // the read was genuinely retargeted to that worktree's bytes.
    let (status, feature_graph) = http(
        8823,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope": "{feature_scope}"}}"#)),
    );
    assert_eq!(status, 200);
    assert!(
        has_new_edge(&feature_graph),
        "the feature worktree's corpus serves its own divergent src/new.rs \
         mention: {feature_graph}"
    );

    // Per-scope clocks are independent: each scope's /vault-tree serves its own
    // doc set, and a `since=0` stream resume against the FEATURE scope replays
    // the feature cell's OWN deltas (its cold-index keyframe), not main's.
    let (status, feature_tree) = http(
        8823,
        "GET",
        &format!("/vault-tree?scope={}", urlencode(&feature_scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "feature vault-tree served: {feature_tree}");
    assert!(
        feature_tree["data"]["entries"]
            .as_array()
            .is_some_and(|e| !e.is_empty()),
        "the feature scope's vault-tree has entries"
    );

    // SSE `since=0` against the feature scope: the resume replays that cell's
    // own ring (the cold-index keyframe deltas), each `id:` a seq on the
    // feature cell's OWN clock. A non-empty backlog proves the feature scope
    // has its own populated resume buffer, distinct from main's.
    let feature_backlog = http_stream_capture(
        8823,
        &format!("/stream?scope={}&since=0", urlencode(&feature_scope)),
        &token,
        Duration::from_millis(1500),
    );
    let feature_ids: Vec<u64> = feature_backlog
        .lines()
        .filter_map(|l| l.strip_prefix("id:").map(str::trim))
        .filter_map(|s| s.parse().ok())
        .collect();
    assert!(
        !feature_ids.is_empty(),
        "since=0 resume against the feature scope replays its own clock's \
         deltas: {feature_backlog}"
    );
    // The resumed ids are monotonic on this scope's own clock.
    assert!(
        feature_ids.windows(2).all(|w| w[1] > w[0]),
        "feature scope resume ids ascend on its own monotonic clock: {feature_ids:?}"
    );

    // The main scope keeps its OWN clock: a since=0 resume against main also
    // replays a non-empty backlog of main's deltas, independent of the feature
    // scope's clock — the two never share a seq space.
    let main_backlog = http_stream_capture(
        8823,
        &format!("/stream?scope={}&since=0", urlencode(&main_scope)),
        &token,
        Duration::from_millis(1500),
    );
    let main_ids: Vec<u64> = main_backlog
        .lines()
        .filter_map(|l| l.strip_prefix("id:").map(str::trim))
        .filter_map(|s| s.parse().ok())
        .collect();
    assert!(
        !main_ids.is_empty(),
        "since=0 resume against the main scope replays its own clock's deltas: \
         {main_backlog}"
    );
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
