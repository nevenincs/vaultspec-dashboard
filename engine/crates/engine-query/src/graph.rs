//! The scoped graph query (contract §4): `{scope, filter, granularity}` →
//! a filtered slice of the in-memory graph with the validated filter
//! echoed back normalized.

use std::collections::{BTreeMap, HashMap, HashSet};

use engine_graph::diff::{DiffOp, DiffTruncated, MAX_DIFF_DELTAS};
use engine_graph::{LinkageGraph, MetaEdge, degree_by_tier, lifecycle_in_scope, meta_edges};
use engine_model::{Edge, EdgeId, Node, NodeId, NodeKind, Progress, RelationKind, ScopeRef};
use rayon::prelude::*;
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

/// The unknown-granularity error: carries the offending token so each front
/// door shapes its own envelope (HTTP 400 + tiers, CLI error) off one parse.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownGranularity(pub String);

impl std::fmt::Display for UnknownGranularity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "unknown granularity `{}`", self.0)
    }
}

impl std::error::Error for UnknownGranularity {}

impl Granularity {
    /// Parse the engine-owned granularity parameter (contract §4) from an
    /// optional wire/CLI token: absent or `document` → [`Granularity::Document`]
    /// (the default species the live engine serves), `feature` →
    /// [`Granularity::Feature`], anything else → [`UnknownGranularity`]. This is
    /// the ONE place the granularity vocabulary is parsed, so the `/graph/query`
    /// HTTP route and the CLI `graph` verb cannot drift on the tokens they accept
    /// — the same single-home discipline the bounding helper already follows.
    pub fn from_param(raw: Option<&str>) -> Result<Self, UnknownGranularity> {
        match raw {
            None | Some("document") => Ok(Self::Document),
            Some("feature") => Ok(Self::Feature),
            Some(other) => Err(UnknownGranularity(other.to_string())),
        }
    }
}

impl std::str::FromStr for Granularity {
    type Err = UnknownGranularity;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_param(Some(s))
    }
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

/// Per-generation document-query cache: enriched wire projections plus sorted
/// candidate indexes for the common filter facets. The route owns the cache
/// lifetime; this type is pure over one immutable graph generation.
#[derive(Debug, Clone)]
pub struct DocumentViews {
    pub node_views: HashMap<String, Value>,
    pub edge_views: HashMap<String, Value>,
    pub scope_node_ids: HashSet<String>,
    scope_node_ids_sorted: Vec<String>,
    scope_edge_ids_sorted: Vec<String>,
    nodes_by_kind: HashMap<String, Vec<String>>,
    nodes_by_doc_type: HashMap<String, Vec<String>>,
    nodes_by_feature_tag: HashMap<String, Vec<String>>,
    nodes_by_status: HashMap<String, Vec<String>>,
    nodes_by_plan_tier: HashMap<String, Vec<String>>,
    edges_by_relation: HashMap<String, Vec<String>>,
    edges_by_tier: HashMap<String, Vec<String>>,
}

fn push_index(index: &mut HashMap<String, Vec<String>>, key: impl Into<String>, id: &str) {
    index.entry(key.into()).or_default().push(id.to_string());
}

fn normalize_index(index: &mut HashMap<String, Vec<String>>) {
    for ids in index.values_mut() {
        ids.sort();
        ids.dedup();
    }
}

fn wire_name<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

fn union_index_values(index: &HashMap<String, Vec<String>>, values: &[String]) -> Vec<String> {
    let mut ids = Vec::new();
    for value in values {
        if let Some(bucket) = index.get(value) {
            ids.extend(bucket.iter().cloned());
        }
    }
    ids.sort();
    ids.dedup();
    ids
}

fn intersect_sorted(left: &[String], right: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    let mut j = 0;
    while i < left.len() && j < right.len() {
        match left[i].cmp(&right[j]) {
            std::cmp::Ordering::Less => i += 1,
            std::cmp::Ordering::Greater => j += 1,
            std::cmp::Ordering::Equal => {
                out.push(left[i].clone());
                i += 1;
                j += 1;
            }
        }
    }
    out
}

fn intersect_candidate(
    current: Option<Vec<String>>,
    index: &HashMap<String, Vec<String>>,
    values: &[String],
) -> Option<Vec<String>> {
    if values.is_empty() {
        return current;
    }
    let next = union_index_values(index, values);
    Some(match current {
        Some(existing) => intersect_sorted(&existing, &next),
        None => next,
    })
}

impl DocumentViews {
    fn candidate_node_ids(&self, filter: &Filter) -> Vec<String> {
        let mut ids = None;
        ids = intersect_candidate(ids, &self.nodes_by_kind, &filter.kinds);
        ids = intersect_candidate(ids, &self.nodes_by_doc_type, &filter.doc_types);
        ids = intersect_candidate(ids, &self.nodes_by_feature_tag, &filter.feature_tags);
        ids = intersect_candidate(ids, &self.nodes_by_status, &filter.statuses);
        ids = intersect_candidate(ids, &self.nodes_by_plan_tier, &filter.plan_tiers);
        ids.unwrap_or_else(|| self.scope_node_ids_sorted.clone())
    }

    fn candidate_edge_ids(&self, filter: &Filter) -> Vec<String> {
        let mut ids = None;
        ids = intersect_candidate(ids, &self.edges_by_relation, &filter.relations);
        let active_tiers: Vec<String> = filter
            .tiers
            .iter()
            .filter_map(|(tier, enabled)| enabled.then_some(tier.clone()))
            .collect();
        ids = intersect_candidate(ids, &self.edges_by_tier, &active_tiers);
        ids.unwrap_or_else(|| self.scope_edge_ids_sorted.clone())
    }
}

