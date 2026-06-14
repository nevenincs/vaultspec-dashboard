//! The scoped graph query (contract §4): `{scope, filter, granularity}` →
//! a filtered slice of the in-memory graph with the validated filter
//! echoed back normalized.

use std::collections::BTreeMap;

use engine_graph::diff::DiffOp;
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
    /// hoisted `lifecycle` — addendum S03) and the additive ontology fields
    /// (`authority_class`, `aggregate` — graph-node-semantics ADR); at feature
    /// granularity, synthesized feature-convergence nodes (addendum S02, ADR
    /// D4.1).
    pub nodes: Vec<Value>,
    /// Contract §4 edge views: the serialized edge plus the additive
    /// `derivation` label (graph-node-semantics ADR), carried as a `Value` so
    /// the label rides ALONGSIDE the §4 `relation`/`tier` fields without
    /// touching the edge stable key.
    pub edges: Vec<Value>,
    /// Feature-level meta-edges; populated at `Feature` granularity only.
    pub meta_edges: Vec<MetaEdge>,
    /// The validated, normalized filter, echoed back (D7.2).
    pub filter: Filter,
}

/// One document node in the contract §4 list shape: the serialized node
/// plus the query-time projections (`degree_by_tier`, the scope facet's
/// `lifecycle` hoisted to the top level) and the ADDITIVE ontology fields
/// (graph-node-semantics ADR): `authority_class` (the register `doc_type`
/// answers in) and `aggregate` (the collapsibility hint). Both are pure
/// re-computable projections — they perturb no existing field and do NOT touch
/// the node id (the §4 identity guarantee is preserved).
fn node_view(graph: &LinkageGraph, scope: &ScopeRef, node: &Node) -> Value {
    let mut view = serde_json::to_value(node).expect("node serializes");
    view["degree_by_tier"] =
        serde_json::to_value(degree_by_tier(graph, &node.id)).expect("degrees serialize");
    view["lifecycle"] =
        serde_json::to_value(lifecycle_in_scope(node, scope)).expect("lifecycle serializes");
    // Ontology projection (additive): the authority register and the
    // aggregate-species hint, both inferred from the node's kind/doc_type.
    view["authority_class"] = Value::String(
        crate::ontology::authority_class_for_kind(&node.kind, node.doc_type.as_deref()).to_string(),
    );
    view["aggregate"] = Value::Bool(crate::ontology::is_aggregate_species(
        node.doc_type.as_deref(),
    ));
    view
}

/// One edge in the contract §4 list shape plus the ADDITIVE `derivation` label
/// (graph-node-semantics ADR). The label is inferred from the relation, the
/// endpoint document types, the provenance, and the exec-record container-path
/// signal — carried ALONGSIDE the §4 `relation`/`tier`, never instead of them,
/// and DELIBERATELY not threaded into the edge id (labeling never re-keys).
/// A `null` `derivation` is serialized for edges with no pipeline relationship.
fn edge_view(graph: &LinkageGraph, edge: &Edge) -> Value {
    let mut view = serde_json::to_value(edge).expect("edge serializes");
    let src_type = doc_type_of(graph, &edge.src);
    let dst_type = doc_type_of(graph, &edge.dst);
    // The exec container-path signal: a plan→exec `generated-by` edge whose
    // exec endpoint is a step/summary record (its id encodes the plan
    // container path, the most reliable derivation in the corpus).
    let is_exec_container_path = matches!(
        (src_type.as_deref(), dst_type.as_deref()),
        (Some("plan"), Some("exec")) | (Some("exec"), Some("plan"))
    ) && [&edge.src, &edge.dst]
        .iter()
        .filter_map(|id| graph.node(id))
        .any(|n| crate::ontology::stem_is_exec_record(&n.key));
    let label = crate::ontology::derivation_label(
        &edge.relation,
        src_type.as_deref(),
        dst_type.as_deref(),
        &edge.provenance,
        is_exec_container_path,
    );
    view["derivation"] = match label {
        Some(label) => Value::String(label.to_string()),
        None => Value::Null,
    };
    view
}

/// The `doc_type` of the node an edge endpoint addresses, if it is a document
/// node present in the graph (used by the derivation projection).
fn doc_type_of(graph: &LinkageGraph, id: &engine_model::NodeId) -> Option<String> {
    graph.node(id).and_then(|n| n.doc_type.clone())
}

