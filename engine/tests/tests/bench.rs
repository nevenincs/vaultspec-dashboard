//! Cold-index performance smoke benchmark (W03.P12.S55): a generated
//! corpus indexed cold, wall-clock recorded and printed so the baseline
//! lands in the step record; a generous ceiling guards regressions without
//! flaking on slow machines.

use std::path::Path;

use engine_model::ScopeRef;

const DOCS: usize = 200;
/// Generous ceiling: an order of magnitude above the observed baseline so
/// only a real regression (not machine noise) trips it.
const CEILING_MS: u128 = 30_000;

fn generate_corpus(root: &Path) {
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    for i in 0..20 {
        std::fs::write(
            root.join(format!("src/module_{i}.rs")),
            format!("pub fn function_{i}() {{}}\n"),
        )
        .unwrap();
    }
    for i in 0..DOCS {
        std::fs::write(
            root.join(format!(".vault/plan/2026-06-12-bench-{i:03}-plan.md")),
            format!(
                "---\ntags:\n  - '#plan'\n  - '#bench-{}'\n---\n\n\
                 - [ ] `S01` - touch `src/module_{}.rs` calling `function_{}()`;\n\
                   see [[2026-06-12-bench-{:03}-plan]] and `src/missing_{i}.rs`\n",
                i % 10,
                i % 20,
                i % 20,
                (i + 1) % DOCS,
            ),
        )
        .unwrap();
    }
}

#[test]
fn cold_index_baseline() {
    let dir = tempfile::tempdir().unwrap();
    generate_corpus(dir.path());
    let store = engine_store::Store::open_at(&dir.path().join("bench.sqlite3")).unwrap();
    let scope = ScopeRef::Worktree {
        path: dir.path().to_string_lossy().replace('\\', "/"),
    };

    let started = std::time::Instant::now();
    let (graph, stats) =
        engine_graph::index::index_worktree(dir.path(), &scope, &store, 0).unwrap();
    let cold_ms = started.elapsed().as_millis();

    let started = std::time::Instant::now();
    let (_, warm_stats) =
        engine_graph::index::index_worktree(dir.path(), &scope, &store, 0).unwrap();
    let warm_ms = started.elapsed().as_millis();

    // The recorded baseline (lands in the step record + phase summary).
    println!(
        "BENCH cold_index: docs={} nodes={} edges={} cold={}ms warm={}ms (cache_hits={})",
        stats.documents,
        graph.node_count(),
        graph.edge_count(),
        cold_ms,
        warm_ms,
        warm_stats.cache_hits,
    );

    assert_eq!(stats.documents, DOCS);
    assert_eq!(warm_stats.cache_hits, DOCS, "warm run is fully cached");
    assert!(
        cold_ms < CEILING_MS,
        "cold index regressed: {cold_ms}ms > {CEILING_MS}ms ceiling"
    );
    // Warm gets the same generous ceiling; a strict warm<=cold assertion
    // is load-sensitive (the two run within ~2% of each other because
    // resolution dominates and is uncached) and flakes under parallel
    // test machinery — the cache-hit assertion above is the real warmth
    // proof.
    assert!(
        warm_ms < CEILING_MS,
        "warm index regressed: {warm_ms}ms > {CEILING_MS}ms ceiling"
    );
}
