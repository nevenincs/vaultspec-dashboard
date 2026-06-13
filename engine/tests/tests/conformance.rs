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

/// Start serve on an OS-assigned EPHEMERAL port (`--port 0`) and read the
/// real bound port + token back from the fixture's own `service.json` — so
/// concurrent test runs never collide on a fixed port (recorded backlog,
/// 2026-06-13). Each fixture has an isolated service.json, so the port read
/// is unambiguous.
fn start_serve(root: &Path) -> (ServeGuard, u16, String) {
    let child = Command::new(binary())
        .current_dir(root)
        .args(["serve", "--port", "0"])
        .spawn()
        .expect("serve starts");
    // Guard the child IMMEDIATELY so it is killed on every path, including the
    // deadline-assert panic below (clippy::zombie_processes).
    let guard = ServeGuard(child);
    let service_json = root.join(".vault/data/engine-data/service.json");
    let deadline = std::time::Instant::now() + Duration::from_secs(30);
    loop {
        if let Ok(raw) = std::fs::read_to_string(&service_json)
            && let Ok(v) = serde_json::from_str::<serde_json::Value>(&raw)
            && let Some(port) = v["port"].as_u64()
            && port != 0
            && let Some(token) = v["service_token"].as_str()
        {
            break (guard, port as u16, token.to_string());
        }
        assert!(std::time::Instant::now() < deadline, "serve never came up");
        std::thread::sleep(Duration::from_millis(200));
    }
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
    let (_guard, port, token) = start_serve(&root);
    let scope = root.to_string_lossy().replace('\\', "/");

    // --- S49 divergence 1: as-of and diff accept ms timestamps ----------------
    let t = now_ms();
    let (status, asof) = http(
        port,
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
        port,
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
        port,
        "GET",
        &format!("/graph/asof?scope={}&t=HEAD~1", urlencode(&scope)),
        &token,
        None,
    );
    assert_eq!(status, 200, "revision form still accepted");

    // S50 follow-up: asof in the FEATURE species — a historical keyframe that
    // matches the live constellation (feature nodes + meta-edges), not a
    // disjoint document graph, so the constellation can time-travel cheaply.
    let (status, hist) = http(
        port,
        "GET",
        &format!(
            "/graph/asof?scope={}&t={t}&granularity=feature",
            urlencode(&scope)
        ),
        &token,
        None,
    );
    assert_eq!(status, 200, "feature-granularity asof served: {hist}");
    let hnodes = hist["data"]["nodes"]
        .as_array()
        .expect("asof feature nodes");
    assert!(
        !hnodes.is_empty() && hnodes.iter().all(|n| n["kind"] == "feature"),
        "historical constellation is feature-species, matching live"
    );
    assert!(
        hist["data"]["meta_edges"].is_array(),
        "feature-granularity asof carries constellation meta-edges"
    );
    // S50 keyframe seq anchor: a historical (as_of) keyframe has NO live
    // position, so last_seq is null — the client knows not to resume a stream.
    assert!(
        hist["data"]["last_seq"].is_null(),
        "as_of keyframe carries last_seq: null (no live position): {hist}"
    );

    // --- S49 divergence 2: feature granularity synthesizes the convergence ---
    let (status, constellation) = http(
        port,
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

    // --- S50: the constellation rides the single monotonic delta clock --------
    // A LIVE feature keyframe anchors the stream: numeric last_seq = clock tip,
    // so a held constellation resumes from exactly here without refetching.
    assert!(
        constellation["data"]["last_seq"].as_u64().is_some(),
        "live feature keyframe carries a numeric last_seq: {constellation}"
    );
    // Document deltas (the default diff above) self-declare their species...
    assert!(
        diff["data"]["deltas"]
            .as_array()
            .is_some_and(|d| d.iter().all(|e| e["granularity"] == "document")),
        "document diff entries are tagged granularity=document: {diff}"
    );
    // ...and a feature-granularity diff projects the constellation delta on the
    // SAME wire shape, every entry tagged feature.
    let (status, fdiff) = http(
        port,
        "GET",
        &format!(
            "/graph/diff?scope={}&from=HEAD~1&to={t}&granularity=feature",
            urlencode(&scope)
        ),
        &token,
        None,
    );
    assert_eq!(status, 200, "feature-granularity diff served: {fdiff}");
    assert!(
        fdiff["data"]["deltas"]
            .as_array()
            .is_some_and(|d| d.iter().all(|e| e["granularity"] == "feature")),
        "every feature diff entry is tagged granularity=feature: {fdiff}"
    );

    // --- S49 divergence 3: contract §4 fields on list-shape nodes -------------
    let (status, docs) = http(
        port,
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
    // S50: a LIVE document keyframe also anchors the clock (numeric last_seq),
    // so both species resume on the single monotonic clock.
    assert!(
        docs["data"]["last_seq"].as_u64().is_some(),
        "live document keyframe carries a numeric last_seq too"
    );

    // --- S49 divergence 4: /status git block + /vault-tree dates/doc_type -----
    let (status, st) = http(port, "GET", "/status", &token, None);
    assert_eq!(status, 200);
    assert!(
        st["data"]["git"]["dirty"].is_boolean() && st["data"]["git"]["head_ref"].is_string(),
        "serve /status carries the git block (front-door parity)"
    );
    let (status, tree) = http(
        port,
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
        port,
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
    // Event id (the monotonic seq) tracks time order: a stream splicing by
    // `since=<id>` relies on it (sweep LOW, 2026-06-13 — ids were assigned from
    // newest-first walk order then re-sorted by ts, anti-correlating id and ts).
    let pairs: Vec<(u64, i64)> = raws
        .iter()
        .map(|e| {
            let id = e["id"].as_str().unwrap().strip_prefix("ev:").unwrap();
            (id.parse().unwrap(), e["ts"].as_i64().unwrap())
        })
        .collect();
    for w in pairs.windows(2) {
        assert!(
            w[0].0 < w[1].0 && w[0].1 <= w[1].1,
            "event id and ts both ascend together: {pairs:?}"
        );
    }
}

/// Error-surface conformance (adversarial findings, 2026-06-13): EVERY wire
/// error carries the tiers block — including framework-boundary rejections
/// that fire before any handler (defect 1) — and revision-parse errors never
/// leak build internals (defect 2).
#[test]
fn error_surface_carries_tiers_and_hides_internals() {
    let (_dir, root) = fixture();
    let (_guard, port, token) = start_serve(&root);
    let scope = root.to_string_lossy().replace('\\', "/");

    // Defect 1 — the tiers block rides framework-boundary errors:
    // malformed JSON body (Json extractor rejection) -> 400.
    let (status, body) = http(port, "POST", "/graph/query", &token, Some("{bad"));
    assert_eq!(status, 400, "malformed body: {body}");
    assert!(
        body["tiers"].is_object(),
        "malformed-body 400 carries tiers"
    );
    // missing required query param (Query extractor rejection) -> 400.
    let (status, body) = http(port, "GET", "/vault-tree", &token, None);
    assert_eq!(status, 400);
    assert!(body["tiers"].is_object(), "missing-param 400 carries tiers");
    // wrong method (router rejection) -> 405.
    let (status, body) = http(port, "GET", "/graph/query", &token, None);
    assert_eq!(status, 405);
    assert!(body["tiers"].is_object(), "405 carries tiers");
    // no/!bad auth (gate rejection) -> 401.
    let (status, body) = http(port, "GET", "/status", "", None);
    assert_eq!(status, 401);
    assert!(body["tiers"].is_object(), "401 carries tiers");

    // Defect 2 — an unparseable revision is sanitized, no build internals.
    let (status, body) = http(
        port,
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

    // Hardening (2026-06-13 adversarial findings): discover of an unknown node
    // is a truthful 404 (consistent with /nodes, /neighbors, /evidence), not a
    // rag-proxied 400 — and it still carries the tiers block.
    let (status, body) = http(port, "POST", "/nodes/doc:nope/discover", &token, Some("{}"));
    assert_eq!(status, 404, "discover unknown node -> 404, not 400: {body}");
    assert!(body["tiers"].is_object(), "discover 404 carries tiers");

    // Hardening: an absurd neighbor depth is clamped server-side (never an
    // unbounded whole-component dump) and equals the capped walk.
    let huge = http(
        port,
        "GET",
        "/nodes/doc:2026-06-13-conf-plan/neighbors?depth=999999",
        &token,
        None,
    );
    assert_eq!(huge.0, 200, "huge depth served (clamped), not an error");
    let capped = http(
        port,
        "GET",
        "/nodes/doc:2026-06-13-conf-plan/neighbors?depth=4",
        &token,
        None,
    );
    assert_eq!(
        huge.1["data"]["ego"], capped.1["data"]["ego"],
        "depth beyond the cap yields the same bounded ego as the cap"
    );
}

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
}
