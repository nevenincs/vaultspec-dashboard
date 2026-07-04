//! Query-time projections (engine-spec §4.3): per-tier degree counts,
//! lifecycle/progress summaries, and feature-level meta-edge aggregation
//! (contract §4). Projections are derived at query time from the in-memory
//! graph and facets — never stored node fields.

use std::collections::BTreeMap;

use engine_model::{Lifecycle, Node, NodeId, ScopeRef, Tier};
use serde::Serialize;

use crate::graph::LinkageGraph;

/// Per-tier degree counts for a node (contract §4 `degree_by_tier`).
pub fn degree_by_tier(graph: &LinkageGraph, id: &NodeId) -> BTreeMap<&'static str, usize> {
    let mut counts: BTreeMap<&'static str, usize> = BTreeMap::new();
    for tier in [Tier::Declared, Tier::Structural, Tier::Temporal] {
        counts.insert(tier.as_str(), 0);
    }
    for stored in graph.edges_of(id) {
        *counts.entry(stored.edge.tier.as_str()).or_default() += 1;
    }
    counts
}

/// Lifecycle summary for a node in one scope — straight from the facet,
/// at query time.
pub fn lifecycle_in_scope<'a>(node: &'a Node, scope: &ScopeRef) -> Option<&'a Lifecycle> {
    node.facets
        .iter()
        .find(|f| &f.scope == scope)
        .and_then(|f| f.lifecycle.as_ref())
}

/// A feature↔feature meta-edge (contract §4 constellation granularity):
/// engine-aggregated from underlying document-level edges; the GUI never
/// flattens doc-level edges client-side.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MetaEdge {
    /// Feature NODE id (`feature:{tag}`) — meta-edges address the
    /// synthesized constellation nodes, not bare tags (addendum S02).
    pub src: String,
    /// Feature NODE id (`feature:{tag}`).
    pub dst: String,
    pub src_feature: String,
    pub dst_feature: String,
    pub count: usize,
    pub breakdown_by_tier: BTreeMap<&'static str, usize>,
}

