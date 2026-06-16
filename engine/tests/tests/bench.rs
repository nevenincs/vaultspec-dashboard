//! Cold-index performance smoke benchmark (W03.P12.S55): a generated
//! corpus indexed cold, wall-clock recorded and printed so the baseline
//! lands in the step record; a generous ceiling guards regressions without
//! flaking on slow machines.

use std::path::Path;

use engine_model::{NodeKind, ScopeRef};

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
    let (warm_graph, warm_stats) =
        engine_graph::index::index_worktree(dir.path(), &scope, &store, 0).unwrap();
    let warm_ms = started.elapsed().as_millis();

    // Code-artifact node minting (code-artifact-nodes ADR D5/D6, W05.P14.S64):
    // each doc mentions `src/module_{i%20}.rs` (a RESOLVED Path — the file
    // exists, so it mints) and `src/missing_{i}.rs` (a BROKEN Path — no file, so
    // it mints NOTHING per D1). The 20 distinct resolved paths dedup across the
    // 200 mentioning docs to exactly 20 code nodes (idempotent upsert by id, D3).
    let code_nodes = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .count();

    // The recorded baseline (lands in the step record + phase summary).
    println!(
        "BENCH cold_index: docs={} nodes={} code_nodes={} edges={} cold={}ms warm={}ms (cache_hits={})",
        stats.documents,
        graph.node_count(),
        code_nodes,
        graph.edge_count(),
        cold_ms,
        warm_ms,
        warm_stats.cache_hits,
    );

    assert_eq!(stats.documents, DOCS);
    assert_eq!(warm_stats.cache_hits, DOCS, "warm run is fully cached");

    // The added Pass-2 upserts landed: exactly the 20 distinct resolved module
    // paths, deduplicated across the 200 docs that mention them — broken
    // `src/missing_*.rs` targets fabricate no node (code-artifact-nodes ADR D1).
    assert_eq!(
        code_nodes, 20,
        "20 distinct resolved Path mentions mint 20 deduplicated code nodes; \
         200 broken targets mint none (ADR D1)"
    );
    // Re-derivability (ADR D3/D5): the warm re-index converges to the identical
    // code-node set — idempotent upsert by id re-keys nothing.
    assert_eq!(
        warm_graph
            .nodes()
            .filter(|n| n.kind == NodeKind::CodeArtifact)
            .count(),
        code_nodes,
        "re-index converges to the identical code-node set (idempotent upsert)"
    );
    // Wall-clock ceilings are STRICT-MODE only (audit backlog item): on
    // shared CI runners and under parallel test load they flake without
    // signalling a real regression. The default suite keeps the
    // deterministic assertions (doc counts, cache hits) and the printed
    // baseline; `just dev test bench` sets the flag for the gated run.
    // (A strict warm<=cold ordering is load-sensitive either way — the
    // cache-hit assertion above is the real warmth proof.)
    if std::env::var("VAULTSPEC_BENCH_STRICT").as_deref() == Ok("1") {
        assert!(
            cold_ms < CEILING_MS,
            "cold index regressed: {cold_ms}ms > {CEILING_MS}ms ceiling"
        );
        assert!(
            warm_ms < CEILING_MS,
            "warm index regressed: {warm_ms}ms > {CEILING_MS}ms ceiling"
        );
    } else {
        eprintln!("bench ceilings advisory (set VAULTSPEC_BENCH_STRICT=1 to enforce)");
    }
}