/// Synthesize feature-convergence nodes (kind `feature`, id
/// `feature:{tag}`) from the already-filtered document nodes: lifecycle
/// aggregates member progress; degree sums member per-tier degrees.
///
/// `degree_by_tier` is a summed-endpoint count, not a distinct-edge count:
/// an edge between two same-feature members contributes at both endpoints.
/// It is a sizing projection (how connected the convergence is), not an
/// edge cardinality — the GUI must not read it as a unique-edge total.
fn feature_nodes(graph: &LinkageGraph, scope: &ScopeRef, members: &[&Node]) -> Vec<Value> {
    let mut by_tag: BTreeMap<&str, Vec<&Node>> = BTreeMap::new();
    for &node in members {
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

    // Borrow matched nodes (perf ADR D3): node_view / feature_nodes only read
    // each node and re-serialize it into a Value, so cloning the whole match set
    // up front was a redundant deep Node clone per node (id/key/title strings +
    // facets Vec) on every request. Sorting borrowed refs is cheap.
    let mut matched: Vec<&Node> = graph
        .nodes()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .filter(|n| filter.matches_node(n))
        .collect();
    matched.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    let (nodes, edges, meta) = match granularity {
        Granularity::Document => {
            let mut edges: Vec<&Edge> = graph
                .edges()
                .filter(|s| &s.edge.scope == scope)
                .filter(|s| filter.matches_edge(s))
                .map(|s| &s.edge)
                .collect();
            edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
            let edge_views = edges.iter().map(|&e| edge_view(graph, e)).collect();
            let views = matched
                .iter()
                .map(|&n| node_view(graph, scope, n))
                .collect();
            (views, edge_views, Vec::new())
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

/// The feature/meta-edge delta between two graph states, on the single delta
/// clock (constellation-live-delta ADR / S50). Projects `old` and `new` to the
/// FEATURE granularity (feature-convergence nodes + meta-edges) and diffs them
/// by stable id into `granularity: "feature"` entries
/// (`{op, granularity, node?|edge?, t, seq}` — the same wire shape as the
/// document deltas), advancing `seq` from `seq_start`. Returns the entries and
/// the last seq used. The engine owns this aggregation (contract §4: the GUI
/// never derives the constellation from document edges); meta-edge identity is
/// the endpoint pair, stable across re-derivation (provenance-stable keys).
pub fn feature_delta(
    old: &LinkageGraph,
    new: &LinkageGraph,
    scope: &ScopeRef,
    t: i64,
    seq_start: u64,
) -> (Vec<Value>, u64) {
    fn project(
        g: &LinkageGraph,
        scope: &ScopeRef,
    ) -> (BTreeMap<String, Value>, BTreeMap<(String, String), Value>) {
        let members: Vec<&Node> = g
            .nodes()
            .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
            .collect();
        let nodes = feature_nodes(g, scope, &members)
            .into_iter()
            .filter_map(|v| {
                let id = v["id"].as_str()?.to_string();
                Some((id, v))
            })
            .collect();
        let metas = meta_edges(g)
            .into_iter()
            .map(|m: MetaEdge| {
                let key = (m.src.clone(), m.dst.clone());
                (key, serde_json::to_value(m).expect("meta-edge serializes"))
            })
            .collect();
        (nodes, metas)
    }

    let (old_nodes, old_metas) = project(old, scope);
    let (new_nodes, new_metas) = project(new, scope);

    let mut entries: Vec<Value> = Vec::new();
    let mut seq = seq_start;
    let mut push = |op: DiffOp, node: Option<&Value>, edge: Option<&Value>| {
        let mut entry = serde_json::Map::new();
        entry.insert(
            "op".into(),
            serde_json::to_value(op).expect("op serializes"),
        );
        entry.insert("granularity".into(), Value::String("feature".into()));
        if let Some(node) = node {
            entry.insert("node".into(), node.clone());
        }
        if let Some(edge) = edge {
            entry.insert("edge".into(), edge.clone());
        }
        entry.insert("t".into(), Value::from(t));
        entry.insert("seq".into(), Value::from(seq));
        entries.push(Value::Object(entry));
        seq += 1;
    };

    // Deterministic order (BTreeMap is sorted): nodes then edges, add/change
    // for entries present in `new`, remove for entries gone from `old`.
    for (id, node) in &new_nodes {
        match old_nodes.get(id) {
            None => push(DiffOp::Add, Some(node), None),
            Some(before) if before != node => push(DiffOp::Change, Some(node), None),
            _ => {}
        }
    }
    for (id, node) in &old_nodes {
        if !new_nodes.contains_key(id) {
            push(DiffOp::Remove, Some(node), None);
        }
    }
    for (key, edge) in &new_metas {
        match old_metas.get(key) {
            None => push(DiffOp::Add, None, Some(edge)),
            Some(before) if before != edge => push(DiffOp::Change, None, Some(edge)),
            _ => {}
        }
    }
    for (key, edge) in &old_metas {
        if !new_metas.contains_key(key) {
            push(DiffOp::Remove, None, Some(edge));
        }
    }

    let last_seq = seq.saturating_sub(1).max(seq_start);
    (entries, last_seq)
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
        // Infer a doc_type from the stem's trailing segment so the ontology
        // projection (authority_class, derivation) has real types to read.
        let doc_type = match stem.rsplit('-').next() {
            Some(t @ ("plan" | "adr" | "exec" | "audit" | "research" | "reference")) => {
                Some(t.to_string())
            }
            _ => None,
        };
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type,
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
        assert_eq!(slice.edges[0]["state"], "resolved");
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
        assert_eq!(slice.edges[0]["state"], "broken");
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
        // Ontology projection (graph-node-semantics ADR): authority_class and
        // aggregate ride additively on the document list shape.
        assert_eq!(
            a["authority_class"], "roadmap",
            "a-plan maps to the roadmap register"
        );
        assert_eq!(a["aggregate"], false, "a plan is individually weighted");
        let b = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "doc:b-adr")
            .expect("b-adr listed");
        assert_eq!(b["authority_class"], "design", "b-adr maps to design");
    }

    #[test]
    fn ontology_is_additive_and_leaves_the_id_unchanged() {
        // Adding authority_class/aggregate must NOT perturb the §4 identity:
        // the node id on the enriched view equals the stored node id.
        let g = fixture();
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let a = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "doc:a-plan")
            .expect("a-plan listed");
        assert_eq!(
            a["id"], "doc:a-plan",
            "the additive ontology fields do not re-key the node"
        );
        // The thin §4 fields are retained verbatim alongside the additions.
        assert_eq!(a["kind"], "document");
        assert!(a.get("authority_class").is_some());
        assert!(a.get("aggregate").is_some());
    }

    #[test]
    fn edges_carry_a_derivation_label_distinct_from_relation() {
        // a-plan -> b-adr is plan↔adr: the derivation label is `authorizes`,
        // carried ALONGSIDE the §4 relation, never replacing it.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        g.upsert_node(doc("b-adr", "feature-a"));
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "b-adr", ResolutionState::Resolved, 0.9),
            EdgeAttrs::default(),
        )
        .unwrap();
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let e = &slice.edges[0];
        // The §4 relation is preserved; the derivation rides alongside.
        assert_eq!(e["relation"], "mentions", "the §4 relation is untouched");
        assert_eq!(e["derivation"], "authorizes", "plan↔adr derivation label");
        assert!(e.get("tier").is_some(), "the §4 tier is still present");
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

    #[test]
    fn feature_delta_projects_constellation_changes_tagged_on_the_clock() {
        // S50: the feature/meta-edge delta between two graph states.
        // old: just feature-a, no cross-feature edge (no meta-edge yet).
        let mut old = LinkageGraph::new();
        old.upsert_node(doc("a-plan", "feature-a"));
        // new: the fixture adds feature-b and a cross-feature edge, so a
        // meta-edge appears (feature-a -> feature-b) and feature-a's degree
        // changes.
        let new = fixture();

        let (entries, last_seq) = feature_delta(&old, &new, &scope(), 100, 5);

        assert!(!entries.is_empty(), "constellation changed: deltas emitted");
        // Every entry rides the FEATURE species and the shared clock from 5.
        assert!(entries.iter().all(|e| e["granularity"] == "feature"));
        assert!(entries.iter().all(|e| e["seq"].as_u64().unwrap() >= 5));
        assert_eq!(
            last_seq,
            5 + entries.len() as u64 - 1,
            "contiguous seqs from seq_start"
        );
        assert!(entries.iter().all(|e| e["t"] == 100));
        // The cross-feature meta-edge is an `add` (absent in old); meta-edge
        // identity is the endpoint pair, stable across re-derivation.
        assert!(
            entries.iter().any(|e| {
                e["op"] == "add"
                    && e["edge"]["src"] == "feature:feature-a"
                    && e["edge"]["dst"] == "feature:feature-b"
            }),
            "the new cross-feature meta-edge appears as a tagged add: {entries:?}"
        );
    }
}
