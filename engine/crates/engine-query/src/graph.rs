//! The scoped graph query (contract §4): `{scope, filter, granularity}` →
//! a filtered slice of the in-memory graph with the validated filter
//! echoed back normalized.

use std::collections::BTreeMap;
use std::collections::HashMap;
use std::collections::HashSet;

use engine_graph::diff::DiffOp;
use engine_graph::{LinkageGraph, MetaEdge, degree_by_tier, lifecycle_in_scope, meta_edges};
use engine_model::{Edge, Node, NodeId, NodeKind, Progress, RelationKind, ScopeRef};
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

/// Hard ceiling on nodes serialized at either granularity (perf ADR D2 /
/// research F2): an unbounded slice is linear but reaches a multi-gigabyte body
/// at corpus scale, so NO engine front door — the HTTP route or the CLI `graph`
/// verb — ever serializes more than this. Beyond it the client narrows with a
/// filter; the feature constellation is the smallest view.
pub const MAX_GRAPH_NODES: usize = 5000;

/// Bound a slice to [`MAX_GRAPH_NODES`], keeping the returned subgraph
/// self-consistent: document edges AND feature meta-edges that reference a
/// dropped node are removed. Returns the original node total when truncation
/// happened so the caller can state it honestly. Nodes are already id-sorted, so
/// the kept page is deterministic. Works at both granularities — at document
/// granularity `meta_edges` is empty (its retain is a no-op); at feature
/// granularity `edges` is empty and the meta-edge retain does the work.
pub fn bound_slice(slice: &mut GraphSlice) -> Option<usize> {
    let total = slice.nodes.len();
    if total <= MAX_GRAPH_NODES {
        return None;
    }
    slice.nodes.truncate(MAX_GRAPH_NODES);
    let kept: std::collections::HashSet<String> = slice
        .nodes
        .iter()
        .filter_map(|n| n["id"].as_str().map(str::to_string))
        .collect();
    // Edges are serialized §4 views (`Value`, carrying the additive `derivation`
    // label), so endpoints are read by key; a self-consistent slice keeps only
    // edges whose both endpoints survived the node cap.
    let kept_endpoint = |e: &Value, key: &str| e[key].as_str().is_some_and(|s| kept.contains(s));
    slice
        .edges
        .retain(|e| kept_endpoint(e, "src") && kept_endpoint(e, "dst"));
    slice
        .meta_edges
        .retain(|m| kept.contains(&m.src) && kept.contains(&m.dst));
    Some(total)
}

/// One document node in the contract §4 list shape: the serialized node
/// plus the query-time projections (`degree_by_tier`, the scope facet's
/// `lifecycle` hoisted to the top level) and the ADDITIVE ontology fields:
/// `authority_class` (the register `doc_type` answers in) and `aggregate` (the
/// collapsibility hint) from the graph-node-semantics ADR, plus the OPTIONAL
/// `status_value`/`status_class` per-type lifecycle status (node-visual-richness
/// ADR P01) when the type carries one. All are pure re-computable projections —
/// they perturb no existing field and do NOT touch the node id (the §4 identity
/// guarantee is preserved).
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
    // Per-type lifecycle status (node-visual-richness ADR P01): TWO additive
    // fields — `status_value` (the literal type-specific status token) and
    // `status_class` (the closed treatment-family enum) — projected from the
    // node's kind/doc_type and its ALREADY-PARSED lifecycle state. Both are
    // OPTIONAL: a type without a per-type status machine (exec/research/…), an
    // unknown type, or a doc predating the convention serializes NEITHER field
    // (honest absence, never a fabricated status). The id is untouched.
    let lifecycle_state = lifecycle_in_scope(node, scope).map(|l| l.state.as_str());
    if let Some(status) =
        crate::ontology::status_for_node(&node.kind, node.doc_type.as_deref(), lifecycle_state)
    {
        view["status_value"] = Value::String(status.value.to_string());
        view["status_class"] = Value::String(status.class.to_string());
    }
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
    view["derivation"] = match derivation_for_edge(graph, edge) {
        Some(label) => Value::String(label.to_string()),
        None => Value::Null,
    };
    // Slim the graph-wire edge (perf: the document slice was ~21 MB of edges,
    // ~579 B/edge, dominating a 22 MB body). Two fields are dead weight the client
    // never reads and that bloat every one of tens of thousands of edges:
    //   - `scope`: identical to the query scope on EVERY edge (the whole slice is
    //     one scope) — pure per-edge redundancy; the mock never emits it, so
    //     dropping it also converges mock↔live (mock-mirrors-live-wire-shape).
    //   - `provenance`: the full provenance object is graph-render dead weight —
    //     the renderer draws a tier-coloured src→dst line and never reads it; the
    //     stable edge id already encodes provenance identity engine-side
    //     (provenance-stable-keys-are-identity-bearing), so the wire need not
    //     re-ship it. Edge detail is fetched on demand, not bulk-shipped per edge.
    // Confidence is rounded to 3 dp: the f32→JSON cast emitted full f64 precision
    // (e.g. 0.8999999761581421, 18 B) for a value the client only buckets.
    if let Some(obj) = view.as_object_mut() {
        obj.remove("scope");
        obj.remove("provenance");
        if let Some(c) = obj.get("confidence").and_then(Value::as_f64) {
            obj.insert(
                "confidence".to_string(),
                Value::from((c * 1000.0).round() / 1000.0),
            );
        }
    }
    view
}

