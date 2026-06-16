//! Scale + adversarial-load benchmark for the graph QUERY-SERVE path — the
//! surface the GUI hammers, distinct from the cold-index smoke in `bench.rs`.
//!
//! It generates a corpus at a tunable scale, indexes it once, then measures
//! what a request actually costs: `graph_query` at both granularities, the
//! JSON serialization of the slice, and the resulting payload size — plus a
//! concurrent pass (N threads × M queries against one shared graph) to surface
//! read contention and per-request allocation churn. Scale is env-tunable so
//! the default stays fast; large runs ("make it break") are opt-in:
//!
//!   VAULTSPEC_SCALE_DOCS=20000 cargo test -p ... --test scale_bench -- --nocapture
//!
//! Findings land in the perf research doc; this is the evidence base, not a
//! pass/fail gate (no wall-clock ceiling — those flake on shared runners).

use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use engine_model::{NodeKind, ScopeRef};
use engine_query::filter::Filter;
use engine_query::graph::{Granularity, graph_query};

fn generate_corpus(root: &Path, docs: usize, features: usize) {
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join("src")).unwrap();
    let modules = (docs / 20).max(1);
    for i in 0..modules {
        std::fs::write(
            root.join(format!("src/module_{i}.rs")),
            format!("pub fn function_{i}() {{}}\n"),
        )
        .unwrap();
    }
    for i in 0..docs {
        let feat = i % features;
        let link = (i + 1) % docs;
        let m = i % modules;
        std::fs::write(
            root.join(format!(".vault/plan/2026-06-12-scale-{i:06}-plan.md")),
            format!(
                "---\ntags:\n  - '#plan'\n  - '#scale-{feat}'\n---\n\n\
                 - [ ] `S01` - touch `src/module_{m}.rs` calling `function_{m}()`; \
                 see [[2026-06-12-scale-{link:06}-plan]]\n",
            ),
        )
        .unwrap();
    }
}

