//! The in-memory linkage graph (engine-spec §8): nodes, edges, facets,
//! context assembly, and filter evaluation.
//!
//! Vault corpora are thousands of documents, not millions — the graph fits
//! in RAM; the expensive part is ingestion, not storage. Derived projections
//! (per-tier degree counts, lifecycle/progress summaries) are computed at
//! query time, never stored on nodes (engine-spec §4.3).

use engine_model::{Edge, Node, NodeId, Tier};

/// The in-memory adjacency structure. Placeholder: real indexes (by id, by
/// tier, by scope) arrive with the ingestion pipeline.
#[derive(Debug, Default)]
pub struct LinkageGraph {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
}

impl LinkageGraph {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn insert_node(&mut self, node: Node) {
        self.nodes.push(node);
    }

    pub fn insert_edge(&mut self, edge: Edge) {
        self.edges.push(edge);
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }

    /// Per-tier degree count for a node — a query-time projection promised
    /// on graph nodes by contract §4, never a stored field.
    pub fn degree_by_tier(&self, id: &NodeId, tier: Tier) -> usize {
        self.edges
            .iter()
            .filter(|e| e.tier == tier && (&e.src == id || &e.dst == id))
            .count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::{EdgeId, NodeKind, Provenance, RelationKind, ScopeRef};

    #[test]
    fn degree_by_tier_is_a_query_time_projection() {
        let mut g = LinkageGraph::new();
        let a = NodeId::derive(&NodeKind::Feature, "editor-demo");
        let b = NodeId::derive(&NodeKind::Document, "2026-06-12-editor-demo-plan");
        g.insert_edge(Edge {
            id: EdgeId("e1".into()),
            src: b.clone(),
            dst: a.clone(),
            relation: RelationKind::References,
            tier: Tier::Declared,
            confidence: 1.0,
            state: None,
            provenance: Provenance::CoreGraph {
                payload_hash: "h".into(),
                edge_id: "1".into(),
            },
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            observed_at: 0,
        });
        assert_eq!(g.degree_by_tier(&a, Tier::Declared), 1);
        assert_eq!(g.degree_by_tier(&a, Tier::Semantic), 0);
    }
}