/// The shared derivation-label projection for one edge (graph-lineage-dag ADR
/// D4/D7): the ONE seam both `/graph/query`'s `edge_view` and `/graph/lineage`'s
/// `lineage_arc` read, so the topological slice and the diachronic timeline carry
/// the same label vocabulary. Inspects the endpoint nodes' `kind` and `doc_type`
/// to detect the container-path `generated-by` signal, then delegates to the
/// closed [`crate::ontology::derivation_label`] vocabulary. Pure read-and-infer:
/// it takes no id and returns no id, so the label NEVER enters `edge_id` (D3.3).
pub fn derivation_for_edge(graph: &LinkageGraph, edge: &Edge) -> Option<&'static str> {
    let src = graph.node(&edge.src);
    let dst = graph.node(&edge.dst);
    let src_type = src.and_then(|n| n.doc_type.clone());
    let dst_type = dst.and_then(|n| n.doc_type.clone());
    // The container-path `generated-by` signal (graph-lineage-dag ADR D3.1): the
    // plan→step→exec hierarchy the corpus authors flows through TWO id-bearing
    // shapes the detection must both recognise, reading `node.kind` not only the
    // `doc_type` pair —
    //   (a) the doc→doc wikilink path: a `plan`↔`exec` edge whose exec endpoint
    //       is a step/summary record (its stem encodes the `W##/P##/S##`
    //       container path), and
    //   (b) the AUTHORED binding path: a `PlanContainer` (step) node bound to its
    //       exec-record document (the `bind_steps_to_exec_records` `References`
    //       edge). `PlanContainer` nodes carry `doc_type: None`, so the old
    //       doc-type-pair gate never fired here — the most reliable derivation in
    //       the corpus was being dropped to the off-spine lane.
    // Widening DETECTION only: `derivation_label`'s closed vocabulary is
    // untouched and the label still never enters `edge_id` (ADR D3.3).
    let container_endpoint = |node: Option<&Node>, other: Option<&Node>| -> bool {
        let Some(node) = node else { return false };
        match node.kind {
            // A PlanContainer reaching an exec-record document: the authored
            // plan→step→exec binding (path b).
            NodeKind::PlanContainer => other.is_some_and(|o| {
                o.doc_type.as_deref() == Some("exec")
                    && crate::ontology::stem_is_exec_record(&o.key)
            }),
            // A plan/exec document on the wikilink path (path a).
            NodeKind::Document if node.doc_type.as_deref() == Some("exec") => {
                crate::ontology::stem_is_exec_record(&node.key)
            }
            _ => false,
        }
    };
    // The authored plan-internal `Contains` hierarchy (graph-lineage-dag ADR
    // D3.2): plan→wave→phase→step, carried by `Contains` edges between the plan
    // document and its `PlanContainer` nodes (and between containers). Labeling
    // it `generated-by` makes the WHOLE plan→wave→phase→step→exec hierarchy ONE
    // connected `generated-by` spine rather than dropping the scaffold off-spine
    // — the open-question decision (S34): the hierarchy RIDES `generated-by`, no
    // distinct sub-label, so the closed vocabulary and `DERIVATION_AXIS_ORDER`
    // are untouched (a new sub-label would inject an axis rung the scene does not
    // know). A `Contains` edge always has at least one `PlanContainer` endpoint.
    let is_contains_hierarchy = matches!(edge.relation, RelationKind::Contains)
        && [src, dst]
            .into_iter()
            .flatten()
            .any(|n| matches!(n.kind, NodeKind::PlanContainer));
    let is_exec_container_path = (matches!(
        (src_type.as_deref(), dst_type.as_deref()),
        (Some("plan"), Some("exec")) | (Some("exec"), Some("plan"))
    ) && [src, dst]
        .into_iter()
        .flatten()
        .any(|n| crate::ontology::stem_is_exec_record(&n.key)))
        || container_endpoint(src, dst)
        || container_endpoint(dst, src)
        || is_contains_hierarchy;
    crate::ontology::derivation_label(
        &edge.relation,
        src_type.as_deref(),
        dst_type.as_deref(),
        &edge.provenance,
        is_exec_container_path,
    )
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
            let lifecycle_state =
                (total > 0).then_some(if done == total { "complete" } else { "active" });
            let lifecycle = lifecycle_state.map(|state| {
                json!({
                    "state": state,
                    "progress": {"done": done, "total": total},
                })
            });
            // Per-type status (node-visual-richness ADR P01): the synthesized
            // convergence carries its in-flight/archived status additively, the
            // SAME two fields the document node_view attaches. A live feature in
            // the corpus is in-flight; the projection reads its aggregate
            // lifecycle state through the shared `status` owner.
            let status = crate::ontology::status(&NodeKind::Feature, None, lifecycle_state);
            let mut node = json!({
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
            });
            if let Some(status) = status {
                node["status_value"] = Value::String(status.value.to_string());
                node["status_class"] = Value::String(status.class.to_string());
            }
            node
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
    graph_query_inner(graph, scope, filter, granularity, None)
}