fn env_usize(key: &str, default: usize) -> usize {
    std::env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

#[test]
#[ignore = "scale benchmark: run explicitly with --ignored --nocapture (heavy index)"]
fn graph_query_scale_and_concurrency() {
    let docs = env_usize("VAULTSPEC_SCALE_DOCS", 500);
    let features = env_usize("VAULTSPEC_SCALE_FEATURES", (docs / 50).max(2));
    let threads = env_usize("VAULTSPEC_SCALE_THREADS", 16);
    let per = env_usize("VAULTSPEC_SCALE_PER_THREAD", 8);

    let dir = tempfile::tempdir().unwrap();
    generate_corpus(dir.path(), docs, features);
    // The distinct `src/module_*.rs` files the corpus mints (mirrors
    // `generate_corpus`) — the count of code-artifact nodes expected after index.
    let modules = (docs / 20).max(1);
    let store = engine_store::Store::open_at(&dir.path().join("scale.sqlite3")).unwrap();
    let scope = ScopeRef::Worktree {
        path: dir.path().to_string_lossy().replace('\\', "/"),
    };

    let t = Instant::now();
    let (graph, stats) =
        engine_graph::index::index_worktree(dir.path(), &scope, &store, 0).unwrap();
    let index_ms = t.elapsed().as_millis();

    // Cold-index code-node profile (code-artifact-nodes ADR D5/D6, W05.P14.S64):
    // the corpus generates `modules` distinct `src/module_*.rs` files, each a
    // RESOLVED Path mention deduplicated across its mentioning docs. Minting is a
    // cheap idempotent `upsert_node` per resolved Path/Symbol mention in the
    // existing serial Pass 2 — bounded by the (already-resolved) mention count,
    // so it adds NO super-linear term and leaves the linear cold-index profile
    // intact. The printed `index={}ms` against the rising `code_nodes` count is
    // the evidence (no wall-clock ceiling — benches are `#[ignore]`d, not gated).
    let code_nodes = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .count();
    assert_eq!(
        code_nodes, modules,
        "the {modules} distinct resolved module paths each mint exactly one \
         deduplicated code node (idempotent upsert by id)"
    );

    let graph = Arc::new(graph);

    // Document granularity: one full slice — query build, then serialize.
    let t = Instant::now();
    let doc_slice = graph_query(&graph, &scope, Filter::default(), Granularity::Document).unwrap();
    let doc_query_us = t.elapsed().as_micros();
    let t = Instant::now();
    let doc_json = serde_json::to_vec(&doc_slice).unwrap();
    let doc_ser_us = t.elapsed().as_micros();

    // Feature granularity (constellation LOD): the bounded projection.
    let t = Instant::now();
    let feat_slice = graph_query(&graph, &scope, Filter::default(), Granularity::Feature).unwrap();
    let feat_query_us = t.elapsed().as_micros();
    let feat_json = serde_json::to_vec(&feat_slice).unwrap();

    // Concurrent read load against one shared immutable graph.
    let t = Instant::now();
    std::thread::scope(|s| {
        for _ in 0..threads {
            let g = Arc::clone(&graph);
            let sc = scope.clone();
            s.spawn(move || {
                for _ in 0..per {
                    let slice =
                        graph_query(&g, &sc, Filter::default(), Granularity::Document).unwrap();
                    let _ = serde_json::to_vec(&slice).unwrap();
                }
            });
        }
    });
    let concurrent_ms = t.elapsed().as_millis();

    // Concurrent FEATURE (constellation LOD) load — exercises the memoized
    // meta_edges (perf ADR D3): the O(E·tags²) projection computes once and
    // every concurrent reader shares it instead of recomputing per query.
    let t = Instant::now();
    std::thread::scope(|s| {
        for _ in 0..threads {
            let g = Arc::clone(&graph);
            let sc = scope.clone();
            s.spawn(move || {
                for _ in 0..per {
                    let slice =
                        graph_query(&g, &sc, Filter::default(), Granularity::Feature).unwrap();
                    let _ = serde_json::to_vec(&slice).unwrap();
                }
            });
        }
    });
    let concurrent_feat_ms = t.elapsed().as_millis();

    // Concurrent DOCUMENT load reusing the per-generation enriched views
    // (perf-sweep A1): build_document_views runs the node_view/edge_view
    // projections ONCE; every concurrent reader reuses them via
    // graph_query_cached instead of recomputing the whole slice per query — the
    // same memoization the API layer's per-generation cache provides.
    let views = engine_query::graph::build_document_views(&graph, &scope);
    let t = Instant::now();
    std::thread::scope(|s| {
        let views = &views;
        for _ in 0..threads {
            let g = Arc::clone(&graph);
            let sc = scope.clone();
            s.spawn(move || {
                for _ in 0..per {
                    let slice = engine_query::graph::graph_query_cached(
                        &g,
                        &sc,
                        Filter::default(),
                        Granularity::Document,
                        &views.0,
                        &views.1,
                    )
                    .unwrap();
                    let _ = serde_json::to_vec(&slice).unwrap();
                }
            });
        }
    });
    let concurrent_doc_cached_ms = t.elapsed().as_millis();
    println!(
        "SCALE-A1 docs={} threads={}x{} | CONCURRENT doc uncached={}ms cached={}ms",
        stats.documents, threads, per, concurrent_ms, concurrent_doc_cached_ms
    );

    println!(
        "SCALE docs={} nodes={} code_nodes={} edges={} index={}ms \
         | DOC query={}us ser={}us bytes={} \
         | FEAT nodes={} meta_edges={} query={}us bytes={} \
         | CONCURRENT doc {}x{}={}ms feat={}ms ({} queries each)",
        stats.documents,
        graph.node_count(),
        code_nodes,
        graph.edge_count(),
        index_ms,
        doc_query_us,
        doc_ser_us,
        doc_json.len(),
        feat_slice.nodes.len(),
        feat_slice.meta_edges.len(),
        feat_query_us,
        feat_json.len(),
        threads,
        per,
        concurrent_ms,
        concurrent_feat_ms,
        threads * per,
    );
}
