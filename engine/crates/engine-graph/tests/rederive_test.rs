//! Re-derivability (ADR D8.2, W02.P06.S29): a full index from a **deleted
//! cache** must converge to the identical graph — persistence is cache,
//! never truth. Byte-equal under canonical serialization.

use engine_graph::index::{canonical_snapshot, index_worktree};
use engine_model::ScopeRef;

fn fixture_vault(root: &std::path::Path) {
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    std::fs::write(root.join("src/main.rs"), "fn main() {}\n").unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-f-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#demo-feature'\n---\n\n# plan\n\n\
         - [ ] `S01` - implement `src/main.rs`; see [[2026-06-12-f-adr]]\n",
    )
    .unwrap();
    std::fs::write(
        root.join(".vault/adr/2026-06-12-f-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#demo-feature'\n---\n\n# adr\n\n\
         Decision touches `src/main.rs` and `gone/lost.rs`.\n",
    )
    .unwrap();
}

#[test]
fn full_index_from_deleted_cache_converges_to_the_identical_graph() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    fixture_vault(root);
    let scope = ScopeRef::Worktree {
        path: "fixture".into(),
    };
    let db = root.join("engine.sqlite3");

    // Cold index, populating the cache.
    let store = engine_store::Store::open_at(&db).unwrap();
    let (graph_a, stats_a) = index_worktree(root, &scope, &store, 0).unwrap();
    assert!(stats_a.extracted > 0, "cold run extracts");
    assert_eq!(stats_a.cache_hits, 0);
    let snapshot_a = canonical_snapshot(&graph_a);
    drop(store);

    // Warm re-index: cache hits, same graph.
    let store = engine_store::Store::open_at(&db).unwrap();
    let (graph_b, stats_b) = index_worktree(root, &scope, &store, 99).unwrap();
    assert_eq!(stats_b.cache_hits, stats_a.documents, "warm run skips");
    drop(store);

    // DELETE the cache entirely; re-derive from truth (core + git + fs).
    std::fs::remove_file(&db).unwrap();
    let store = engine_store::Store::open_at(&db).unwrap();
    let (graph_c, stats_c) = index_worktree(root, &scope, &store, 0).unwrap();
    assert_eq!(stats_c.cache_hits, 0, "cache was gone");

    // D8.2: identical graph, byte-equal under canonical serialization.
    assert_eq!(snapshot_a, canonical_snapshot(&graph_c));

    // Incremental-vs-cold convergence (audit W02P05-202): re-ingesting the
    // same documents INTO the already-populated graph must be idempotent —
    // the maintained graph converges to the cold rebuild, never inflates.
    let mut graph_incremental = graph_c;
    engine_graph::index::index_worktree_into(&mut graph_incremental, root, &scope, &store, 0)
        .unwrap();
    engine_graph::index::index_worktree_into(&mut graph_incremental, root, &scope, &store, 0)
        .unwrap();
    assert_eq!(
        snapshot_a,
        canonical_snapshot(&graph_incremental),
        "double re-ingestion converges to the cold rebuild"
    );

    // Warm graph differs only in observed_at, never in identity/topology:
    // node and edge ids are stable across runs (contract sec 2).
    let ids = |snap: &str| {
        snap.lines()
            .filter(|l| l.contains("\"id\""))
            .map(str::to_string)
            .collect::<Vec<_>>()
    };
    assert_eq!(ids(&snapshot_a), ids(&canonical_snapshot(&graph_b)));
}
