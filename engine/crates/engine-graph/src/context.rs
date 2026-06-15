//! Context assembly (engine-spec §4.3, D4.4): `context(node)` returns
//! everything relevant to a node as one tier-labelled, serializable bundle.
//!
//! This function is the orchestration-era contract: it must remain a
//! **pure, serializable read** so it can later feed agent dispatch
//! unchanged. No I/O, no mutation, no hidden state — graph in, bundle out.

use std::collections::BTreeMap;

use engine_model::{Edge, Node, NodeId};
use serde::Serialize;

use crate::graph::LinkageGraph;
use crate::project::degree_by_tier;

/// The tier-labelled context bundle for one node.
#[derive(Debug, Clone, Serialize)]
pub struct ContextBundle {
    pub node: Node,
    /// Edges touching the node, grouped by tier wire name.
    pub edges_by_tier: BTreeMap<&'static str, Vec<Edge>>,
    /// Distinct neighbor node ids (either direction).
    pub neighbors: Vec<NodeId>,
    /// Query-time degree projection (contract §4).
    pub degree_by_tier: BTreeMap<&'static str, usize>,
}

/// Assemble the full context for `id`. Returns `None` for unknown nodes —
/// an absent node is a truthful answer, not an error.
pub fn context(graph: &LinkageGraph, id: &NodeId) -> Option<ContextBundle> {
    let node = graph.node(id)?.clone();
    let mut edges_by_tier: BTreeMap<&'static str, Vec<Edge>> = BTreeMap::new();
    let mut neighbors: Vec<NodeId> = Vec::new();
    for stored in graph.edges_of(id) {
        edges_by_tier
            .entry(stored.edge.tier.as_str())
            .or_default()
            .push(stored.edge.clone());
        let other = if &stored.edge.src == id {
            stored.edge.dst.clone()
        } else {
            stored.edge.src.clone()
        };
        if !neighbors.contains(&other) {
            neighbors.push(other);
        }
    }
    neighbors.sort_by(|a, b| a.0.cmp(&b.0));
    for edges in edges_by_tier.values_mut() {
        edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    }
    Some(ContextBundle {
        degree_by_tier: degree_by_tier(graph, id),
        node,
        edges_by_tier,
        neighbors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::edges::ingest_test_helpers::declared_edge;
    use crate::graph::EdgeAttrs;
    use engine_model::{CanonicalKey, Facet, NodeKind, Presence, ScopeRef, node_id};

    fn doc(stem: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: Some(stem.into()),
            doc_type: None,
            dates: None,
            feature_tags: vec!["demo".into()],
            status: None,
            tier: None,
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
    fn context_is_a_pure_serializable_tier_labelled_read() {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan"));
        g.upsert_node(doc("a-adr"));
        crate::edges::ingest(
            &mut g,
            declared_edge("a-plan", "a-adr", 1),
            EdgeAttrs::default(),
        )
        .unwrap();

        let id = node_id(&CanonicalKey::Document { stem: "a-plan" });
        let bundle = context(&g, &id).expect("known node");
        assert_eq!(bundle.edges_by_tier["declared"].len(), 1);
        assert_eq!(bundle.neighbors.len(), 1);
        assert_eq!(bundle.degree_by_tier["declared"], 1);

        // Serializable: the orchestration seam is JSON-clean.
        let json = serde_json::to_string(&bundle).expect("serializes");
        assert!(json.contains("doc:a-adr"));

        // Pure: assembling twice yields identical output, graph untouched.
        let again = context(&g, &id).unwrap();
        assert_eq!(serde_json::to_string(&again).unwrap(), json);
        assert_eq!(g.edge_count(), 1);

        // Unknown node: truthful None.
        assert!(context(&g, &NodeId("doc:nope".into())).is_none());
    }
}
