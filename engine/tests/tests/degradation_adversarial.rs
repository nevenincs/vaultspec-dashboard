//! Adversarial degradation tests (engine-hardening P03.S06, ADR D4):
//! assert the engine's tiers block truthfully reflects each backend-outage
//! failure mode — closing the gap between the
//! `every-wire-response-carries-the-tiers-block` rule and its enforcement.
//!
//! Three scenarios, each with its own `ServeGuard` and fixture:
//! (a) rag unreachable (no service.json) → `tiers.semantic.available == false`
//! (b) core unreachable (no binary on PATH) → `tiers.declared.available == false`
//! (c) any serve → all four canonical tier keys present on every endpoint

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::Duration;

// ─── Shared helpers (duplicated from conformance.rs; integration tests in
// Rust cannot share code across files without an extra crate) ─────────────────

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

/// Minimal two-commit vault fixture — enough surface for every contract
/// capability, matching the shape used in conformance.rs.
fn fixture() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    git(&root, &["config", "core.autocrlf", "false"]);
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::write(
        root.join(".vault/adr/2026-06-13-degrade-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#degrade'\ndate: '2026-06-13'\n---\n\n\
         # degrade adr\n\nAdversarial fixture.\n",
    )
    .unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "T1: adr"]);
    std::fs::write(
        root.join(".vault/adr/2026-06-13-degrade-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#degrade'\ndate: '2026-06-13'\n---\n\n\
         # degrade adr\n\nUpdated.\n",
    )
    .unwrap();
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "T2: update"]);
    (dir, root)
}

struct ServeGuard(Child);
impl Drop for ServeGuard {
    fn drop(&mut self) {
        let _ = self.0.kill();
    }
}

/// Start `vaultspec serve --port 0` with optional env overrides.
///
/// `env_overrides` is a slice of `(key, value)` pairs set on the child
/// process.  Overriding `HOME`/`USERPROFILE` to an empty temp dir prevents
/// the rag client's home-dir `service.json` candidate from being discovered,
/// isolating the serve to the fixture's vault root only.
fn start_serve_env(root: &Path, env_overrides: &[(&str, &Path)]) -> (ServeGuard, u16, String) {
    let mut cmd = Command::new(binary());
    cmd.current_dir(root).args(["serve", "--port", "0"]);
    for (key, value) in env_overrides {
        cmd.env(key, value);
    }
    let child = cmd.spawn().expect("serve starts");
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
            return (guard, port as u16, token.to_string());
        }
        assert!(
            std::time::Instant::now() < deadline,
            "serve never came up (service.json missing or port=0)"
        );
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn start_serve(root: &Path) -> (ServeGuard, u16, String) {
    start_serve_env(root, &[])
}

fn http(
    port: u16,
    method: &str,
    path: &str,
    token: &str,
    body: Option<&str>,
) -> (u16, serde_json::Value) {
    use std::io::{Read, Write};
    let mut stream = std::net::TcpStream::connect(("127.0.0.1", port)).expect("connect to serve");
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
        .expect("status code");
    (
        status,
        serde_json::from_str(payload).unwrap_or(serde_json::Value::Null),
    )
}

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
}

const CANONICAL_TIERS: &[&str] = &["declared", "structural", "temporal", "semantic"];

