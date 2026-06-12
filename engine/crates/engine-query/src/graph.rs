//! The scoped graph query (contract §4): `{scope, filter, granularity}` →
//! a filtered slice of the in-memory graph with the validated filter
//! echoed back normalized.

use engine_graph::{LinkageGraph, MetaEdge, meta_edges};
use engine_model::{Edge, Node, ScopeRef};
use serde::Serialize;

use crate::filter::{Filter, FilterError};

/// Constellation vs. document granularity (contract §4): feature-level
/// queries return engine-aggregated meta-edges; doc-level edges arrive on
/// descent.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Granularity {
    #[default]
    Document,
    Feature,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphSlice {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    /// Feature-level meta-edges; populated at `Feature` granularity only.
    pub meta_edges: Vec<MetaEdge>,
    /// The validated, normalized filter, echoed back (D7.2).
    pub filter: Filter,
}

/// Run the scoped query. `scope` narrows edges to one corpus view (the
/// stateless per-request scope, contract §3); nodes pass if any facet
/// matches the scope.
pub fn graph_query(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    filter: Filter,
    granularity: Granularity,
) -> Result<GraphSlice, FilterError> {
    let filter = filter.validated()?;

    let mut nodes: Vec<Node> = graph
        .nodes()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .filter(|n| filter.matches_node(n))
        .cloned()
        .collect();
    nodes.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    let (edges, meta) = match granularity {
        Granularity::Document => {
            let mut edges: Vec<Edge> = graph
                .edges()
                .filter(|s| &s.edge.scope == scope)
                .filter(|s| filter.matches_edge(s))
                .map(|s| s.edge.clone())
                .collect();
            edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
            (edges, Vec::new())
        }
        // Constellation granularity: the GUI never flattens doc-level
        // edges client-side (contract §4) — the engine aggregates.
        Granularity::Feature => (Vec::new(), meta_edges(graph)),
    };

    Ok(GraphSlice {
        nodes,
        edges,
        meta_edges: meta,
        filter,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_graph::EdgeAttrs;
    use engine_model::{
        CanonicalKey, Facet, NodeKind, Presence, Provenance, RelationKind, ResolutionState, Tier,
        edge_id, node_id,
    };

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    fn doc(stem: &str, feature: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            feature_tags: vec![feature.into()],
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    fn structural(src: &str, dst: &str, state: ResolutionState, confidence: f32) -> Edge {
        let s = node_id(&CanonicalKey::Document { stem: src });
        let d = node_id(&CanonicalKey::Document { stem: dst });
        let provenance = Provenance::DocumentBody {
            blob_hash: "b".into(),
            span: (0, 1),
            target: dst.into(),
        };
        Edge {
            id: edge_id(
                &s,
                &d,
                &RelationKind::Mentions,
                Tier::Structural,
                &provenance,
            ),
            src: s,
            dst: d,
            relation: RelationKind::Mentions,
            tier: Tier::Structural,
            confidence,
            state: Some(state),
            provenance,
            scope: scope(),
            observed_at: 0,
        }
    }

    fn fixture() -> LinkageGraph {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        g.upsert_node(doc("b-adr", "feature-b"));
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "b-adr", ResolutionState::Resolved, 0.9),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "gone-doc", ResolutionState::Broken, 0.0),
            EdgeAttrs::default(),
        )
        .unwrap();
        g
    }

    #[test]
    fn filter_is_echoed_normalized_and_applied() {
        let g = fixture();
        let filter: Filter = serde_json::from_str(r#"{"structural_state": ["resolved"]}"#).unwrap();
        let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
        assert_eq!(slice.edges.len(), 1);
        assert_eq!(slice.edges[0].state, Some(ResolutionState::Resolved));
        assert_eq!(slice.filter.structural_state, vec!["resolved"]);
    }

    #[test]
    fn broken_lens_survives_a_confidence_floor() {
        // Audit ruling W02P05-201: the broken lens must not be hidden by
        // confidence arithmetic — explicitly-requested broken edges pass.
        let g = fixture();
        let filter: Filter = serde_json::from_str(
            r#"{"structural_state": ["broken"], "min_confidence": {"structural": 0.5}}"#,
        )
        .unwrap();
        let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
        assert_eq!(slice.edges.len(), 1);
        assert_eq!(slice.edges[0].state, Some(ResolutionState::Broken));
    }

    #[test]
    fn feature_granularity_returns_meta_edges_not_doc_edges() {
        let g = fixture();
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Feature).unwrap();
        assert!(slice.edges.is_empty());
        assert_eq!(slice.meta_edges.len(), 1);
        assert_eq!(slice.meta_edges[0].count, 1, "cross-feature resolved edge");
    }

    #[test]
    fn text_and_feature_facets_narrow_nodes() {
        let g = fixture();
        let filter: Filter =
            serde_json::from_str(r#"{"feature_tags": ["feature-b"], "text": "ADR"}"#).unwrap();
        let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
        assert_eq!(slice.nodes.len(), 1);
        assert_eq!(slice.nodes[0].key, "b-adr");
    }
}