/// Whether a node is a DISPLAYABLE knowledge node (terminology-standardization
/// ADR D5/D6; index-node-exclusion ADR D3): `code` artifacts
/// (`NodeKind::CodeArtifact`) are never emitted as knowledge-graph nodes or
/// `/vault-tree` rows. `index` doc-type documents (generated feature indexes) are
/// now dropped at ingest and never become nodes at all (index-node-exclusion ADR
/// D1), so the `index` branch below is a DEFENSIVE net only — it cannot fire on
/// the live path, but is retained to defend the display boundary against any
/// future producer that re-mints an index node (the producer-drop + consumer-
/// defense belt-and-braces the bounded-query rules use). The id/kind are
/// untouched — this is a pure filter.
pub fn is_displayable_node(node: &Node) -> bool {
    // The CODE-corpus kind is fenced from the vault graph (codebase-graphing
    // ADR D1: the corpora never mix; the code corpus is served only through its
    // own query path). Files are the code corpus's ONLY node kind
    // (code-graph-files-only): the former directory `CodeModule` kind is
    // deleted from the model, so this one arm covers the whole fence.
    if node.kind == NodeKind::CodeArtifact {
        return false;
    }
    if node.doc_type.as_deref() == Some("index") {
        return false;
    }
    true
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
pub(crate) fn node_view(graph: &LinkageGraph, scope: &ScopeRef, node: &Node) -> Value {
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
///
/// This is the SHARED §4 edge projection: both `/graph/query` (the document and
/// feature slices) AND `/nodes/{id}/neighbors` (the ego network) serialize their
/// edges through it, so the two front doors can never drift into two edge wire
/// shapes (mock-mirrors-live-wire-shape) and the per-edge slimming below applies
/// uniformly — an ego over a hub node ships tens of thousands of edges, so the
/// dead-weight strip matters there just as much as on the document slice.
pub fn edge_view(graph: &LinkageGraph, edge: &Edge) -> Value {
    let mut view = serde_json::to_value(edge).expect("edge serializes");
    view["derivation"] = match derivation_for_edge(graph, edge) {
        Some(label) => Value::String(label.to_string()),
        None => Value::Null,
    };
    // Slim the graph-wire edge (perf: the document slice was ~21 MB of edges,
    // ~579 B/edge, dominating a 22 MB body). Three fields are dead weight the
    // client never reads and that bloat every one of tens of thousands of edges:
    //   - `scope`: identical to the query scope on EVERY edge (the whole slice is
    //     one scope) — pure per-edge redundancy; the mock never emits it, so
    //     dropping it also converges mock↔live (mock-mirrors-live-wire-shape).
    //   - `provenance`: the full provenance object is graph-render dead weight —
    //     the renderer draws a tier-coloured src→dst line and never reads it; the
    //     stable edge id already encodes provenance identity engine-side
    //     (provenance-stable-keys-are-identity-bearing), so the wire need not
    //     re-ship it. Edge detail is fetched on demand, not bulk-shipped per edge.
    //   - `observed_at`: the per-edge ingest timestamp the renderer never reads
    //     (verified: nothing in the SPA reads `edge.observed_at`; the live delta
    //     clock rides `last_seq`, not per-edge stamps). ~13 B × tens of thousands.
    // Confidence is rounded to 3 dp: the f32→JSON cast emitted full f64 precision
    // (e.g. 0.8999999761581421, 18 B) for a value the client only buckets.
    if let Some(obj) = view.as_object_mut() {
        obj.remove("scope");
        obj.remove("provenance");
        obj.remove("observed_at");
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

/// Build the UNFILTERED feature-convergence (constellation) nodes for a scope:
/// the filter-independent aggregation — one pass over the scope's member
/// documents, grouping by feature tag and folding each member's degree-by-tier
/// and lifecycle. This is the dominant fixed cost of a Feature query (it scans
/// the whole corpus regardless of how few features result), so the API
/// `ScopeCell` memoizes it per graph generation exactly like `build_document_views`
/// / `meta_edges`, and the default (unfiltered) constellation poll is then served
/// without re-aggregating the corpus every request. A FILTERED feature query
/// still flows through `graph_query`, because the filter narrows the MEMBER set
/// pre-aggregation (it changes each feature's member_count/degree).
pub fn build_feature_nodes(graph: &LinkageGraph, scope: &ScopeRef) -> Vec<Value> {
    let mut matched: Vec<&Node> = graph
        .nodes()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .collect();
    matched.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    feature_nodes(graph, scope, &matched)
}

/// Build the stem-sorted `/vault-tree` document rows for a scope: one list-shape
/// row per `doc:` node (stem, node id, feature tags, the §4 list fields, and the
/// scope's plan checkbox progress). This is a filter-independent projection that
/// only changes when the graph is rebuilt, so the API `ScopeCell` memoizes it per
/// generation (the left-rail Tree view polled `/vault-tree` and re-projected +
/// re-sorted all doc nodes on EVERY request). Sorted by borrowed stem — no
/// per-comparison String allocation — and paginated by the caller per request.
pub fn build_vault_tree_rows(graph: &LinkageGraph, scope: &ScopeRef) -> Vec<Value> {
    let mut rows: Vec<Value> = graph
        .nodes()
        .filter(|n| n.id.0.starts_with("doc:"))
        // terminology-standardization ADR D5: `index` documents are never
        // surfaced as rail rows (they still exist on disk / in the index).
        .filter(|n| is_displayable_node(n))
        .map(|n| {
            // Plan lifecycle progress for THIS scope, read from the SAME
            // `lifecycle_in_scope` facet the node-graph projection consumes — a
            // read-and-infer projection, present only on plan rows that carry
            // checkbox progress and truthfully absent everywhere else.
            let progress = lifecycle_in_scope(n, scope)
                .and_then(|l| l.progress)
                .map(|p| json!({ "done": p.done, "total": p.total }));
            json!({
                "stem": n.key,
                "node_id": n.id.0,
                "feature_tags": n.feature_tags,
                "title": n.title,
                "doc_type": n.doc_type,
                "dates": n.dates,
                "status": n.status,
                "tier": n.tier,
                "progress": progress,
                // Ingest-measured document weight (left-rail-tree-controls ADR
                // D2): honestly absent (null) when the node carries none.
                "size": n.size,
            })
        })
        .collect();
    rows.sort_by(|a, b| {
        a["stem"]
            .as_str()
            .unwrap_or_default()
            .cmp(b["stem"].as_str().unwrap_or_default())
    });
    rows
}

/// Build the path-sorted `/code-files` rows: one minimal row per `code:` FILE
/// node projected off the code corpus's `LinkageGraph` (never the DOI-bounded
/// graph projection), so a client can hold the COMPLETE code-file listing and
/// narrow it (search-providers ADR: `files (code)` is a client narrow over a
/// complete set, never the capped graph slice). Every admitted source file
/// mints exactly one `code:{path}` node (files-only representation), so the row
/// count equals the corpus's file count. The row is deliberately minimal —
/// `path` (the node key), `node_id` (so a hit is directly navigable), `title`
/// (the file's display title, honestly null when unset), and `lang` (the wire
/// language token derived from the path extension via the one
/// `engine_model::language_token` source of truth, null for an unclassified
/// extension). Sorted by borrowed path — no per-comparison allocation — a
/// filter-independent projection the API cell memoizes per code generation
/// (mirroring `build_vault_tree_rows`); the handler paginates the slice per
/// request.
pub fn build_code_file_rows(graph: &LinkageGraph) -> Vec<Value> {
    let mut rows: Vec<Value> = graph
        .nodes()
        .filter(|n| n.kind == NodeKind::CodeArtifact)
        .map(|n| {
            json!({
                "path": n.key,
                "node_id": n.id.0,
                "title": n.title,
                "lang": engine_model::language_token(&n.key),
            })
        })
        .collect();
    rows.sort_by(|a, b| {
        a["path"]
            .as_str()
            .unwrap_or_default()
            .cmp(b["path"].as_str().unwrap_or_default())
    });
    rows
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
    views: &DocumentViews,
) -> Result<GraphSlice, FilterError> {
    graph_query_inner(graph, scope, filter, granularity, Some(views))
}

/// Build every node's and (scope-local) edge's enriched view once — the unit the
/// API layer caches per graph generation for [`graph_query_cached`]. Pure over an
/// immutable graph generation, so the result is safe to memoize keyed on it.
pub fn build_document_views(graph: &LinkageGraph, scope: &ScopeRef) -> DocumentViews {
    // The enriched node views AND the in-scope node-id set (backend-hotpath-
    // hardening F4); the latter is what the Document arm's broken-link endpoint
    // check needs, cached here to remove a second full node scan per request.
    //
    // `node_view` / `edge_view` are PURE read-only projections (degree-by-tier
    // adjacency walk + ontology + status + serde serialize) — the dominant cost of
    // the once-per-generation COLD build (~6s for a 3000-node / 36k-edge scope,
    // what a first Detail drill-in waits on). The graph is an immutable Arc
    // snapshot here, so deriving them across the rayon pool is data-safe and cuts
    // that wall-clock ~N-cores× with IDENTICAL output: the views are unordered
    // maps and the id set is order-independent, so the wire result (sorted
    // downstream by salience) is byte-for-byte unchanged.
    let nodes: Vec<&Node> = graph.nodes().collect();
    let node_views: HashMap<String, Value> = nodes
        .par_iter()
        .map(|n| (n.id.0.clone(), node_view(graph, scope, n)))
        .collect();
    let scope_node_ids: HashSet<String> = nodes
        .par_iter()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .map(|n| n.id.0.clone())
        .collect();
    let mut scope_node_ids_sorted: Vec<String> = scope_node_ids.iter().cloned().collect();
    scope_node_ids_sorted.sort();

    let mut nodes_by_kind = HashMap::new();
    let mut nodes_by_doc_type = HashMap::new();
    let mut nodes_by_feature_tag = HashMap::new();
    let mut nodes_by_status = HashMap::new();
    let mut nodes_by_plan_tier = HashMap::new();
    for node in nodes
        .iter()
        .copied()
        .filter(|n| scope_node_ids.contains(n.id.0.as_str()))
    {
        push_index(&mut nodes_by_kind, wire_name(&node.kind), &node.id.0);
        if let Some(doc_type) = &node.doc_type {
            push_index(&mut nodes_by_doc_type, doc_type, &node.id.0);
        }
        for tag in &node.feature_tags {
            push_index(&mut nodes_by_feature_tag, tag, &node.id.0);
        }
        if let Some(status) = &node.status {
            push_index(&mut nodes_by_status, status, &node.id.0);
        }
        if let Some(tier) = &node.tier {
            push_index(&mut nodes_by_plan_tier, tier, &node.id.0);
        }
    }
    normalize_index(&mut nodes_by_kind);
    normalize_index(&mut nodes_by_doc_type);
    normalize_index(&mut nodes_by_feature_tag);
    normalize_index(&mut nodes_by_status);
    normalize_index(&mut nodes_by_plan_tier);

    let edges: Vec<&engine_graph::StoredEdge> = graph.edges().collect();
    let edge_views: HashMap<String, Value> = edges
        .par_iter()
        .filter(|s| &s.edge.scope == scope)
        .map(|s| (s.edge.id.0.clone(), edge_view(graph, &s.edge)))
        .collect();
    let mut scope_edge_ids_sorted: Vec<String> = edge_views.keys().cloned().collect();
    scope_edge_ids_sorted.sort();
    let mut edges_by_relation = HashMap::new();
    let mut edges_by_tier = HashMap::new();
    for stored in edges.iter().copied().filter(|s| &s.edge.scope == scope) {
        push_index(
            &mut edges_by_relation,
            stored.edge.relation.as_str(),
            &stored.edge.id.0,
        );
        push_index(
            &mut edges_by_tier,
            wire_name(&stored.edge.tier),
            &stored.edge.id.0,
        );
    }
    normalize_index(&mut edges_by_relation);
    normalize_index(&mut edges_by_tier);

    DocumentViews {
        node_views,
        edge_views,
        scope_node_ids,
        scope_node_ids_sorted,
        scope_edge_ids_sorted,
        nodes_by_kind,
        nodes_by_doc_type,
        nodes_by_feature_tag,
        nodes_by_status,
        nodes_by_plan_tier,
        edges_by_relation,
        edges_by_tier,
    }
}

fn graph_query_inner(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    filter: Filter,
    granularity: Granularity,
    views: Option<&DocumentViews>,
) -> Result<GraphSlice, FilterError> {
    let filter = filter.validated()?;

    // Borrow matched nodes (perf ADR D3): node_view / feature_nodes only read
    // each node and re-serialize it into a Value, so cloning the whole match set
    // up front was a redundant deep Node clone per node (id/key/title strings +
    // facets Vec) on every request. Sorting borrowed refs is cheap.
    let candidate_node_ids;
    let mut matched: Vec<&Node> = match views {
        Some(index) => {
            candidate_node_ids = index.candidate_node_ids(&filter);
            candidate_node_ids
                .iter()
                .filter_map(|id| graph.node(&NodeId(id.clone())))
                .filter(|n| filter.matches_node(n))
                .collect()
        }
        None => graph
            .nodes()
            .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
            .filter(|n| filter.matches_node(n))
            .collect(),
    };
    // terminology-standardization ADR D5/D6: `index` documents and `code`
    // artifacts are not displayable knowledge nodes — drop them from the
    // candidate set BEFORE either granularity projects, so neither the document
    // slice, the feature-convergence aggregation, nor `kept` ever sees them. An
    // edge touching an excluded but in-scope node then fails `endpoint_ok` below
    // and is pruned, keeping the returned subgraph self-consistent.
    matched.retain(|n| is_displayable_node(n));
    // Health facet (filter-controls campaign): orphaned/dangling are graph-context
    // (they read a node's incident edges), so they are applied here after the
    // per-node `matches_node` pass rather than inside it.
    if !filter.health.is_empty() {
        matched.retain(|n| filter.matches_health(graph, n));
    }
    // Plan-state facet: lifecycle state is per-scope, so this is graph-context
    // too — applied here where `scope` is in hand (the SAME `lifecycle_in_scope`
    // projection the slice serves), never derived in the frontend. A node with no
    // lifecycle in this scope is dropped when the facet is set; edges to dropped
    // nodes are pruned below (`endpoint_ok`), keeping the subgraph self-consistent.
    if !filter.plan_states.is_empty() {
        matched.retain(|n| filter.matches_plan_state(n, scope));
    }
    matched.sort_by(|a, b| a.id.0.cmp(&b.id.0));

    let (nodes, edges, meta) = match granularity {
        Granularity::Document => {
            // Self-consistent subgraph (graph-queries-are-bounded-by-default):
            // a node filter (e.g. `feature_tags`) narrows the kept node set far
            // below `MAX_GRAPH_NODES`, so a cross-feature edge whose other
            // endpoint is a REAL node that was filtered out would dangle — an
            // unbounded, self-inconsistent payload `bound_slice` never prunes
            // (it only acts on cap truncation > MAX_GRAPH_NODES). Drop such an
            // edge HERE. An edge to a genuinely unresolved/broken target is kept
            // ONLY under the explicitly-requested broken lens (see `endpoint_ok`
            // below); by default it is dropped too, as a dangling link the client
            // never renders (audit W02P05-201, narrowed by the 2026-06-21 prune).
            //
            // FILE-BROWSER SCOPE: this is the `.vault/` document browser's graph, so
            // it must contain ONLY authored `.vault/` DOCUMENTS - one node per
            // document. The plan-container (wave/phase/step) explosion and rule
            // (`.vaultspec/` FIRMWARE) nodes are not `.vault/` content and are
            // excluded from the document slice. The rich LinkageGraph still carries
            // them for lineage / plan-status views; this slice is documents only.
            // Edges to the excluded nodes drop out via the `endpoint_ok` check below
            // (their endpoints are no longer in `kept`).
            let doc_nodes: Vec<&Node> = matched
                .iter()
                .copied()
                .filter(|n| n.kind == NodeKind::Document)
                .collect();
            let kept: HashSet<&str> = doc_nodes.iter().map(|n| n.id.0.as_str()).collect();
            // A served edge must connect two KEPT nodes — only then does the
            // client render it. Any other endpoint makes the edge pure wire waste
            // the client just filters out (user directive 2026-06-21: never serve
            // an edge only to be filtered out). The ONE exception is the
            // explicitly-requested broken lens (`structural_state` ∋ "broken"): an
            // edge to a genuinely UNRESOLVED target — not a real graph node at all
            // — is that lens's subject and may dangle (audit W02P05-201).
            // Membership is tested against the WHOLE graph, not the scope-faceted
            // set, so a real-but-excluded node (a plan-container wave/phase/step, a
            // code/index node, a cross-scope node) is never mistaken for
            // "unresolved" and its edge is dropped in both cases.
            let broken_lens = filter.structural_state.iter().any(|s| s == "broken");
            let endpoint_ok = |id: &str| {
                kept.contains(id) || (broken_lens && graph.node(&NodeId(id.to_string())).is_none())
            };
            let candidate_edge_ids;
            let mut edges: Vec<&Edge> = match views {
                Some(index) => {
                    candidate_edge_ids = index.candidate_edge_ids(&filter);
                    candidate_edge_ids
                        .iter()
                        .filter_map(|id| graph.edge(&EdgeId(id.clone())))
                        .filter(|s| filter.matches_edge(s))
                        .map(|s| &s.edge)
                        .filter(|e| endpoint_ok(e.src.0.as_str()) && endpoint_ok(e.dst.0.as_str()))
                        .collect()
                }
                None => graph
                    .edges()
                    .filter(|s| &s.edge.scope == scope)
                    .filter(|s| filter.matches_edge(s))
                    .map(|s| &s.edge)
                    .filter(|e| endpoint_ok(e.src.0.as_str()) && endpoint_ok(e.dst.0.as_str()))
                    .collect(),
            };
            edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
            let edge_view_list = edges
                .iter()
                .map(|&e| {
                    views
                        .and_then(|index| index.edge_views.get(&e.id.0).cloned())
                        .unwrap_or_else(|| edge_view(graph, e))
                })
                .collect();
            let node_view_list = doc_nodes
                .iter()
                .map(|&n| {
                    views
                        .and_then(|index| index.node_views.get(&n.id.0).cloned())
                        .unwrap_or_else(|| node_view(graph, scope, n))
                })
                .collect();
            (node_view_list, edge_view_list, Vec::new())
        }
        // Constellation granularity (contract §4, ADR D4.1): synthesized
        // feature-convergence nodes plus engine-aggregated meta-edges —
        // the GUI never flattens doc-level edges client-side.
        Granularity::Feature => {
            // Self-consistent constellation (graph-queries-are-bounded-by-default,
            // the feature analogue of the Document branch's endpoint pruning): a
            // node filter narrows the synthesized feature set, so a meta-edge
            // whose endpoint is a feature that was filtered OUT would dangle. The
            // GUI folds meta_edges -> edges, so a dangling meta-edge renders an
            // edge to an absent node. Keep only meta-edges with BOTH endpoints in
            // the kept feature set. Unfiltered, every feature is kept, so this is
            // a no-op for the default constellation poll.
            let nodes = feature_nodes(graph, scope, &matched);
            let kept: HashSet<&str> = nodes
                .iter()
                .filter_map(|n| n.get("id").and_then(Value::as_str))
                .collect();
            let meta = meta_edges(graph)
                .into_iter()
                .filter(|m| kept.contains(m.src.as_str()) && kept.contains(m.dst.as_str()))
                .collect();
            (nodes, Vec::new(), meta)
        }
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
/// document deltas), advancing `seq` from `seq_start`. Returns the entries, the
/// last seq used, and an optional truncation block. The engine owns this
/// aggregation (contract §4: the GUI never derives the constellation from
/// document edges); meta-edge identity is the endpoint pair, stable across
/// re-derivation (provenance-stable keys).
///
/// Bounded the SAME way the document diff is (GIR-014, sharing
/// [`MAX_DIFF_DELTAS`] / [`DiffTruncated`] with `engine_graph::diff`): a diff
/// whose feature-node + meta-edge delta count exceeds the ceiling DEGRADES TO
/// KEYFRAME-ONLY — empty `entries` plus a truncation block — because a partial
/// mutation log is not self-consistent. Both diff granularities therefore share
/// ONE bounding contract, and the client answers either with a re-keyframe.
pub fn feature_delta(
    old: &LinkageGraph,
    new: &LinkageGraph,
    scope: &ScopeRef,
    t: i64,
    seq_start: u64,
) -> (Vec<Value>, u64, Option<DiffTruncated>) {
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
    // `total` counts EVERY changed element so the truncation block reports the
    // true size; `entries` is capped at the ceiling so allocation stays bounded
    // even for an over-ceiling diff that will be discarded (mirrors the document
    // `diff`; bounded-by-default-for-every-accumulator).
    let mut total: usize = 0;
    let mut push = |op: DiffOp, node: Option<&Value>, edge: Option<&Value>| {
        total += 1;
        if entries.len() >= MAX_DIFF_DELTAS {
            return;
        }
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

    // Over the ceiling: degrade to KEYFRAME-ONLY (GIR-014), the same contract the
    // document diff uses — a partial feature/meta-edge mutation log is not
    // self-consistent, so emit no deltas plus an honest truncation block and let
    // the client re-keyframe via `/graph/asof`.
    if total > MAX_DIFF_DELTAS {
        return (
            Vec::new(),
            seq_start,
            Some(DiffTruncated {
                total_deltas: total,
                returned_deltas: 0,
                reason: format!(
                    "feature diff delta ceiling ({MAX_DIFF_DELTAS}): a partial mutation \
                     log is not self-consistent — the client re-keyframes via /graph/asof"
                ),
            }),
        );
    }

    let last_seq = seq.saturating_sub(1).max(seq_start);
    (entries, last_seq, None)
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
            size: None,
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
    fn health_filter_selects_dangling_and_orphaned_nodes() {
        // filter-controls campaign: the health facet narrows by graph-derived
        // conditions — `dangling` (a broken outgoing edge) and `orphaned` (no
        // incoming edge) — applied in graph_query (graph context), and an
        // out-of-set condition 400s.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "f")); // → b (resolved) and → gone (broken)
        g.upsert_node(doc("b-adr", "f")); // has incoming from a-plan: healthy
        g.upsert_node(doc("c-research", "f")); // no edges: orphaned, not dangling
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "b-adr", ResolutionState::Resolved, 0.9),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "gone", ResolutionState::Broken, 0.0),
            EdgeAttrs::default(),
        )
        .unwrap();

        let a = node_id(&CanonicalKey::Document { stem: "a-plan" }).0;
        let c = node_id(&CanonicalKey::Document { stem: "c-research" }).0;
        let ids = |slice: GraphSlice| {
            let mut v: Vec<String> = slice
                .nodes
                .iter()
                .map(|n| n["id"].as_str().unwrap().to_string())
                .collect();
            v.sort();
            v
        };

        // dangling → only a-plan (it owns the broken outgoing edge).
        let dangling = Filter {
            health: vec!["dangling".into()],
            ..Default::default()
        };
        assert_eq!(
            ids(graph_query(&g, &scope(), dangling, Granularity::Document).unwrap()),
            vec![a.clone()]
        );

        // orphaned → a-plan and c-research (nothing links to them); b-adr is
        // excluded because a-plan links to it.
        let orphaned = Filter {
            health: vec!["orphaned".into()],
            ..Default::default()
        };
        let mut want = vec![a.clone(), c.clone()];
        want.sort();
        assert_eq!(
            ids(graph_query(&g, &scope(), orphaned, Granularity::Document).unwrap()),
            want
        );

        // The vocabulary enumerates the conditions actually present, canonical order.
        assert_eq!(
            crate::filter::vocabulary(&g).health,
            vec!["dangling".to_string(), "orphaned".to_string()]
        );

        // An out-of-set health condition 400s loud.
        let bad: Filter = serde_json::from_str(r#"{"health": ["rotten"]}"#).unwrap();
        assert!(matches!(
            bad.validated(),
            Err(crate::filter::FilterError::UnknownHealth(_))
        ));
    }

    #[test]
    fn cached_document_query_is_byte_identical_to_uncached() {
        // A1 correctness invariant: reusing the per-generation enriched views via
        // graph_query_cached must produce exactly the same slice as recomputing
        // them in graph_query — both filtered and unfiltered.
        let g = fixture();
        let views = build_document_views(&g, &scope());
        for filter in [
            Filter::default(),
            serde_json::from_str(r#"{"feature_tags": ["feature-a"]}"#).unwrap(),
            serde_json::from_str(r#"{"structural_state": ["resolved"]}"#).unwrap(),
        ] {
            let uncached =
                graph_query(&g, &scope(), filter.clone(), Granularity::Document).unwrap();
            let cached =
                graph_query_cached(&g, &scope(), filter, Granularity::Document, &views).unwrap();
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
    fn document_doc_type_filter_returns_a_self_consistent_subgraph() {
        // unified-filter-plane D2/D4: the promoted graph category toggle and the
        // time-travelled snapshot drive the `doc_types` facet through this same
        // `graph_query`. A `doc_types` descent must narrow the node set AND stay
        // self-consistent — a resolved edge to a REAL node that the facet filtered
        // out is dropped, never left dangling (graph-queries-are-bounded-by-default).
        let g = fixture();
        // Keep only `plan` documents: `a-plan` stays, `b-adr` is filtered out.
        let filter: Filter = serde_json::from_str(r#"{"doc_types": ["plan"]}"#).unwrap();
        let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
        let kept: std::collections::HashSet<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        let a_plan = node_id(&CanonicalKey::Document { stem: "a-plan" }).0;
        let b_adr = node_id(&CanonicalKey::Document { stem: "b-adr" }).0;
        assert!(kept.contains(a_plan.as_str()), "the plan node is kept");
        assert!(
            !kept.contains(b_adr.as_str()),
            "the adr node is filtered out by the doc_types facet"
        );
        // The resolved `a-plan -> b-adr` edge dangled to a real-but-filtered node,
        // so it is dropped; no kept edge references a node absent from the slice.
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
    fn filtered_feature_granularity_prunes_dangling_meta_edges() {
        // graph-queries-are-bounded-by-default (the feature analogue of the
        // Document branch's endpoint pruning): a `feature_tags` filter narrows the
        // synthesized feature set to feature-a, so the lone cross-feature
        // meta-edge (feature-a -> feature-b) would dangle once feature-b is
        // filtered out. The constellation must stay self-consistent — the dangling
        // meta-edge is pruned, not shipped — because the GUI folds
        // meta_edges -> edges, and a dangling one renders an edge to an absent
        // node. (Unfiltered, both features are kept and the meta-edge survives:
        // feature_granularity_returns_meta_edges_not_doc_edges covers that.)
        let g = fixture();
        let filter: Filter = serde_json::from_str(r#"{"feature_tags": ["feature-a"]}"#).unwrap();
        let slice = graph_query(&g, &scope(), filter, Granularity::Feature).unwrap();
        assert_eq!(slice.nodes.len(), 1, "only feature-a survives the filter");
        assert_eq!(slice.nodes[0]["id"], "feature:feature-a");
        assert!(
            slice.meta_edges.is_empty(),
            "a meta-edge to a filtered-out feature must not dangle: {:?}",
            slice.meta_edges
        );
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
            size: None,
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
            size: None,
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
            size: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    #[test]
    fn plan_container_to_exec_binding_is_pruned_but_keeps_its_stable_key() {
        // Documents-only slice (commit 60f6779d21, narrowed by the 2026-06-21
        // wire-waste prune): the PlanContainer(step) -> exec-record binding edge
        // has a PlanContainer src, which is NOT a `.vault/` document and is
        // excluded from the document slice — so the binding edge is PRUNED rather
        // than served to dangle against an absent node the client only filters out
        // (the lineage representation that once consumed the `generated-by` spine
        // is retired). Its stable key still never re-keys (graph-lineage-dag ADR
        // D3.3): the derivation label was never an id input.
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

        // Documents-only slice: the PlanContainer src excludes the binding edge.
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        assert!(
            !slice.edges.iter().any(|e| e["id"] == binding_id.0),
            "the PlanContainer->exec binding edge is pruned from the documents-only slice"
        );

        // D3.3: the stable key never re-keys. Re-computing the edge id with the
        // SAME endpoints/relation/tier/provenance yields the same id.
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
    fn contains_hierarchy_edges_are_pruned_from_the_documents_only_slice() {
        // Documents-only slice (commit 60f6779d21, narrowed by the 2026-06-21
        // wire-waste prune): the plan-internal Contains hierarchy
        // (plan -> wave -> phase -> step) has PlanContainer endpoints, none of
        // which are `.vault/` documents. The document slice serves documents only,
        // so the hierarchy edges are pruned rather than served to dangle (the
        // lineage representation that once consumed the spine is retired).
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
        assert!(
            !slice.edges.iter().any(|e| e["id"] == contains_id.0),
            "Contains hierarchy edges (PlanContainer endpoints) are pruned from the documents-only slice"
        );
    }

    /// An `index` doc-type document node (a generated feature index): a real
    /// `doc:` node on disk, but never a displayable knowledge node (ADR D5).
    fn index_doc(stem: &str, feature: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: Some("index".into()),
            dates: None,
            feature_tags: vec![feature.into()],
            status: None,
            tier: None,
            size: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    /// A `code` artifact node (`NodeKind::CodeArtifact`): a source file in the
    /// index, but never a displayable knowledge node (ADR D6).
    fn code_artifact(path: &str, feature: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::CodeArtifact { path, symbol: None }),
            kind: NodeKind::CodeArtifact,
            key: path.into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![feature.into()],
            status: None,
            tier: None,
            size: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    #[test]
    fn vault_tree_rows_exclude_index_documents() {
        // terminology-standardization ADR D5: an `index` document is a real
        // `doc:` node but must never appear as a `/vault-tree` row.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        g.upsert_node(index_doc("feature-a.index", "feature-a"));
        let rows = build_vault_tree_rows(&g, &scope());
        let stems: Vec<&str> = rows.iter().filter_map(|r| r["stem"].as_str()).collect();
        assert!(
            stems.contains(&"a-plan"),
            "the knowledge document still rows"
        );
        assert!(
            !stems.contains(&"feature-a.index"),
            "the index document is excluded from vault-tree rows: {stems:?}"
        );
        assert!(
            rows.iter().all(|r| r["doc_type"] != "index"),
            "no row carries the index doc_type"
        );
    }

    #[test]
    fn vault_tree_rows_carry_size_and_absent_size_serves_null() {
        // left-rail-tree-controls ADR D2: the ingest-measured weight rides the
        // row; a node without one (older cache, projection) serves an honest
        // null, never a fabricated zero.
        let mut g = LinkageGraph::new();
        let mut sized = doc("a-sized", "feature-a");
        sized.size = Some(engine_model::DocSize::measure("four words of body"));
        g.upsert_node(sized);
        g.upsert_node(doc("b-sizeless", "feature-a"));
        let rows = build_vault_tree_rows(&g, &scope());
        let sized_row = rows.iter().find(|r| r["stem"] == "a-sized").unwrap();
        assert_eq!(sized_row["size"]["bytes"], 18);
        assert_eq!(sized_row["size"]["words"], 4);
        let sizeless_row = rows.iter().find(|r| r["stem"] == "b-sizeless").unwrap();
        assert!(
            sizeless_row["size"].is_null(),
            "absent weight serves null: {sizeless_row}"
        );
    }

    /// A titled `code` artifact node — mirrors `code_artifact` but carries a
    /// display title, so the projection's title pass-through is exercised.
    fn titled_code_artifact(path: &str, title: &str) -> Node {
        let mut n = code_artifact(path, "feature-a");
        n.title = Some(title.into());
        n
    }

    #[test]
    fn code_file_rows_project_only_code_nodes_sorted_by_path() {
        // The projection is the complete code-file listing: every `code:` FILE
        // node, and NOTHING else (no `doc:` or `index` node bleeds in). Rows
        // are path-sorted for cursor determinism.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        g.upsert_node(index_doc("feature-a.index", "feature-a"));
        g.upsert_node(code_artifact("src/zeta.rs", "feature-a"));
        g.upsert_node(code_artifact("src/alpha.ts", "feature-a"));
        let rows = build_code_file_rows(&g);
        let paths: Vec<&str> = rows.iter().filter_map(|r| r["path"].as_str()).collect();
        assert_eq!(
            paths,
            vec!["src/alpha.ts", "src/zeta.rs"],
            "only code files, sorted by path"
        );
        // The node id rides each row so a hit is directly navigable.
        assert_eq!(rows[0]["node_id"], "code:src/alpha.ts");
        assert_eq!(rows[1]["node_id"], "code:src/zeta.rs");
    }

    #[test]
    fn code_file_rows_derive_language_and_pass_title_honestly() {
        // `lang` derives from the path extension via the one language_token
        // source of truth; an unclassified extension serves a null lang. The
        // title passes through, honestly null when the node carries none.
        let mut g = LinkageGraph::new();
        g.upsert_node(titled_code_artifact("app/main.py", "main"));
        g.upsert_node(code_artifact("docs/readme.md", "feature-a"));
        let rows = build_code_file_rows(&g);
        let py = rows.iter().find(|r| r["path"] == "app/main.py").unwrap();
        assert_eq!(py["lang"], "python");
        assert_eq!(py["title"], "main");
        let md = rows.iter().find(|r| r["path"] == "docs/readme.md").unwrap();
        assert_eq!(
            md["lang"],
            Value::Null,
            "unclassified extension → null lang"
        );
        assert_eq!(
            md["title"],
            Value::Null,
            "no title → null, never fabricated"
        );
    }

    #[test]
    fn code_file_rows_empty_on_a_graph_with_no_code() {
        // A vault-only graph (no code corpus) projects zero rows — the honest
        // empty listing, never a 5xx or a fabricated entry.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        assert!(build_code_file_rows(&g).is_empty());
    }

    #[test]
    fn graph_query_excludes_index_and_code_nodes() {
        // terminology-standardization ADR D5/D6: an `index` document and a
        // `code` artifact are real graph nodes but are never emitted as
        // knowledge-graph nodes by the document slice.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        g.upsert_node(index_doc("feature-a.index", "feature-a"));
        g.upsert_node(code_artifact("src/main.rs", "feature-a"));
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let ids: Vec<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        assert!(
            ids.contains(&"doc:a-plan"),
            "the knowledge document is kept"
        );
        assert!(
            !ids.iter().any(|id| id.starts_with("code:")),
            "no code-artifact node is emitted: {ids:?}"
        );
        assert!(
            !ids.contains(&"doc:feature-a.index"),
            "the index document is not emitted: {ids:?}"
        );
        assert!(
            slice.nodes.iter().all(|n| n["doc_type"] != "index"),
            "no emitted node carries the index doc_type"
        );
    }

    #[test]
    fn graph_query_drops_edges_to_an_excluded_node() {
        // terminology-standardization ADR D5/D6 + graph-queries-are-bounded:
        // when an `index`/`code` node is excluded from the kept node set, any
        // edge whose endpoint is that excluded (but in-scope) node must also be
        // dropped, so the returned subgraph stays self-consistent (only edges
        // among kept nodes).
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        g.upsert_node(index_doc("feature-a.index", "feature-a"));
        // a-plan -> feature-a.index: a resolved edge to a REAL in-scope node
        // that is excluded as non-displayable. It must not survive as a dangling
        // edge to an absent node.
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "feature-a.index", ResolutionState::Resolved, 0.9),
            EdgeAttrs::default(),
        )
        .unwrap();
        let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        let kept: std::collections::HashSet<&str> = slice
            .nodes
            .iter()
            .filter_map(|n| n["id"].as_str())
            .collect();
        let index_id = node_id(&CanonicalKey::Document {
            stem: "feature-a.index",
        })
        .0;
        assert!(
            !kept.contains(index_id.as_str()),
            "the index node is excluded"
        );
        for e in &slice.edges {
            for key in ["src", "dst"] {
                let id = e[key].as_str().expect("endpoint serialized");
                assert_ne!(
                    id,
                    index_id.as_str(),
                    "no served edge references the excluded index node"
                );
            }
        }
    }

    #[test]
    fn document_slice_drops_unresolved_danglers_by_default_keeps_the_broken_lens() {
        // User directive (2026-06-21): the backend must never serve an edge the
        // client only filters out. A RESOLVED edge whose target never resolved to
        // a real graph node (the shape that leaked ~1.5k `mentions`-to-plan-step
        // edges onto the wire) is pure waste — dropped by default. A BROKEN edge to
        // an unresolved target is the broken-lens subject, surfaced ONLY when the
        // lens is explicitly requested (`structural_state: ["broken"]`).
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "feature-a"));
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "unresolved-step", ResolutionState::Resolved, 0.9),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            structural("a-plan", "gone-doc", ResolutionState::Broken, 0.0),
            EdgeAttrs::default(),
        )
        .unwrap();

        // Default query: both dangling edges are dropped (no wire waste).
        let default_slice =
            graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
        assert!(
            default_slice.edges.is_empty(),
            "dangling edges are dropped by default: {:?}",
            default_slice.edges
        );

        // Broken lens: the dangling BROKEN edge is surfaced on explicit request;
        // the resolved dangler is excluded by the state filter and never returns.
        let lens: Filter = serde_json::from_str(r#"{"structural_state": ["broken"]}"#).unwrap();
        let lens_slice = graph_query(&g, &scope(), lens, Granularity::Document).unwrap();
        assert_eq!(
            lens_slice.edges.len(),
            1,
            "only the broken dangler surfaces"
        );
        assert_eq!(lens_slice.edges[0]["state"], "broken");
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

        let (entries, last_seq, truncated) = feature_delta(&old, &new, &scope(), 100, 5);

        assert!(
            truncated.is_none(),
            "an in-bounds feature diff is not truncated"
        );
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

    #[test]
    fn over_ceiling_feature_delta_degrades_to_keyframe_only() {
        // GIR-014: a feature diff whose feature-node/meta-edge delta count exceeds
        // MAX_DIFF_DELTAS degrades to keyframe-only (empty entries + honest
        // truncation), the SAME contract as the document diff. One distinct
        // feature tag per doc → one feature-convergence node → one add delta.
        let old = LinkageGraph::new();
        let mut new = LinkageGraph::new();
        let over = MAX_DIFF_DELTAS + 1;
        for i in 0..over {
            new.upsert_node(doc(&format!("d{i:06}-plan"), &format!("feat-{i:06}")));
        }
        let (entries, _last_seq, truncated) = feature_delta(&old, &new, &scope(), 7, 0);
        assert!(
            entries.is_empty(),
            "an over-ceiling feature diff emits no deltas (keyframe-only)"
        );
        let truncated = truncated.expect("over-ceiling feature diff carries truncation");
        assert_eq!(
            truncated.total_deltas, over,
            "the TRUE delta count is reported"
        );
        assert_eq!(truncated.returned_deltas, 0);
    }

    #[test]
    fn at_ceiling_feature_delta_ships_every_delta() {
        // Exactly at the ceiling is in-bounds: all feature deltas ship, no truncation.
        let old = LinkageGraph::new();
        let mut new = LinkageGraph::new();
        for i in 0..MAX_DIFF_DELTAS {
            new.upsert_node(doc(&format!("d{i:06}-plan"), &format!("feat-{i:06}")));
        }
        let (entries, _last_seq, truncated) = feature_delta(&old, &new, &scope(), 7, 0);
        assert_eq!(entries.len(), MAX_DIFF_DELTAS);
        assert!(truncated.is_none());
    }
}
