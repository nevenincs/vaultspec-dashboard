//! The scoped graph query (contract §4): `{scope, filter, granularity}` →
//! a filtered slice of the in-memory graph with the validated filter
//! echoed back normalized.

use std::collections::BTreeMap;

use engine_graph::{LinkageGraph, MetaEdge, degree_by_tier, lifecycle_in_scope, meta_edges};
use engine_model::{Edge, Node, NodeId, NodeKind, Progress, ScopeRef};
use serde::Serialize;
use serde_json::{Value, json};

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
    /// Contract §4 node views: at document granularity, the stored node
    /// enriched with the list-shape projections (`degree_by_tier`,
    /// hoisted `lifecycle` — addendum S03); at feature granularity,
    /// synthesized feature-convergence nodes (addendum S02, ADR D4.1).
    pub nodes: Vec<Value>,
    pub edges: Vec<Edge>,
    /// Feature-level meta-edges; populated at `Feature` granularity only.
    pub meta_edges: Vec<MetaEdge>,
    /// The validated, normalized filter, echoed back (D7.2).
    pub filter: Filter,
}

/// One document node in the contract §4 list shape: the serialized node
/// plus the query-time projections (`degree_by_tier`, the scope facet's
/// `lifecycle` hoisted to the top level).
fn node_view(graph: &LinkageGraph, scope: &ScopeRef, node: &Node) -> Value {
    let mut view = serde_json::to_value(node).expect("node serializes");
    view["degree_by_tier"] =
        serde_json::to_value(degree_by_tier(graph, &node.id)).expect("degrees serialize");
    view["lifecycle"] =
        serde_json::to_value(lifecycle_in_scope(node, scope)).expect("lifecycle serializes");
    view
}

/// Synthesize feature-convergence nodes (kind `feature`, id
/// `feature:{tag}`) from the already-filtered document nodes: lifecycle
/// aggregates member progress; degree sums member per-tier degrees.
///
/// `degree_by_tier` is a summed-endpoint count, not a distinct-edge count:
/// an edge between two same-feature members contributes at both endpoints.
/// It is a sizing projection (how connected the convergence is), not an
/// edge cardinality — the GUI must not read it as a unique-edge total.
fn feature_nodes(graph: &LinkageGraph, scope: &ScopeRef, members: &[Node]) -> Vec<Value> {
    let mut by_tag: BTreeMap<&str, Vec<&Node>> = BTreeMap::new();
    for node in members {
        for tag in &node.feature_tags {
            by_tag.entry(tag).or_default().push(node);
        }
    }
    by_tag
        .into_iter()
        .map(|(tag, docs)| {
            let mut degrees: BTreeMap<&'static str, usize> = BTreeMap::new();
            let mut done: u32 = 0;
            let mut total: u32 = 0;
            for doc in &docs {
                for (tier, count) in degree_by_tier(graph, &doc.id) {
                    *degrees.entry(tier).or_default() += count;
                }
                if let Some(Progress { done: d, total: t }) =
                    lifecycle_in_scope(doc, scope).and_then(|l| l.progress)
                {
                    done += d;
                    total += t;
                }
            }
            let lifecycle = (total > 0).then(|| {
                json!({
                    "state": if done == total { "complete" } else { "active" },
                    "progress": {"done": done, "total": total},
                })
            });
            json!({
                "id": NodeId::derive(&NodeKind::Feature, tag).0,
                "kind": "feature",
                "key": tag,
                "title": tag,
                "feature_tags": [tag],
                "member_count": docs.len(),
                "degree_by_tier": degrees,
                "lifecycle": lifecycle,
                // Facet projection: the convergence exists in the queried
                // scope by construction (its members carry the facets).
                "facets": [{"scope": scope, "presence": "exists"}],
            })
        })
        .collect()
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

    let mut matched: Vec<Node> = graph
        .nodes()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .filter(|n| filter.matches_node(n))
        .cloned()
        .collect();
    matched.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    let (nodes, edges, meta) = match granularity {
        Granularity::Document => {
            let mut edges: Vec<Edge> = graph
                .edges()
                .filter(|s| &s.edge.scope == scope)
                .filter(|s| filter.matches_edge(s))
                .map(|s| s.edge.clone())
                .collect();
            edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
            let views = matched.iter().map(|n| node_view(graph, scope, n)).collect();
            (views, edges, Vec::new())
        }
        // Constellation granularity (contract §4, ADR D4.1): synthesized
        // feature-convergence nodes plus engine-aggregated meta-edges —
        // the GUI never flattens doc-level edges client-side.
        Granularity::Feature => (
            feature_nodes(graph, scope, &matched),
            Vec::new(),
            meta_edges(graph),
        ),
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
            doc_type: None,
            dates: None,
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
        // Meta-edges address feature NODE ids, not bare tags (S02).
        assert_eq!(slice.meta_edges[0].src, "feature:feature-a");
        assert_eq!(slice.meta_edges[0].dst, "feature:feature-b");
    }

    #[test]
    fn feature_granularity_synthesizes_convergence_nodes() {
        // ADR D4.1: the convergence entity itself, never empty nodes.
        let g = fixture();
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Feature).unwrap();
        assert_eq!(slice.nodes.len(), 2);
        assert!(slice.nodes.iter().all(|n| n["kind"] == "feature"));
        let a = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "feature:feature-a")
            .expect("feature-a synthesized");
        assert_eq!(a["member_count"], 1);
        assert!(a["degree_by_tier"].is_object());
    }

    #[test]
    fn document_list_shape_carries_contract_projections() {
        // Addendum S03: degree_by_tier + lifecycle on the LIST shape.
        let g = fixture();
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let a = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "doc:a-plan")
            .expect("a-plan listed");
        assert!(a["degree_by_tier"]["structural"].as_u64().unwrap() >= 1);
        assert!(a.get("lifecycle").is_some(), "lifecycle key present");
    }

    #[test]
    fn text_and_feature_facets_narrow_nodes() {
        let g = fixture();
        let filter: Filter =
            serde_json::from_str(r#"{"feature_tags": ["feature-b"], "text": "ADR"}"#).unwrap();
        let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
        assert_eq!(slice.nodes.len(), 1);
        assert_eq!(slice.nodes[0]["key"], "b-adr");
    }
}
