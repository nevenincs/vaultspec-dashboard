//! Envelope-shape integration tests, one per verb (audit G8): the built
//! binary runs against a fixture workspace and every `--json` payload is
//! asserted to carry the contract envelope (ok/command/status/data/tiers).

use std::path::Path;
use std::process::Command;

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
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn fixture_workspace() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/main.rs"), "fn main() {}\n").unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-cli-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#cli'\n---\n\n\
         - [ ] `S01` - touch `src/main.rs`; see [[2026-06-12-cli-adr]]\n",
    )
    .unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);
    dir
}

fn run(dir: &Path, args: &[&str]) -> (i32, serde_json::Value) {
    let output = Command::new(env!("CARGO_BIN_EXE_vaultspec"))
        .current_dir(dir)
        .args(args)
        .arg("--json")
        .output()
        .expect("binary runs");
    let stdout = String::from_utf8_lossy(&output.stdout);
    let value = serde_json::from_str(&stdout)
        .unwrap_or_else(|e| panic!("non-JSON output for {args:?}: {e}\n{stdout}"));
    (output.status.code().unwrap_or(-1), value)
}

fn assert_envelope(value: &serde_json::Value, command: &str, ok: bool) {
    assert_eq!(value["ok"], ok, "{command}: ok flag");
    assert_eq!(value["command"], command, "{command}: command name");
    assert_eq!(
        value["status"],
        if ok { "success" } else { "failed" },
        "{command}: status vocabulary"
    );
    assert!(
        value["tiers"]["semantic"]["available"].is_boolean(),
        "{command}: tiers block on EVERY response (contract sec 2)"
    );
    if ok {
        assert!(!value["data"].is_null(), "{command}: data present");
    } else {
        assert!(value["error"].is_string(), "{command}: typed error kind");
    }
}

#[test]
fn every_verb_emits_the_contract_envelope() {
    let dir = fixture_workspace();
    let root = dir.path();

    let (code, map) = run(root, &["map"]);
    assert_eq!(code, 0);
    assert_envelope(&map, "map", true);
    assert!(map["data"]["corpus_views"].is_array(), "G3 corpus views");

    let (code, index) = run(root, &["index"]);
    assert_eq!(code, 0);
    assert_envelope(&index, "index", true);
    assert!(
        index["data"]["counts"]["updated"].is_number() && index["data"]["items"].is_array(),
        "G2 sync vocabulary on the mutating verb"
    );

    let (code, graph) = run(root, &["graph", "--granularity", "feature"]);
    assert_eq!(code, 0);
    assert_envelope(&graph, "graph", true);
    assert!(graph["data"]["meta_edges"].is_array(), "G4 constellation");

    let (code, node) = run(root, &["node", "doc:2026-06-12-cli-plan"]);
    assert_eq!(code, 0);
    assert_envelope(&node, "node", true);

    let (code, events) = run(root, &["events", "--bucket", "1d"]);
    assert_eq!(code, 0);
    assert_envelope(&events, "events", true);

    let (code, status) = run(root, &["status"]);
    assert_eq!(code, 0);
    assert_envelope(&status, "status", true);
    assert!(
        status["data"]["git"]["dirty"].is_boolean(),
        "G5 git datum in the status rollup"
    );
}

#[test]
fn scope_errors_are_typed_exit_2_with_tiers_on_the_failure() {
    let dir = fixture_workspace();
    // A directory that is not a git workspace at all.
    let stray = tempfile::tempdir().unwrap();

    let (code, value) = run(
        dir.path(),
        &["map", "--scope", &stray.path().to_string_lossy()],
    );
    assert_eq!(code, 2, "scope errors are usage-class");
    assert_envelope(&value, "map", false);
    assert_eq!(value["error"], "bad-scope");

    // A real workspace without a vault corpus: vault-needing verbs exit 2.
    git(stray.path(), &["init", "-b", "main", "."]);
    std::fs::write(stray.path().join("x.txt"), "x\n").unwrap();
    git(stray.path(), &["add", "."]);
    git(stray.path(), &["commit", "-m", "init"]);
    let (code, value) = run(
        dir.path(),
        &["index", "--scope", &stray.path().to_string_lossy()],
    );
    assert_eq!(code, 2);
    assert_eq!(value["error"], "no-vault");
    assert!(
        !value["message"]
            .as_str()
            .unwrap_or_default()
            .contains("\\\\?\\"),
        "no extended-length prefix leaks (rider)"
    );
}
