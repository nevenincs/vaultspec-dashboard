//! The in-memory adjacency graph (engine-spec §8, D8.1): nodes stored by
//! stable key with per-corpus-view facets (D4.2), all queries answered
//! from RAM.

use std::collections::HashMap;

use engine_model::{Edge, EdgeId, Facet, Node, NodeId};

/// Ingestion-preserved attributes that ride alongside a model edge: core's
/// authored weight (declared / core-derived), and the observation
/// multiplicity (audit W01P01-003: same-id re-observations aggregate here).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct EdgeAttrs {
    pub multiplicity: u32,
    pub weight: Option<f64>,
    /// Core's authored kind string, verbatim, when the edge came from core.
    pub core_kind: Option<String>,
    /// What the mention resolved to in the live tree (audit W02P06-301
    /// bridge): mention-target identity is disjoint from real
    /// container/file node ids by design, so this attribute is the
    /// navigable bridge node-detail and evidence surface — without it,
    /// step/symbol mentions are dead ends on the stage.
    pub resolved_target: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StoredEdge {
    pub edge: Edge,
    pub attrs: EdgeAttrs,
}

/// The in-memory linkage graph.
#[derive(Debug, Default)]
pub struct LinkageGraph {
    nodes: HashMap<NodeId, Node>,
    edges: HashMap<EdgeId, StoredEdge>,
    /// NodeId → edge ids touching it (both directions).
    adjacency: HashMap<NodeId, Vec<EdgeId>>,
}

impl LinkageGraph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Insert or merge a node. Identity lives in the key: a node arriving
    /// again merges its facets per scope (replace-by-scope), never
    /// duplicating the node (D4.2).
    pub fn upsert_node(&mut self, node: Node) {
        match self.nodes.get_mut(&node.id) {
            None => {
                self.nodes.insert(node.id.clone(), node);
            }
            Some(existing) => {
                if node.title.is_some() {
                    existing.title = node.title;
                }
                for tag in node.feature_tags {
                    if !existing.feature_tags.contains(&tag) {
                        existing.feature_tags.push(tag);
                    }
                }
                for facet in node.facets {
                    upsert_facet(existing, facet);
                }
            }
        }
    }

    pub(crate) fn insert_validated_edge(&mut self, edge: Edge, attrs: EdgeAttrs) {
        let id = edge.id.clone();
        if let Some(existing) = self.edges.get_mut(&id) {
            // Same stable id = same logical edge. REPLACE semantics (audit
            // W02P05-202): multiplicity is aggregated upstream at
            // extraction granularity and arrives as a single value, so
            // re-ingestion of the same source is idempotent — the
            // incrementally-maintained graph converges to the cold rebuild
            // (D8.2). Incrementing here would inflate per re-index.
            existing.attrs.multiplicity = attrs.multiplicity.max(1);
            if attrs.weight.is_some() {
                existing.attrs.weight = attrs.weight;
            }
            if edge.observed_at > existing.edge.observed_at {
                existing.edge = edge;
            }
            return;
        }
        self.adjacency
            .entry(edge.src.clone())
            .or_default()
            .push(id.clone());
        self.adjacency
            .entry(edge.dst.clone())
            .or_default()
            .push(id.clone());
        self.edges.insert(
            id,
            StoredEdge {
                edge,
                attrs: EdgeAttrs {
                    multiplicity: attrs.multiplicity.max(1),
                    ..attrs
                },
            },
        );
    }

    pub fn node(&self, id: &NodeId) -> Option<&Node> {
        self.nodes.get(id)
    }

    pub fn nodes(&self) -> impl Iterator<Item = &Node> {
        self.nodes.values()
    }

    pub fn edge(&self, id: &EdgeId) -> Option<&StoredEdge> {
        self.edges.get(id)
    }

    pub fn edges(&self) -> impl Iterator<Item = &StoredEdge> {
        self.edges.values()
    }

    /// All edges touching a node (either direction).
    pub fn edges_of(&self, id: &NodeId) -> impl Iterator<Item = &StoredEdge> {
        self.adjacency
            .get(id)
            .into_iter()
            .flatten()
            .filter_map(|edge_id| self.edges.get(edge_id))
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }

    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }
}

/// Replace-by-scope facet merge (one facet per corpus view).
pub(crate) fn upsert_facet(node: &mut Node, facet: Facet) {
    if let Some(existing) = node.facets.iter_mut().find(|f| f.scope == facet.scope) {
        *existing = facet;
    } else {
        node.facets.push(facet);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};

    pub(crate) fn doc_node(stem: &str, scope: &str, hash: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.to_string(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec!["demo".into()],
            facets: vec![Facet {
                scope: ScopeRef::Ref { name: scope.into() },
                presence: Presence::Exists,
                content_hash: Some(hash.into()),
                lifecycle: None,
            }],
        }
    }

    #[test]
    fn same_key_across_scopes_is_one_node_with_two_facets() {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc_node("2026-06-12-x-plan", "main", "h1"));
        g.upsert_node(doc_node("2026-06-12-x-plan", "feature-x", "h2"));
        assert_eq!(g.node_count(), 1, "identity lives in the key");
        let node = g
            .node(&node_id(&CanonicalKey::Document {
                stem: "2026-06-12-x-plan",
            }))
            .unwrap();
        assert_eq!(node.facets.len(), 2, "branch variance lives in facets");
    }

    #[test]
    fn re_upserting_a_scope_replaces_its_facet_not_duplicates() {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc_node("2026-06-12-x-plan", "main", "h1"));
        g.upsert_node(doc_node("2026-06-12-x-plan", "main", "h1-updated"));
        let node = g.nodes().next().unwrap();
        assert_eq!(node.facets.len(), 1);
        assert_eq!(node.facets[0].content_hash.as_deref(), Some("h1-updated"));
    }
}
