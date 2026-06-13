//! Consumer-shaped conformance test (addendum plan S06, audit ADD-901):
//! asserts the TYPED-CLIENT expectations per contract capability over live
//! serve responses — the GUI's reading, not the engine's own. Written
//! failing-first: each S49 divergence is reproduced as an assertion that
//! was red before the S01–S05 fixes landed.

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::Duration;

fn binary() -> PathBuf {
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

/// Two-commit fixture: a vault corpus with features, titles, dates, and a
/// code mention — enough surface for every contract capability.
fn fixture() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    git(&root, &["config", "core.autocrlf", "false"]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/lib.rs"), "pub fn alpha() {}\n").unwrap();
    std::fs::write(
        root.join(".vault/adr/2026-06-13-conf-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#conf-feature'\ndate: '2026-06-13'\n---\n\n\
         # conf adr title\n\nDecides things.\n",
    )
    .unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "T1: adr"]);
    std::fs::write(
        root.join(".vault/plan/2026-06-13-conf-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#conf-feature'\ndate: '2026-06-13'\n---\n\n\
         # conf plan title\n\n- [x] `S01` - touch `src/lib.rs`; see [[2026-06-13-conf-adr]]\n\
         - [ ] `S02` - later\n",
    )
    .unwrap();
    std::fs::write(
        root.join(".vault/adr/2026-06-13-other-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#other-feature'\ndate: '2026-06-13'\n---\n\n\
         # other adr\n\nMentions [[2026-06-13-conf-plan]].\n",
    )
    .unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "T2: plan + cross-feature adr"]);
    (dir, root)
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
    (
        status,
        serde_json::from_str(payload).unwrap_or(serde_json::Value::Null),
    )
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

#[test]
fn typed_client_expectations_hold_over_live_serve() {
    let (_dir, root) = fixture();
    let (_guard, token) = start_serve(&root, 8831);
    let scope = root.to_string_lossy().replace('\\', "/");

    // --- S49 divergence 1: as-of and diff accept ms timestamps ----------------
    let t = now_ms();
    let (status, asof) = http(
        8831,
        "GET",
        &format!("/graph/asof?scope={}&t={t}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "ms timestamp accepted on asof: {asof}");
    assert!(
        asof["data"]["nodes"]
            .as_array()
            .is_some_and(|n| !n.is_empty()),
        "as-of at now resolves the latest commit's corpus"
    );
    let (status, diff) = http(
        8831,
        "GET",
        &format!("/graph/diff?scope={}&from=HEAD~1&to={t}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "ms timestamp accepted on diff: {diff}");
    assert!(
        diff["data"]["deltas"]
            .as_array()
            .is_some_and(|d| !d.is_empty()),
        "T1→now diff carries the plan addition"
    );
    // Revisions keep working (revision-first resolution).
    let (status, _) = http(
        8831,
        "GET",
        &format!("/graph/asof?scope={}&t=HEAD~1", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "revision form still accepted");

    // --- S49 divergence 2: feature granularity synthesizes the convergence ---
    let (status, constellation) = http(
        8831,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(
            r#"{{"scope": "{scope}", "granularity": "feature"}}"#
        )),
    );
    assert_eq!(status, 200);
    let nodes = constellation["data"]["nodes"].as_array().expect("nodes");
    assert!(
        !nodes.is_empty(),
        "feature granularity synthesizes nodes (D4.1), never empty"
    );
    assert!(
        nodes.iter().all(|n| n["kind"] == "feature"),
        "constellation nodes are feature convergences"
    );
    let conf = nodes
        .iter()
        .find(|n| n["id"] == "feature:conf-feature")
        .expect("feature:conf-feature synthesized");
    assert!(
        conf["member_count"].as_u64().is_some_and(|c| c >= 2),
        "convergence counts its evidence documents"
    );
    assert!(
        conf["degree_by_tier"].is_object(),
        "feature nodes carry the degree projection"
    );
    let metas = constellation["data"]["meta_edges"]
        .as_array()
        .expect("meta_edges");
    assert!(!metas.is_empty(), "cross-feature meta-edges present");
    assert!(
        metas.iter().all(
            |m| m["src"].as_str().is_some_and(|s| s.starts_with("feature:"))
                && m["dst"].as_str().is_some_and(|s| s.starts_with("feature:"))
        ),
        "meta-edges address feature NODE IDS, not bare tags"
    );

    // --- S49 divergence 3: contract §4 fields on list-shape nodes -------------
    let (status, docs) = http(
        8831,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope": "{scope}"}}"#)),
    );
    assert_eq!(status, 200);
    let plan_node = docs["data"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|n| n["id"] == "doc:2026-06-13-conf-plan")
        .expect("plan doc node")
        .clone();
    assert_eq!(
        plan_node["title"], "conf plan title",
        "title extracted from the body H1"
    );
    assert_eq!(
        plan_node["dates"]["created"], "2026-06-13",
        "created from frontmatter date"
    );
    assert!(
        plan_node["dates"]["modified"].is_number(),
        "modified carried (ms)"
    );
    assert!(
        plan_node["degree_by_tier"].is_object(),
        "degree projection on the LIST shape, not only detail"
    );
    assert_eq!(
        plan_node["doc_type"], "plan",
        "doc_type from the vault subdir"
    );
    assert!(
        plan_node["lifecycle"]["progress"]["done"].is_number(),
        "plan lifecycle progress on the list shape"
    );

    // --- S49 divergence 4: /status git block + /vault-tree dates/doc_type -----
    let (status, st) = http(8831, "GET", "/status", &token, None);
    assert_eq!(status, 200);
    assert!(
        st["data"]["git"]["dirty"].is_boolean() && st["data"]["git"]["head_ref"].is_string(),
        "serve /status carries the git block (front-door parity)"
    );
    let (status, tree) = http(
        8831,
        "GET",
        &format!("/vault-tree?scope={}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200);
    let entry = tree["data"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["stem"] == "2026-06-13-conf-plan")
        .expect("plan entry")
        .clone();
    assert_eq!(entry["doc_type"], "plan", "doc_type server-side");
    assert_eq!(entry["dates"]["created"], "2026-06-13", "dates server-side");

    // --- S49 divergence 5: bounded commit-event node_ids ----------------------
    let (status, events) = http(
        8831,
        "GET",
        &format!("/events?scope={}", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200);
    let raws = events["data"]["payload"]["events"]
        .as_array()
        .expect("raw events");
    for event in raws {
        let ids = event["node_ids"].as_array().unwrap();
        let code_ids = ids
            .iter()
            .filter(|i| i.as_str().is_some_and(|s| s.starts_with("code:")))
            .count();
        assert!(code_ids <= 20, "code ids capped at the recorded bound (20)");
    }
    // Doc ids always survive the bound — they are the join key.
    assert!(
        raws.iter().any(|e| {
            e["node_ids"]
                .as_array()
                .is_some_and(|ids| ids.iter().any(|i| i == "doc:2026-06-13-conf-plan"))
        }),
        "doc ids never truncated"
    );
}

/// Error-surface conformance (adversarial findings, 2026-06-13): EVERY wire
/// error carries the tiers block — including framework-boundary rejections
/// that fire before any handler (defect 1) — and revision-parse errors never
/// leak build internals (defect 2).
#[test]
fn error_surface_carries_tiers_and_hides_internals() {
    let (_dir, root) = fixture();
    let (_guard, token) = start_serve(&root, 8833);
    let scope = root.to_string_lossy().replace('\\', "/");

    // Defect 1 — the tiers block rides framework-boundary errors:
    // malformed JSON body (Json extractor rejection) -> 400.
    let (status, body) = http(8833, "POST", "/graph/query", &token, Some("{bad"));
    assert_eq!(status, 400, "malformed body: {body}");
    assert!(
        body["tiers"].is_object(),
        "malformed-body 400 carries tiers"
    );
    // missing required query param (Query extractor rejection) -> 400.
    let (status, body) = http(8833, "GET", "/vault-tree", &token, None);
    assert_eq!(status, 400);
    assert!(body["tiers"].is_object(), "missing-param 400 carries tiers");
    // wrong method (router rejection) -> 405.
    let (status, body) = http(8833, "GET", "/graph/query", &token, None);
    assert_eq!(status, 405);
    assert!(body["tiers"].is_object(), "405 carries tiers");
    // no/!bad auth (gate rejection) -> 401.
    let (status, body) = http(8833, "GET", "/status", "", None);
    assert_eq!(status, 401);
    assert!(body["tiers"].is_object(), "401 carries tiers");

    // Defect 2 — an unparseable revision is sanitized, no build internals.
    let (status, body) = http(
        8833,
        "POST",
        "/graph/query",
        &token,
        Some(&format!(r#"{{"scope":"{scope}","as_of":"not-a-rev"}}"#)),
    );
    assert_eq!(status, 400);
    assert!(
        body["tiers"].is_object(),
        "revision-error 400 carries tiers"
    );
    let err = body["error"].as_str().unwrap_or("");
    assert!(
        !err.contains(".cargo") && !err.contains("gix-revision") && !err.contains(".rs:"),
        "revision error must not leak build internals: {err}"
    );
    assert!(err.contains("invalid revision"), "names the failure: {err}");
}

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
}
