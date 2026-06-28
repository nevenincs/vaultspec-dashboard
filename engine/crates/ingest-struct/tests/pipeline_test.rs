//! Fixture-document pipeline test (W01.P04.S18): reader -> extractor, covering
//! the structural mention KINDS the body extractor recognizes.
//!
//! Mention RESOLUTION (and the structural body-mention graph edges it fed) was
//! retired under the strict reference-only ruling (2026-06-28): only `related:`
//! frontmatter defines the node graph. The body extractor is retained as the
//! incremental-index change-detection telemetry source, so this test still
//! exercises reader -> extract.

use ingest_struct::extract::{MentionKind, extract};
use ingest_struct::reader::read_from_worktree;

#[test]
fn document_pipeline_extracts_mention_kinds_from_the_body() {
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
            .any(|m| matches!(&m.kind, MentionKind::WikiLink(w) if w == "2026-06-12-f-adr")),
    ];
    assert!(kinds.iter().all(|k| *k), "structural extractors fired");
    assert_eq!(mentions.len(), 2, "code paths and symbols are prose only");
}