/// Aggregate document-level edges into feature-level meta-edges. Edges
/// whose endpoints share no feature or live in the same feature do not
/// produce meta-edges (intra-feature structure arrives on descent).
/// Aggregation accumulator: (count, per-tier breakdown).
type MetaAgg = (usize, BTreeMap<&'static str, usize>);

/// Cross-feature meta-edges for the graph. Memoized on the immutable graph
/// generation (perf ADR D3): the O(E · feature_tags²) aggregation runs once per
/// graph instance and every caller (the feature query, the route, the bench)
/// shares it; a fresh graph (each commit rebuilds one) starts with an empty
/// cache, and any structural mutation invalidates it. Returns an owned clone of
/// the cached projection (small — bounded by feature pairs).
pub fn meta_edges(graph: &LinkageGraph) -> Vec<MetaEdge> {
    graph.meta_edges_cached().to_vec()
}

/// The uncached aggregation. Call sites go through `meta_edges` /
/// `LinkageGraph::meta_edges_cached`; this is the one that does the work.
pub(crate) fn compute_meta_edges(graph: &LinkageGraph) -> Vec<MetaEdge> {
    let mut agg: BTreeMap<(String, String), MetaAgg> = BTreeMap::new();
    for stored in graph.edges() {
        let Some(src_node) = graph.node(&stored.edge.src) else {
            continue;
        };
        let Some(dst_node) = graph.node(&stored.edge.dst) else {
            continue;
        };
        for src_feature in &src_node.feature_tags {
            for dst_feature in &dst_node.feature_tags {
                if src_feature == dst_feature {
                    continue;
                }
                // A constellation ribbon is UNDIRECTED: a reference A->B and a
                // reference B->A describe the same feature-pair relationship, so
                // they aggregate into ONE meta-edge. Keying on the directed
                // (src, dst) pair emitted two meta-edges per bidirectional pair,
                // which the client (synthesizing distinct ids from the endpoint
                // pair) rendered as two parallel ribbons over the same nodes —
                // graph edge over-draw. Canonicalize to the unordered (lo, hi)
                // pair so both directions sum into one ribbon with the combined
                // count and tier breakdown.
                let (lo, hi) = if src_feature <= dst_feature {
                    (src_feature, dst_feature)
                } else {
                    (dst_feature, src_feature)
                };
                let entry = agg.entry((lo.clone(), hi.clone())).or_default();
                entry.0 += 1;
                *entry.1.entry(stored.edge.tier.as_str()).or_default() += 1;
            }
        }
    }
    agg.into_iter()
        .map(
            |((src_feature, dst_feature), (count, breakdown_by_tier))| MetaEdge {
                src: NodeId::derive(&engine_model::NodeKind::Feature, &src_feature).0,
                dst: NodeId::derive(&engine_model::NodeKind::Feature, &dst_feature).0,
                src_feature,
                dst_feature,
                count,
                breakdown_by_tier,
            },
        )
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edges::ingest_test_helpers::declared_edge;
    use crate::graph::EdgeAttrs;
    use engine_model::{CanonicalKey, Facet, NodeKind, Presence, node_id};

    fn node(stem: &str, feature: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![feature.into()],
            status: None,
            tier: None,
            size: None,
            facets: vec![Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    #[test]
    fn meta_edges_aggregate_cross_feature_doc_edges_with_tier_breakdown() {
        let mut g = LinkageGraph::new();
        g.upsert_node(node("a-plan", "feature-a"));
        g.upsert_node(node("a-adr", "feature-a"));
        g.upsert_node(node("b-adr", "feature-b"));
        crate::edges::ingest(
            &mut g,
            declared_edge("a-plan", "b-adr", 1),
            EdgeAttrs::default(),
        )
        .unwrap();
        crate::edges::ingest(
            &mut g,
            declared_edge("a-adr", "b-adr", 2),
            EdgeAttrs::default(),
        )
        .unwrap();
        // Intra-feature edge: no meta-edge.
        crate::edges::ingest(
            &mut g,
            declared_edge("a-plan", "a-adr", 3),
            EdgeAttrs::default(),
        )
        .unwrap();

        let metas = meta_edges(&g);
        assert_eq!(metas.len(), 1);
        let m = &metas[0];
        assert_eq!(
            (m.src_feature.as_str(), m.dst_feature.as_str(), m.count),
            ("feature-a", "feature-b", 2)
        );
        assert_eq!(m.breakdown_by_tier["declared"], 2);
    }

    #[test]
    fn meta_edges_cache_invalidates_on_mutation() {
        // Perf ADR D3 / the riskiest part of the memoization: a projection
        // cached on the graph generation MUST NOT survive a structural mutation,
        // or the incremental re-index path (`index_worktree_into` mutates an
        // existing graph) would serve a stale constellation.
        let mut g = LinkageGraph::new();
        g.upsert_node(node("a-plan", "feature-a"));
        g.upsert_node(node("b-adr", "feature-b"));
        crate::edges::ingest(
            &mut g,
            declared_edge("a-plan", "b-adr", 1),
            EdgeAttrs::default(),
        )
        .unwrap();
        // Prime the cache: one cross-feature meta-edge (a -> b).
        assert_eq!(meta_edges(&g).len(), 1, "primed projection");

        // Mutate AFTER caching: a new node + a new cross-feature edge.
        g.upsert_node(node("c-ref", "feature-c"));
        crate::edges::ingest(
            &mut g,
            declared_edge("a-plan", "c-ref", 2),
            EdgeAttrs::default(),
        )
        .unwrap();

        // The cache must have invalidated — a stale read would still say 1.
        assert_eq!(
            meta_edges(&g).len(),
            2,
            "mutation invalidated the cache; a stale projection would miss a->c"
        );
    }

    #[test]
    fn degree_by_tier_is_zero_filled_for_all_three_graph_tiers() {
        let mut g = LinkageGraph::new();
        g.upsert_node(node("a-plan", "feature-a"));
        g.upsert_node(node("b-adr", "feature-b"));
        crate::edges::ingest(
            &mut g,
            declared_edge("a-plan", "b-adr", 1),
            EdgeAttrs::default(),
        )
        .unwrap();
        let counts = degree_by_tier(&g, &node_id(&CanonicalKey::Document { stem: "a-plan" }));
        // Three graph tiers: semantic is never a graph tier (D3.5), so the map
        // has exactly these three keys.
        assert_eq!(counts.len(), 3, "exactly three graph tiers, no semantic");
        assert_eq!(counts["declared"], 1);
        assert_eq!(counts["structural"], 0);
        assert_eq!(counts["temporal"], 0);
        assert!(
            !counts.contains_key("semantic"),
            "semantic is not a graph tier"
        );
    }
}