/// Like [`graph_query`] but reusing pre-built per-generation enriched node/edge
/// views (perf-sweep A1). The Document arm's `node_view`/`edge_view` projections
/// (serialize + `degree_by_tier` adjacency walk + ontology + status) are the
/// dominant per-request cost and are identical for a fixed graph generation, so
/// the API layer memoizes them once per generation (mirroring the `meta_edges`
/// cache) and passes them here. Filtering and sorting still run per request; only
/// the heavy per-item projection is reused, so a node/edge absent from the cache
/// (none today) falls back to a fresh projection — never wrong, just uncached.
pub fn graph_query_cached(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    filter: Filter,
    granularity: Granularity,
    node_views: &HashMap<String, Value>,
    edge_views: &HashMap<String, Value>,
    scope_node_ids: &HashSet<String>,
) -> Result<GraphSlice, FilterError> {
    graph_query_inner(
        graph,
        scope,
        filter,
        granularity,
        Some((node_views, edge_views, scope_node_ids)),
    )
}

/// Build every node's and (scope-local) edge's enriched view once — the unit the
/// API layer caches per graph generation for [`graph_query_cached`]. Pure over an
/// immutable graph generation, so the result is safe to memoize keyed on it.
pub fn build_document_views(
    graph: &LinkageGraph,
    scope: &ScopeRef,
) -> (
    HashMap<String, Value>,
    HashMap<String, Value>,
    HashSet<String>,
) {
    // One pass over the nodes builds the enriched node views AND the in-scope
    // node-id set (backend-hotpath-hardening F4): the latter is what the Document
    // arm's broken-link endpoint check needs, so caching it here removes that
    // second full node scan from every request at zero extra build cost.
    let mut node_views = HashMap::new();
    let mut scope_node_ids = HashSet::new();
    for n in graph.nodes() {
        node_views.insert(n.id.0.clone(), node_view(graph, scope, n));
        if n.facets.iter().any(|f| &f.scope == scope) {
            scope_node_ids.insert(n.id.0.clone());
        }
    }
    let edge_views = graph
        .edges()
        .filter(|s| &s.edge.scope == scope)
        .map(|s| (s.edge.id.0.clone(), edge_view(graph, &s.edge)))
        .collect();
    (node_views, edge_views, scope_node_ids)
}

