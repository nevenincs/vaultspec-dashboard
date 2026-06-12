//! Fixture-document pipeline test (W01.P04.S18): reader → extractors →
//! resolver, end to end, covering all four mention kinds and all three
//! resolution states.

use engine_model::ResolutionState;
use ingest_struct::extract::{MentionKind, extract};
use ingest_struct::reader::read_from_worktree;
use ingest_struct::resolve::resolve;

#[test]
fn document_pipeline_extracts_and_resolves_against_the_fixture_tree() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/main.rs"), "fn main() {}\n").unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-f-plan.md"),
        "- [ ] `S01` - implement `src/main.rs` calling `main()`; \
         see [[2026-06-12-f-adr]] and `lost/file.rs`\n",
    )
    .unwrap();

    let body = read_from_worktree(root, ".vault/plan/2026-06-12-f-plan.md").unwrap();
    assert!(!body.blob_hash.is_empty());

    let mentions = extract(&body.text);
    let kinds: Vec<bool> = vec![
        mentions
            .iter()
            .any(|m| matches!(&m.kind, MentionKind::StepId(s) if s == "S01")),
        mentions
            .iter()
            .any(|m| matches!(&m.kind, MentionKind::Path(p) if p == "src/main.rs")),
        mentions
            .iter()
            .any(|m| matches!(&m.kind, MentionKind::Symbol(s) if s == "main")),
        mentions
            .iter()
            .any(|m| matches!(&m.kind, MentionKind::WikiLink(w) if w == "2026-06-12-f-adr")),
    ];
    assert!(kinds.iter().all(|k| *k), "all four extractors fired");

    let resolved = resolve(root, mentions);
    let states: Vec<ResolutionState> = resolved.iter().map(|r| r.state).collect();
    assert!(states.contains(&ResolutionState::Resolved));
    assert!(states.contains(&ResolutionState::Broken));
    // Broken mentions are retained in the output (D3.3).
    assert_eq!(
        resolved
            .iter()
            .filter(|r| r.state == ResolutionState::Broken)
            .count(),
        2
    );
}