/// Assert all four canonical tier keys are present in `tiers`.
fn assert_all_tiers_present(tiers: &serde_json::Value, context: &str) {
    let obj = tiers
        .as_object()
        .unwrap_or_else(|| panic!("{context}: tiers is not an object"));
    for key in CANONICAL_TIERS {
        assert!(
            obj.contains_key(*key),
            "{context}: canonical tier `{key}` missing from tiers block"
        );
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

/// (a) Rag unreachable → `tiers.semantic.available == false`.
///
/// No rag service.json is created in the fixture; HOME/USERPROFILE are
/// redirected to an empty temp dir so the rag client's home-dir candidate
/// (`~/.vaultspec-rag/service.json`) is not found either.  The engine must
/// truthfully report `semantic: {available: false}` rather than claiming a
/// tier it could not use (every-wire-response-carries-the-tiers-block).
#[test]
fn rag_unreachable_degrades_semantic_tier() {
    // Isolate home dir so neither vault-local NOR home-dir service.json is
    // found.  Without this, a running rag on the developer's machine would
    // make the test pass for the wrong reason (or false-positive on CI).
    let empty_home = tempfile::tempdir().unwrap();
    let (_dir, root) = fixture();
    let overrides: &[(&str, &Path)] = &[
        ("HOME", empty_home.path()),
        ("USERPROFILE", empty_home.path()),
    ];
    let (_guard, port, token) = start_serve_env(&root, overrides);
    let scope = urlencode(&root.to_string_lossy().replace('\\', "/"));

    // /status carries the degraded semantic tier.
    let (status, body) = http(port, "GET", "/status", &token, None);
    assert_eq!(status, 200);
    let tiers = &body["tiers"];
    assert_all_tiers_present(tiers, "/status");
    assert_eq!(
        tiers["semantic"]["available"].as_bool(),
        Some(false),
        "/status: semantic tier must be available:false when rag has no service.json"
    );

    // /map also carries the degraded semantic tier (all routes use the same
    // envelope helper — the rule applies universally).
    let (map_status, map_body) = http(port, "GET", "/map", &token, None);
    assert_eq!(map_status, 200);
    assert_all_tiers_present(&map_body["tiers"], "/map");
    assert_eq!(
        map_body["tiers"]["semantic"]["available"].as_bool(),
        Some(false),
        "/map: semantic tier must be available:false when rag has no service.json"
    );

    // A 4xx error response also carries tiers (the rule is on errors too).
    let (err_status, err_body) = http(
        port,
        "GET",
        &format!("/graph/query?scope={scope}&granularity=document"),
        &token,
        None,
    );
    // A valid scope with a live corpus returns 200; what matters is tiers present.
    // Even if this is a 4xx, tiers must be there.
    assert!(err_status == 200 || err_status >= 400);
    assert_all_tiers_present(&err_body["tiers"], "/graph/query");
}

/// (b) Core unreachable → `tiers.declared.available == false`.
///
/// Serve is started with PATH set to an empty directory so neither
/// `vaultspec-core` nor `uv` can be found during the initial synchronous
/// rebuild (lib.rs:198 `state.rebuild_and_swap()`).  By the time
/// `service.json` is written, `declared_status` is already set.
///
/// gix is pure Rust (no `git` binary calls), so the serve itself functions;
/// only core ingestion fails, which is the failure mode under test.
#[test]
fn core_unreachable_degrades_declared_tier() {
    let empty = tempfile::tempdir().unwrap();
    let (_dir, root) = fixture();
    // PATH points to an empty directory — vaultspec-core and uv are not found.
    let overrides: &[(&str, &Path)] = &[("PATH", empty.path())];
    let (_guard, port, token) = start_serve_env(&root, overrides);

    // By the time service.json is ready, the synchronous initial rebuild has
    // completed with core unavailable → declared_status reflects the outage.
    let (status, body) = http(port, "GET", "/status", &token, None);
    assert_eq!(
        status, 200,
        "/status must return 200 even when core is down"
    );
    let tiers = &body["tiers"];
    assert_all_tiers_present(tiers, "/status (core unavailable)");
    assert_eq!(
        tiers["declared"]["available"].as_bool(),
        Some(false),
        "declared tier must be available:false when core binary is not on PATH"
    );
}

/// (c) Every response — success AND error, multiple endpoints — carries all
/// four canonical tier keys.
///
/// This is the structural completeness assertion for the
/// `every-wire-response-carries-the-tiers-block` rule: the guarantee is not
/// just "tiers present on happy paths" but on every routed response.
#[test]
fn all_four_canonical_tiers_present_on_every_response() {
    let (_dir, root) = fixture();
    let (_guard, port, token) = start_serve(&root);
    let scope = urlencode(&root.to_string_lossy().replace('\\', "/"));

    let endpoints: &[(&str, &str, Option<&str>)] = &[
        ("GET", "/status", None),
        ("GET", "/map", None),
        (
            "GET",
            &format!("/graph/query?scope={scope}&granularity=feature"),
            None,
        ),
        // Unknown scope → 4xx; tiers must still be present.
        ("GET", "/graph/query?scope=NONEXISTENT_SCOPE_XYZ_ADV", None),
    ];

    for (method, path, body) in endpoints {
        let (status, resp) = http(port, method, path, &token, *body);
        assert!(status > 0, "endpoint {method} {path} returned no status");
        assert_all_tiers_present(
            &resp["tiers"],
            &format!("{method} {path} (status {status})"),
        );
    }
}