#[allow(clippy::type_complexity)]
fn graph_query_inner(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    filter: Filter,
    granularity: Granularity,
    views: Option<(
        &HashMap<String, Value>,
        &HashMap<String, Value>,
        &HashSet<String>,
    )>,
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
            // Self-consistent subgraph (graph-queries-are-bounded-by-default):
            // a node filter (e.g. `feature_tags`) narrows the kept node set far
            // below `MAX_GRAPH_NODES`, so a cross-feature edge whose other
            // endpoint is a REAL node that was filtered out would dangle — an
            // unbounded, self-inconsistent payload `bound_slice` never prunes
            // (it only acts on cap truncation > MAX_GRAPH_NODES). Drop such an
            // edge HERE, but KEEP an edge whose endpoint is an unresolved/broken
            // target (not a graph node at all) so the broken lens still surfaces
            // it (audit W02P05-201): a broken link is intentionally dangling.
            let kept: HashSet<&str> = matched.iter().map(|n| n.id.0.as_str()).collect();
            // Reuse the per-generation cached in-scope node-id set when present
            // (F4); otherwise build it (the uncached path). Owned-String set so
            // both paths share one type for the endpoint check.
            let built_scope_nodes: HashSet<String>;
            let scope_nodes: &HashSet<String> = match views {
                Some((_, _, sn)) => sn,
                None => {
                    built_scope_nodes = graph
                        .nodes()
                        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
                        .map(|n| n.id.0.clone())
                        .collect();
                    &built_scope_nodes
                }
            };
            // An endpoint is acceptable if it survived the node filter, or it is
            // not a real in-scope node (a broken/unresolved reference).
            let endpoint_ok = |id: &str| kept.contains(id) || !scope_nodes.contains(id);
            let mut edges: Vec<&Edge> = graph
                .edges()
                .filter(|s| &s.edge.scope == scope)
                .filter(|s| filter.matches_edge(s))
                .map(|s| &s.edge)
                .filter(|e| endpoint_ok(e.src.0.as_str()) && endpoint_ok(e.dst.0.as_str()))
                .collect();
            edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
            let edge_view_list = edges
                .iter()
                .map(|&e| {
                    views
                        .and_then(|(_, ev, _)| ev.get(&e.id.0).cloned())
                        .unwrap_or_else(|| edge_view(graph, e))
                })
                .collect();
            let node_view_list = matched
                .iter()
                .map(|&n| {
                    views
                        .and_then(|(nv, _, _)| nv.get(&n.id.0).cloned())
                        .unwrap_or_else(|| node_view(graph, scope, n))
                })
                .collect();
            (node_view_list, edge_view_list, Vec::new())
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
            status: None,
            tier: None,
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
    fn cached_document_query_is_byte_identical_to_uncached() {
        // A1 correctness invariant: reusing the per-generation enriched views via
        // graph_query_cached must produce exactly the same slice as recomputing
        // them in graph_query — both filtered and unfiltered.
        let g = fixture();
        let (nv, ev, sn) = build_document_views(&g, &scope());
        for filter in [
            Filter::default(),
            serde_json::from_str(r#"{"structural_state": ["resolved"]}"#).unwrap(),
        ] {
            let uncached =
                graph_query(&g, &scope(), filter.clone(), Granularity::Document).unwrap();
            let cached =
                graph_query_cached(&g, &scope(), filter, Granularity::Document, &nv, &ev, &sn)
                    .unwrap();
            assert_eq!(
                serde_json::to_value(&uncached).unwrap(),
                serde_json::to_value(&cached).unwrap(),
                "cached document slice diverged from uncached"
            );
        }
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
    fn document_feature_filter_returns_a_self_consistent_subgraph() {
        // graph-queries-are-bounded-by-default: a `feature_tags` descent narrows
        // the node set, so no returned edge may dangle to a REAL node that was
        // filtered out (the unbounded cross-feature payload the bound prevents).
        // A broken/unresolved target may still dangle (broken lens), but a real
        // in-scope node must never appear on an edge without its node.
        let g = fixture();
        let filter: Filter = serde_json::from_str(r#"{"feature_tags": ["feature-a"]}"#).unwrap();
        let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
        let kept: std::collections::HashSet<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        let real: std::collections::HashSet<String> = g.nodes().map(|n| n.id.0.clone()).collect();
        for e in &slice.edges {
            for key in ["src", "dst"] {
                let id = e[key].as_str().expect("endpoint serialized");
                if real.contains(id) {
                    assert!(
                        kept.contains(id),
                        "edge {key} {id} is a real in-scope node but absent from the kept slice"
                    );
                }
            }
        }
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

    /// A document node carrying a specific parsed lifecycle `state` in scope,
    /// so the status projection has a real per-type state to read.
    fn doc_with_state(stem: &str, doc_type: &str, state: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: Some(doc_type.into()),
            dates: None,
            feature_tags: vec!["feature-a".into()],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: Some(engine_model::Lifecycle {
                    state: state.into(),
                    progress: None,
                }),
            }],
        }
    }

    #[test]
    fn document_node_carries_per_type_status_when_the_type_has_one() {
        // node-visual-richness ADR P01: status_value/status_class ride additively
        // on the document list shape, projected from the parsed lifecycle state.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc_with_state("x-adr", "adr", "accepted"));
        g.upsert_node(doc_with_state("y-plan", "plan", "L2"));
        g.upsert_node(doc_with_state("z-audit", "audit", "high"));
        g.upsert_node(doc_with_state("w-rule", "rule", "superseded"));
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let node = |id: &str| {
            slice
                .nodes
                .iter()
                .find(|n| n["id"] == id)
                .unwrap_or_else(|| panic!("{id} listed"))
                .clone()
        };
        let adr = node("doc:x-adr");
        assert_eq!(adr["status_value"], "accepted");
        assert_eq!(adr["status_class"], "affirmed");
        let plan = node("doc:y-plan");
        assert_eq!(
            plan["status_value"], "L2",
            "the tier ordinal rides in value"
        );
        assert_eq!(plan["status_class"], "tiered");
        let audit = node("doc:z-audit");
        assert_eq!(audit["status_value"], "high");
        assert_eq!(audit["status_class"], "graded");
        let rule = node("doc:w-rule");
        assert_eq!(rule["status_value"], "superseded");
        assert_eq!(rule["status_class"], "retired");
        // The id is untouched by the additive status fields.
        assert_eq!(adr["id"], "doc:x-adr", "status does not re-key the node");
    }

    #[test]
    fn document_node_omits_both_status_fields_when_the_type_has_none() {
        // An exec record, and an ADR predating the H1 status convention (generic
        // checkbox `active`), both serialize NEITHER status field — honest
        // absence, never a fabricated status.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc_with_state("e-exec", "exec", "active"));
        g.upsert_node(doc_with_state("old-adr", "adr", "active"));
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        for id in ["doc:e-exec", "doc:old-adr"] {
            let n = slice
                .nodes
                .iter()
                .find(|n| n["id"] == id)
                .unwrap_or_else(|| panic!("{id} listed"));
            assert!(
                n.get("status_value").is_none(),
                "{id} carries no status_value"
            );
            assert!(
                n.get("status_class").is_none(),
                "{id} carries no status_class"
            );
            // The thin lifecycle is still present — only the per-type status is
            // absent.
            assert!(n.get("lifecycle").is_some(), "{id} keeps its lifecycle");
        }
    }

    #[test]
    fn feature_convergence_node_carries_in_flight_status() {
        // The synthesized feature node carries the in-flight status the same way
        // a document node carries its per-type status (node-visual-richness P01).
        let g = fixture();
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Feature).unwrap();
        let a = slice
            .nodes
            .iter()
            .find(|n| n["id"] == "feature:feature-a")
            .expect("feature-a synthesized");
        assert_eq!(a["status_value"], "in_flight");
        assert_eq!(a["status_class"], "affirmed");
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

    /// A `PlanContainer` step node exactly as `engine-graph::mint_plan_containers`
    /// mints it: `NodeKind::PlanContainer`, `doc_type: None`, key
    /// `{plan_stem}/{container_id}`.
    fn plan_container(plan_stem: &str, container_id: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::PlanContainer {
                plan_stem,
                container_id,
            }),
            kind: NodeKind::PlanContainer,
            key: format!("{plan_stem}/{container_id}"),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec!["feature-a".into()],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    /// An exec-record document node (stem encodes the `W##/P##/S##` container
    /// path), `doc_type: exec`.
    fn exec_doc(stem: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: Some("exec".into()),
            dates: None,
            feature_tags: vec!["feature-a".into()],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    #[test]
    fn plan_container_to_exec_binding_resolves_generated_by_and_never_re_keys() {
        // graph-lineage-dag ADR D3.1/D3.3 (S33/S48): the authored
        // PlanContainer(step) -> exec-record binding edge — whose src node kind is
        // PlanContainer (doc_type None), the shape the OLD doc-type-pair gate
        // dropped — now resolves `generated-by` by reading `node.kind`. And the
        // label is NOT part of the edge stable key: re-deriving the same logical
        // binding yields the same id regardless of the served label.
        let mut g = LinkageGraph::new();
        let step = plan_container("2026-06-16-feature-plan", "W01/P01/S01");
        let exec = exec_doc("2026-06-16-feature-W01-P01-S01");
        let step_id = step.id.clone();
        let exec_id = exec.id.clone();
        g.upsert_node(step);
        g.upsert_node(exec);

        // The binding `References` edge minted exactly as
        // `bind_steps_to_exec_records` mints it: identity-only provenance.
        let provenance = Provenance::CoreGraph {
            payload_hash: String::new(),
            edge_id: format!("{}->{}", step_id.0, "2026-06-16-feature-W01-P01-S01"),
        };
        let binding = Edge {
            id: edge_id(
                &step_id,
                &exec_id,
                &RelationKind::References,
                Tier::Declared,
                &provenance,
            ),
            src: step_id.clone(),
            dst: exec_id.clone(),
            relation: RelationKind::References,
            tier: Tier::Declared,
            confidence: 1.0,
            state: None,
            provenance: provenance.clone(),
            scope: scope(),
            observed_at: 0,
        };
        let binding_id = binding.id.clone();
        engine_graph::ingest(&mut g, binding, EdgeAttrs::default()).unwrap();

        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let edge = slice
            .edges
            .iter()
            .find(|e| e["id"] == binding_id.0)
            .expect("the PlanContainer->exec binding edge is served");
        assert_eq!(
            edge["derivation"], "generated-by",
            "reading node.kind resolves the authored plan->step->exec spine (D3.1)"
        );
        // The relation/tier truth is preserved alongside the label.
        assert_eq!(edge["relation"], "references");

        // D3.3: the served label is NOT an id input. Re-computing the edge id
        // with the SAME endpoints/relation/tier/provenance yields the same id —
        // the `generated-by` label never entered that computation.
        let recomputed = edge_id(
            &step_id,
            &exec_id,
            &RelationKind::References,
            Tier::Declared,
            &provenance,
        );
        assert_eq!(
            recomputed, binding_id,
            "the derivation label never threads into the edge stable key (D3.3)"
        );
    }

    #[test]
    fn contains_hierarchy_edges_resolve_generated_by() {
        // graph-lineage-dag ADR D3.2 (S34): the plan-internal Contains hierarchy
        // (plan -> wave -> phase -> step, PlanContainer endpoints) rides
        // `generated-by` so the authored scaffold is a connected spine, not
        // dropped off-spine. The open-question decision: it carries no distinct
        // sub-label.
        let mut g = LinkageGraph::new();
        let wave = plan_container("2026-06-16-feature-plan", "W01");
        let phase = plan_container("2026-06-16-feature-plan", "W01/P01");
        let wave_id = wave.id.clone();
        let phase_id = phase.id.clone();
        g.upsert_node(wave);
        g.upsert_node(phase);

        let provenance = Provenance::CoreGraph {
            payload_hash: String::new(),
            edge_id: "W01/P01".into(),
        };
        let contains = Edge {
            id: edge_id(
                &wave_id,
                &phase_id,
                &RelationKind::Contains,
                Tier::Declared,
                &provenance,
            ),
            src: wave_id.clone(),
            dst: phase_id.clone(),
            relation: RelationKind::Contains,
            tier: Tier::Declared,
            confidence: 1.0,
            state: None,
            provenance,
            scope: scope(),
            observed_at: 0,
        };
        let contains_id = contains.id.clone();
        engine_graph::ingest(&mut g, contains, EdgeAttrs::default()).unwrap();

        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let edge = slice
            .edges
            .iter()
            .find(|e| e["id"] == contains_id.0)
            .expect("the Contains hierarchy edge is served");
        assert_eq!(
            edge["derivation"], "generated-by",
            "the Contains scaffold rides generated-by (D3.2 / S34)"
        );
        assert_eq!(edge["relation"], "contains");
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

    /// An inferred code-artifact node exactly as `engine-graph` mints it
    /// (code-artifact-nodes ADR D2/D6): `NodeKind::CodeArtifact`, `doc_type`
    /// `code`, a per-scope `Exists` facet, and crucially NO `feature_tags`.
    fn code_node(path: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::CodeArtifact { path, symbol: None }),
            kind: NodeKind::CodeArtifact,
            key: path.into(),
            title: None,
            doc_type: Some("code".into()),
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    #[test]
    fn code_nodes_are_excluded_from_the_constellation_but_join_the_document_pool() {
        // code-artifact-nodes ADR D6: a minted `code:` node carries no
        // feature_tags, so the feature-granularity projection (which groups by
        // feature_tags) NEVER includes it — the unbounded-safe constellation LOD
        // is untouched. At document granularity it joins the scope-faceted pool
        // that MAX_GRAPH_NODES already bounds.
        let mut g = fixture();
        g.upsert_node(code_node("src/graph.rs"));

        // Feature granularity: only the two feature-convergence nodes; the code
        // node contributes to NO convergence and appears nowhere.
        let constellation =
            graph_query(&g, &scope(), Filter::default(), Granularity::Feature).unwrap();
        assert!(
            constellation.nodes.iter().all(|n| n["kind"] == "feature"),
            "the constellation carries only feature-convergence nodes"
        );
        assert!(
            !constellation
                .nodes
                .iter()
                .any(|n| n["id"] == "code:src/graph.rs"),
            "a tagless code node never enters the feature constellation (D6)"
        );

        // Document granularity: the code node is a first-class member of the
        // bounded pool, addressable by its stable `code:` id.
        let document = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let code = document
            .nodes
            .iter()
            .find(|n| n["id"] == "code:src/graph.rs")
            .expect("the code node is served at document granularity");
        assert_eq!(code["kind"], "code-artifact");
        assert_eq!(code["doc_type"], "code");
        // No fabricated feature tags, no lifecycle, no per-type status (D2/D6).
        assert!(
            code["feature_tags"]
                .as_array()
                .is_some_and(|t| t.is_empty()),
            "code nodes carry no feature_tags (D6)"
        );
    }
}
