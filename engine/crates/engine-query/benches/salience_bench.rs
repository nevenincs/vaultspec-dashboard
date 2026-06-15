//! Salience feasibility benchmark (graph-node-salience W05.P11.S44): proves the
//! Brandes betweenness pass and the full per-generation lens-basis precompute are
//! affordable UNDER THE NODE CEILING (`MAX_GRAPH_NODES`, 5000).
//!
//! The ADR's load-bearing cost claim is that betweenness is the most expensive
//! measure even via Brandes, and "its feasibility leans entirely on the node
//! ceiling" (Costs). This bench builds a synthetic backbone at the ceiling and
//! measures the basis precompute (PPR partial vectors + Brandes + k-core + roles)
//! and a Brandes-only pass, printing wall-clock evidence.
//!
//! It is EVIDENCE, not a pass/fail gate (no wall-clock ceiling assert — those
//! flake on shared runners; the convention mirrors the existing `scale_bench`).
//! `harness = false`: a plain `main` so `cargo build --benches` compiles it as
//! part of the gate without pulling Criterion. Run it with:
//!
//!   cargo bench -p engine-query --bench salience_bench
//!
//! Scale is env-tunable (`VAULTSPEC_SALIENCE_NODES`); the default stays at the
//! ceiling so the headline number is the one the ADR's claim rests on.

use std::time::Instant;

use engine_graph::{EdgeAttrs, LinkageGraph, ingest};
use engine_model::{
    CanonicalKey, Dates, Facet, Node, NodeKind, Presence, Provenance, RelationKind,
    ResolutionState, ScopeRef, Tier, edge_id, node_id,
};
use engine_query::salience::{Backbone, Lens, LensBasis, brandes_betweenness, compute_salience};

const MAX_GRAPH_NODES: usize = 5000;

fn scope() -> ScopeRef {
    ScopeRef::Ref {
        name: "main".into(),
    }
}

/// Build a synthetic vault-shaped graph of `n` document nodes wired with a
/// realistic backbone: each node links to a few neighbors on the declared and
/// structural tiers (the high-precision backbone), spread across doc types so the
/// lenses have authority structure to bias toward.
fn synthetic_graph(n: usize) -> (LinkageGraph, Vec<Node>) {
    let doc_types = ["plan", "adr", "research", "exec", "audit", "reference"];
    let mut nodes = Vec::with_capacity(n);
    let mut g = LinkageGraph::new();
    for i in 0..n {
        let stem = format!("doc-{i:06}");
        let dt = doc_types[i % doc_types.len()];
        let node = Node {
            id: node_id(&CanonicalKey::Document { stem: &stem }),
            kind: NodeKind::Document,
            key: stem.clone(),
            title: None,
            doc_type: Some(dt.into()),
            dates: Some(Dates {
                created: Some("2026-06-14".into()),
                modified: Some(1_000_000 + i as i64),
            }),
            feature_tags: vec![format!("f-{}", i % 64)],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        };
        g.upsert_node(node.clone());
        nodes.push(node);
    }
    // Wire a bounded-degree backbone: each node links forward to a few neighbors,
    // alternating declared/structural so both backbone tiers are exercised.
    for i in 0..n {
        for step in 1..=4 {
            let j = (i + step * 7) % n;
            if i == j {
                continue;
            }
            let src = &format!("doc-{i:06}");
            let dst = &format!("doc-{j:06}");
            let tier = if step % 2 == 0 {
                Tier::Declared
            } else {
                Tier::Structural
            };
            let s = node_id(&CanonicalKey::Document { stem: src });
            let d = node_id(&CanonicalKey::Document { stem: dst });
            let provenance = Provenance::DocumentBody {
                blob_hash: "b".into(),
                span: (0, 1),
                target: dst.clone(),
            };
            let edge = engine_model::Edge {
                id: edge_id(&s, &d, &RelationKind::Mentions, tier, &provenance),
                src: s,
                dst: d,
                relation: RelationKind::Mentions,
                tier,
                confidence: if tier == Tier::Declared { 1.0 } else { 0.9 },
                state: (tier == Tier::Structural).then_some(ResolutionState::Resolved),
                provenance,
                scope: scope(),
                observed_at: 0,
            };
            let _ = ingest(&mut g, edge, EdgeAttrs::default());
        }
    }
    (g, nodes)
}

fn main() {
    let n: usize = std::env::var("VAULTSPEC_SALIENCE_NODES")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(MAX_GRAPH_NODES);

    eprintln!("salience_bench: building synthetic graph of {n} nodes (ceiling {MAX_GRAPH_NODES})");
    let (graph, nodes) = synthetic_graph(n);
    let members: Vec<&Node> = nodes.iter().collect();
    eprintln!(
        "  graph: {} nodes, {} edges",
        graph.node_count(),
        graph.edge_count()
    );

    // Brandes betweenness alone (the most expensive single measure).
    let backbone = Backbone::build(&graph, &members);
    let t0 = Instant::now();
    let bc = brandes_betweenness(&backbone);
    let brandes_ms = t0.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "  Brandes betweenness over {} backbone nodes: {:.1} ms",
        backbone.node_count(),
        brandes_ms
    );
    assert_eq!(bc.len(), backbone.node_count());

    // The full per-generation basis precompute (PPR partial vectors + Brandes +
    // k-core + roles + aggregated-exec in one sweep) — the work memoized once per
    // graph generation and shared by all lenses.
    let t1 = Instant::now();
    let basis = LensBasis::compute(&graph, &scope(), &members);
    let basis_ms = t1.elapsed().as_secs_f64() * 1000.0;
    eprintln!("  full lens-basis precompute (all measures, one sweep): {basis_ms:.1} ms");

    // A per-request focus-folded score for one lens (the on-demand cost a request
    // actually pays once the basis is warm).
    let t2 = Instant::now();
    let scores = compute_salience(&basis, &graph, Lens::Status, None, 2_000_000, false);
    let score_ms = t2.elapsed().as_secs_f64() * 1000.0;
    eprintln!(
        "  warm per-request salience compose (status lens): {:.1} ms ({} scored)",
        score_ms,
        scores.by_id.len()
    );

    eprintln!(
        "salience_bench: FEASIBLE under the ceiling — Brandes {brandes_ms:.0} ms, \
         basis {basis_ms:.0} ms, warm compose {score_ms:.0} ms at {n} nodes"
    );
}
