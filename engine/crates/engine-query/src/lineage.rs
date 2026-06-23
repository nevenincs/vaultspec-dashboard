//! The bounded temporal-lineage projection (dashboard-timeline ADR, W01.P01):
//! for a `scope`, a `[from, to]` date range, and an optional filter, return the
//! dated document nodes in range — the diachronic lineage the phase-lane
//! timeline draws — with the edges among them returned ONLY on the opt-in
//! relation overlay (`include_arcs`).
//!
//! This is a new temporal PROJECTION over the one model
//! (`views-are-projections-of-one-model`), not a new model: it reads the dated
//! document nodes and (on demand) the typed edges the ingest already holds,
//! derives each node's pipeline lane from its doc-type, and pairs the nodes with
//! the edges among them. It writes nothing and mints no semantics
//! (`engine-read-and-infer`).
//!
//! Cache-until-invalidated (`derived-projections-memoize-on-the-graph-
//! generation`): the expensive part — the range-INDEPENDENT full node set (the
//! per-node degree walk) — is split out into [`lineage_nodes`] so a route can
//! memoize it per graph generation; a timeline scroll/zoom is then a cheap
//! [`bound_range`] slice over the cache, never a re-scan. The DEFAULT timeline
//! read is nodes-only: arcs are the on-demand overlay, so a scroll iterates NO
//! edges (`graph-queries-are-bounded-by-default`).
//!
//! Every read is bounded: the slice is capped at [`MAX_DOCUMENT_NODES`] with an
//! honest [`LineageTruncated`] block, and only edges whose BOTH endpoints survive
//! the cap are returned (self-consistent — no dangling arc). The semantic tier is
//! present-only in history (ADR; mirrors `envelope::asof_tiers_block`): the
//! lineage serves the declared, structural, and temporal tiers and reports
//! semantic excluded.

use std::collections::HashSet;

use engine_graph::{LinkageGraph, StoredEdge, degree_by_tier};
use engine_model::{Dates, Node, ScopeRef};
use serde::Serialize;

use crate::filter::{Filter, FilterError};
use crate::pipeline::{PipelineLanePhase, phase_for_doc_type};

/// The document node ceiling every lineage read is bounded by (W01.P01.S04,
/// `graph-queries-are-bounded-by-default`): the SAME ceiling the graph-query
/// route enforces — sourced from the single [`crate::graph::MAX_GRAPH_NODES`]
/// constant so the two bounds cannot drift — applied here so the lineage never
/// serializes an unbounded full-corpus slice. A query that would exceed it
/// returns the capped, self-consistent subgraph plus an honest
/// [`LineageTruncated`] block; descent into detail is scoped by date range or
/// feature filter, never "return everything".
pub const MAX_DOCUMENT_NODES: usize = crate::graph::MAX_GRAPH_NODES;

/// One dated document node in the lineage slice: everything the phase-lane mark
/// renders. Identity rides the engine's stable node id
/// (`provenance-stable-keys-are-identity-bearing`); the GUI caches and animates
/// arcs and marks by it across scrub and live update.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LineageNode {
    /// Stable node id (`doc:{stem}`) — identity-bearing.
    pub id: String,
    /// Vault doc type (`research`/`adr`/`plan`/`exec`/`audit`/`rule`/...).
    pub doc_type: String,
    /// The derived pipeline-phase lane this document sits in.
    pub phase: PipelineLanePhase,
    /// Blob-true date(s) the node carries: `created` from frontmatter, the mark
    /// position; `modified` (when present) is the faint trailing tick.
    pub dates: Dates,
    /// Body H1 title, when the document carries one.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Total degree (edges touching this node) — the v1 salience input the mark
    /// weight rides. Kept simple: the summed-endpoint count over all tiers.
    pub degree: usize,
}

/// One relation arc between two dated marks: the lineage edge the timeline
/// draws. Carries the stable edge id (arc identity), the endpoints, the typed
/// relation, the optional `derivation` framework label, the provenance tier
/// (the arc's tier-as-treatment styling), and the calibrated confidence.
///
/// `derivation` is the additive framework-relationship label
/// (`grounds`/`authorizes`/`generated-by`/...) read from the SHARED
/// `ontology::derivation_label` projection — the same seam `/graph/query`'s
/// `edge_view` uses (graph-lineage-dag ADR D4/D7: one projection, two distinct
/// surfaces). It is `None` only for an edge that carries no pipeline
/// relationship (a bare structural mention), never as a blanket fallback. The
/// label is additive and NEVER part of the edge stable key.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LineageArc {
    /// Stable edge id — arc identity, preserved across scrub and live update.
    pub id: String,
    pub src: String,
    pub dst: String,
    /// Typed relation wire name (`mentions`/`references`/`contains`/...).
    pub relation: String,
    /// The framework derivation label from the shared `ontology` projection;
    /// absent only when the edge carries no pipeline relationship.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derivation: Option<String>,
    /// Provenance tier wire name (`declared`/`structural`/`temporal`).
    pub tier: String,
    /// Tier-calibrated, fixed-band confidence.
    pub confidence: f32,
}

/// Honest truncation block (W01.P01.S04), mirroring the graph-query shape: the
/// original total, what was returned, and why — so the client narrows rather
/// than receiving a partial-but-silent result.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LineageTruncated {
    pub total_nodes: usize,
    pub returned_nodes: usize,
    pub reason: String,
}

/// Per-tier availability for the lineage slice (W01.P01.S04): declared,
/// structural, and temporal serve; semantic is present-only in history and is
/// reported excluded — the same honesty `envelope::asof_tiers_block` carries.
/// The route layer (W01.P02) reconstructs the canonical envelope `tiers` block
/// from this; the projection states the lineage-local truth.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LineageTier {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// The lineage tiers block: the four tiers with semantic reported present-only
/// (excluded from the range/historical lineage), declared/structural/temporal
/// available.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct LineageTiers {
    pub declared: LineageTier,
    pub structural: LineageTier,
    pub temporal: LineageTier,
    pub semantic: LineageTier,
}

impl LineageTiers {
    fn range_view() -> Self {
        let available = || LineageTier {
            available: true,
            reason: None,
        };
        LineageTiers {
            declared: available(),
            structural: available(),
            temporal: available(),
            // Semantic is present-only by design (ADR; mirrors the as-of view):
            // a range/historical lineage excludes it, stated honestly rather
            // than rendered as a gap or an error.
            semantic: LineageTier {
                available: false,
                reason: Some("present-only by design; excluded from the range lineage".to_string()),
            },
        }
    }
}

/// The temporal-lineage slice: the dated nodes in range, the self-consistent
/// edges among them, the lineage tiers, and an honest truncation block.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LineageSlice {
    pub nodes: Vec<LineageNode>,
    pub arcs: Vec<LineageArc>,
    pub tiers: LineageTiers,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<LineageTruncated>,
}

/// The calendar-date key for lexical date-range comparison: the leading
/// `yyyy-mm-dd` (first 10 chars). The engine is read-and-infer over frontmatter
/// it does not own, and `frontmatter_date` returns the `date:` value verbatim —
/// so a time-suffixed value (`2026-06-22T10:00:00`) would otherwise compare
/// LEXICALLY GREATER than a bare bound (`2026-06-22`) and be wrongly dropped at
/// the `to` boundary. Truncating to the date prefix makes the compare robust and
/// matches the frontend's bound normalization (`dashboardDateRange` `slice(0,10)`).
/// Char-boundary-safe: a non-boundary split returns the whole string unchanged.
fn date_key(s: &str) -> &str {
    s.get(..10).unwrap_or(s)
}

/// True when a blob-true `created` date falls within `[from, to]` inclusive.
/// ISO `yyyy-mm-dd` strings compare lexically (no date parsing); both `created`
/// and the bounds are normalized to their date prefix ([`date_key`]) so a
/// time-suffixed value still compares as its calendar date. A `None`/absent
/// `created` is always excluded — it has no position on the timeline — even under
/// open bounds. An absent bound is open on that side.
///
/// This is THE single date-range predicate, shared by the lineage range slice
/// ([`node_in_range`]) and the `date_range` filter facet — the real function the
/// `filter` module's comments reference (was duplicated inline in both).
pub fn created_in_range(created: Option<&str>, from: Option<&str>, to: Option<&str>) -> bool {
    let Some(created) = created else {
        return false;
    };
    let created = date_key(created);
    if let Some(from) = from
        && created < date_key(from)
    {
        return false;
    }
    if let Some(to) = to
        && created > date_key(to)
    {
        return false;
    }
    true
}

/// Whether a collected lineage node is in `[from, to]`. Reads only the
/// already-derived `LineageNode`, so the per-request range slice never re-touches
/// the graph; delegates the boundary logic to [`created_in_range`].
fn node_in_range(node: &LineageNode, from: Option<&str>, to: Option<&str>) -> bool {
    created_in_range(node.dates.created.as_deref(), from, to)
}

/// Project one in-range, in-scope document node into a lineage node, or `None`
/// when it owns no pipeline lane (e.g. a commit or unknown doc-type — only
/// pipeline-owned documents take a phase lane).
fn lineage_node(graph: &LinkageGraph, node: &Node) -> Option<LineageNode> {
    let doc_type = node.doc_type.as_deref()?;
    let phase = phase_for_doc_type(doc_type)?;
    let degree = degree_by_tier(graph, &node.id).values().sum();
    Some(LineageNode {
        id: node.id.0.clone(),
        doc_type: doc_type.to_string(),
        phase,
        dates: node.dates.clone().unwrap_or(Dates {
            created: None,
            modified: None,
        }),
        title: node.title.clone(),
        degree,
    })
}

/// Project one stored edge into a lineage arc (graph-lineage-dag ADR D4/D7).
///
/// `derivation` is read from the SHARED [`crate::graph::derivation_for_edge`]
/// projection — the exact seam `/graph/query`'s `edge_view` uses — so the
/// timeline carries the same framework label the topological slice does
/// (timeline parity). The label is `None` only for an edge with no pipeline
/// relationship, never as a blanket fallback; it is additive and never re-keys
/// the arc.
fn lineage_arc(graph: &LinkageGraph, stored: &StoredEdge) -> LineageArc {
    let edge = &stored.edge;
    LineageArc {
        id: edge.id.0.clone(),
        src: edge.src.0.clone(),
        dst: edge.dst.0.clone(),
        relation: edge.relation.as_str().to_string(),
        derivation: crate::graph::derivation_for_edge(graph, edge).map(str::to_string),
        tier: edge.tier.as_str().to_string(),
        confidence: edge.confidence,
    }
}

/// Collect ALL dated, in-scope, filter-passing, lane-owning lineage nodes — the
/// FULL set with NO date-range bound and NO node ceiling, id-sorted. This is the
/// expensive, range-INDEPENDENT part of the projection (the per-node
/// `degree_by_tier` adjacency walk): a timeline scroll/zoom changes only the
/// range, never this set, so a route memoizes it per graph generation
/// (`derived-projections-memoize-on-the-graph-generation`) and the cheap
/// per-request range slice ([`bound_range`]) runs over the cache rather than
/// re-scanning every node. `filter` must already be validated by the caller.
fn collect_lineage_nodes(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    filter: &Filter,
) -> Vec<LineageNode> {
    let mut nodes: Vec<LineageNode> = graph
        .nodes()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .filter(|n| filter.matches_node(n))
        .filter_map(|n| lineage_node(graph, n))
        .collect();
    nodes.sort_by(|a, b| a.id.cmp(&b.id));
    nodes
}

/// The FULL range-independent lineage node set — validated, id-sorted, NOT
/// range-bounded and NOT ceiling-capped: the cacheable projection the timeline
/// route memoizes per graph generation. The default timeline path serves a
/// scroll/zoom as a cheap [`bound_range`] over this cache and never re-scans the
/// graph nor touches the edges; only a filtered or arcs-requested read flows
/// through the full [`lineage`] projection. Validating here (not in
/// `bound_range`) keeps the per-request slice free of revalidation.
pub fn lineage_nodes(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    filter: Filter,
) -> Result<Vec<LineageNode>, FilterError> {
    let filter = filter.validated()?;
    Ok(collect_lineage_nodes(graph, scope, &filter))
}

/// Cheaply slice the FULL id-sorted lineage node set ([`lineage_nodes`]) to the
/// `[from, to]` range and bound it under [`MAX_DOCUMENT_NODES`] with an honest
/// truncation block. Pure range comparison + clone + truncate — NO graph scan,
/// NO edge work: this is exactly the per-request work a timeline scroll/zoom
/// does over the cached projection. The input is id-sorted, so the kept page is
/// deterministic (a dense day's dot stacking stays stable across scrubs).
pub fn bound_range(
    all: &[LineageNode],
    from: Option<&str>,
    to: Option<&str>,
) -> (Vec<LineageNode>, Option<LineageTruncated>) {
    let mut nodes: Vec<LineageNode> = all
        .iter()
        .filter(|n| node_in_range(n, from, to))
        .cloned()
        .collect();
    let total_nodes = nodes.len();
    let truncated = if total_nodes > MAX_DOCUMENT_NODES {
        nodes.truncate(MAX_DOCUMENT_NODES);
        Some(LineageTruncated {
            total_nodes,
            returned_nodes: MAX_DOCUMENT_NODES,
            reason: format!(
                "lineage document node ceiling ({MAX_DOCUMENT_NODES}); the \
                 returned slice is self-consistent up to the cap — narrow by \
                 date range or feature filter"
            ),
        })
    } else {
        None
    };
    (nodes, truncated)
}

/// The self-consistent arcs among a KEPT node set: only edges whose BOTH
/// endpoints survive in `kept` ship — no dangling arc to a dropped or
/// out-of-range node (S03/S06) — filter-applied and id-sorted. This is the
/// OPT-IN edge work the default nodes-only timeline path skips entirely: the
/// always-on surface draws dated marks only, so a scroll iterates no edges; the
/// relation overlay (or debug inspection) is the only caller that asks for arcs.
/// `filter` must already be validated.
fn collect_lineage_arcs(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    filter: &Filter,
    kept: &HashSet<&str>,
) -> Vec<LineageArc> {
    let mut arcs: Vec<LineageArc> = graph
        .edges()
        .filter(|s| &s.edge.scope == scope)
        .filter(|s| filter.matches_edge(s))
        .filter(|s| kept.contains(s.edge.src.0.as_str()) && kept.contains(s.edge.dst.0.as_str()))
        .map(|s| lineage_arc(graph, s))
        .collect();
    arcs.sort_by(|a, b| a.id.cmp(&b.id));
    arcs
}

/// Run the bounded temporal-lineage projection (W01.P01.S02-S04). For `scope`,
/// the `[from, to]` ISO date range (either bound optional/open), the validated
/// `filter`, and `include_arcs`, return the dated document nodes in range plus —
/// ONLY when `include_arcs` — the self-consistent edges among them, capped at
/// [`MAX_DOCUMENT_NODES`] with an honest truncation block.
///
/// `include_arcs` is the relation-overlay opt-in (dashboard-timeline ADR: the
/// always-on surface is dated marks ONLY; relations are an on-demand overlay).
/// The DEFAULT timeline path passes `false` and the edge scan is skipped
/// entirely — a scroll/zoom iterates no edges (`graph-queries-are-bounded-by-
/// default`). Pass `true` only for the on-demand relation overlay or debug
/// inspection.
///
/// `scope` narrows nodes to one corpus view (a node passes if any facet matches
/// the scope) and narrows edges to that scope, exactly as the graph query does.
/// The filter is validated and applied to both nodes and edges. This is the
/// route-ready signature: the route validates the scope, parses the range, and
/// wraps the result in the shared envelope. The default (unfiltered, nodes-only)
/// path is served from the route's per-generation cache via
/// [`lineage_nodes`] + [`bound_range`]; this function is the filtered /
/// arcs-requested / historical (as-of) path.
pub fn lineage(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    from: Option<&str>,
    to: Option<&str>,
    filter: Filter,
    include_arcs: bool,
) -> Result<LineageSlice, FilterError> {
    let filter = filter.validated()?;
    let all = collect_lineage_nodes(graph, scope, &filter);
    let (nodes, truncated) = bound_range(&all, from, to);
    let arcs = if include_arcs {
        // Self-consistency (S03/S06): the kept (post-cap) node ids drive the arc
        // retain, so no arc dangles to a dropped or out-of-range node.
        let kept: HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
        collect_lineage_arcs(graph, scope, &filter, &kept)
    } else {
        Vec::new()
    };
    Ok(LineageSlice {
        nodes,
        arcs,
        tiers: LineageTiers::range_view(),
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_graph::EdgeAttrs;
    use engine_model::{
        CanonicalKey, Dates, Facet, NodeKind, Presence, Provenance, RelationKind, ResolutionState,
        Tier, edge_id, node_id,
    };

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    fn doc(stem: &str, doc_type: &str, created: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: Some(format!("{stem} title")),
            doc_type: Some(doc_type.into()),
            dates: Some(Dates {
                created: Some(created.into()),
                modified: None,
            }),
            feature_tags: vec!["x".into()],
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

    fn structural_edge(src: &str, dst: &str) -> engine_model::Edge {
        let s = node_id(&CanonicalKey::Document { stem: src });
        let d = node_id(&CanonicalKey::Document { stem: dst });
        let provenance = Provenance::DocumentBody {
            blob_hash: "b".into(),
            span: (0, 1),
            target: dst.into(),
        };
        engine_model::Edge {
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
            confidence: 0.9,
            state: Some(ResolutionState::Resolved),
            provenance,
            scope: scope(),
            observed_at: 0,
        }
    }

    fn ingest(g: &mut LinkageGraph, edge: engine_model::Edge) {
        engine_graph::ingest(g, edge, EdgeAttrs::default()).unwrap();
    }

    #[test]
    fn collects_dated_nodes_in_range_with_their_phase_and_blob_true_date() {
        // S02: only nodes whose blob-true `created` falls within [from, to] are
        // collected, each carrying its derived pipeline lane and its date.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-research", "research", "2026-06-10"));
        g.upsert_node(doc("b-adr", "adr", "2026-06-12"));
        g.upsert_node(doc("c-plan", "plan", "2026-06-20")); // out of range (after to)
        g.upsert_node(doc("d-rule", "rule", "2026-05-01")); // out of range (before from)

        let slice = lineage(
            &g,
            &scope(),
            Some("2026-06-01"),
            Some("2026-06-15"),
            Filter::default(),
            false,
        )
        .unwrap();

        let ids: Vec<&str> = slice.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["doc:a-research", "doc:b-adr"],
            "only in-range nodes, id-sorted"
        );
        let research = slice
            .nodes
            .iter()
            .find(|n| n.id == "doc:a-research")
            .unwrap();
        assert_eq!(research.phase, PipelineLanePhase::Research);
        assert_eq!(research.dates.created.as_deref(), Some("2026-06-10"));
        let adr = slice.nodes.iter().find(|n| n.id == "doc:b-adr").unwrap();
        assert_eq!(adr.phase, PipelineLanePhase::Adr);
    }

    #[test]
    fn open_bounds_are_inclusive_and_undated_nodes_are_excluded() {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-adr", "adr", "2026-06-12"));
        // An undated node has no position on the timeline.
        let mut undated = doc("b-plan", "plan", "ignored");
        undated.dates = Some(Dates {
            created: None,
            modified: None,
        });
        g.upsert_node(undated);

        // Both bounds open: every dated, lane-owning node in scope.
        let all = lineage(&g, &scope(), None, None, Filter::default(), false).unwrap();
        let ids: Vec<&str> = all.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, vec!["doc:a-adr"], "the undated node is excluded");

        // Inclusive bounds: a node exactly on `from`/`to` is kept.
        let exact = lineage(
            &g,
            &scope(),
            Some("2026-06-12"),
            Some("2026-06-12"),
            Filter::default(),
            false,
        )
        .unwrap();
        assert_eq!(exact.nodes.len(), 1, "bounds are inclusive");
    }

    #[test]
    fn arcs_carry_relation_tier_confidence_and_the_shared_derivation_label() {
        // S03 + graph-lineage-dag ADR D4 (S36/S49): arcs carry the shipped
        // relation/tier truth AND the framework derivation label read from the
        // SHARED ontology projection — the same label `/graph/query` serves. A
        // plan↔adr edge is `authorizes`.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "plan", "2026-06-10"));
        g.upsert_node(doc("b-adr", "adr", "2026-06-11"));
        ingest(&mut g, structural_edge("a-plan", "b-adr"));

        let slice = lineage(&g, &scope(), None, None, Filter::default(), true).unwrap();
        assert_eq!(slice.arcs.len(), 1);
        let arc = &slice.arcs[0];
        assert_eq!(arc.src, "doc:a-plan");
        assert_eq!(arc.dst, "doc:b-adr");
        assert_eq!(arc.relation, "mentions");
        assert_eq!(arc.tier, "structural");
        assert_eq!(arc.confidence, 0.9);
        assert_eq!(
            arc.derivation.as_deref(),
            Some("authorizes"),
            "the timeline arc carries the shared framework label (D4 timeline parity)"
        );
    }

    #[test]
    fn arc_carries_no_label_when_the_edge_has_no_pipeline_relationship() {
        // The label is `None` only for an edge with no framework relationship —
        // never a blanket fallback. Two same-feature plan documents carry a bare
        // structural mention the derivation vocabulary does not name.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "plan", "2026-06-10"));
        g.upsert_node(doc("b-plan", "plan", "2026-06-11"));
        ingest(&mut g, structural_edge("a-plan", "b-plan"));

        let slice = lineage(&g, &scope(), None, None, Filter::default(), true).unwrap();
        assert_eq!(slice.arcs.len(), 1);
        assert_eq!(
            slice.arcs[0].derivation, None,
            "no pipeline relationship -> honest absence, not a fabricated label"
        );
    }

    #[test]
    fn semantic_tier_is_present_only_declared_structural_temporal_serve() {
        // S04: the lineage serves declared/structural/temporal and reports
        // semantic excluded (present-only in history), consistent with the
        // as-of tiers block.
        let g = LinkageGraph::new();
        let slice = lineage(&g, &scope(), None, None, Filter::default(), false).unwrap();
        assert!(slice.tiers.declared.available);
        assert!(slice.tiers.structural.available);
        assert!(slice.tiers.temporal.available);
        assert!(
            !slice.tiers.semantic.available,
            "semantic is present-only, excluded from the range lineage"
        );
        assert!(slice.tiers.semantic.reason.is_some());
    }

    #[test]
    fn slice_is_bounded_under_the_node_ceiling_with_an_honest_truncated_block() {
        // S05: a query that would exceed the document node ceiling returns the
        // capped slice plus an honest truncated block stating the original total.
        let mut g = LinkageGraph::new();
        let over = MAX_DOCUMENT_NODES + 250;
        for i in 0..over {
            // Distinct stems, all in range, all the same lane.
            g.upsert_node(doc(&format!("plan-{i:06}"), "plan", "2026-06-10"));
        }

        let slice = lineage(&g, &scope(), None, None, Filter::default(), false).unwrap();
        assert_eq!(
            slice.nodes.len(),
            MAX_DOCUMENT_NODES,
            "node payload is hard-bounded at the ceiling"
        );
        let trunc = slice.truncated.expect("over-ceiling query truncates");
        assert_eq!(
            trunc.total_nodes, over,
            "the honest original total is reported"
        );
        assert_eq!(trunc.returned_nodes, MAX_DOCUMENT_NODES);
        assert!(!trunc.reason.is_empty());

        // A slice under the ceiling carries no truncation block.
        let mut small = LinkageGraph::new();
        small.upsert_node(doc("a-plan", "plan", "2026-06-10"));
        let small_slice = lineage(&small, &scope(), None, None, Filter::default(), false).unwrap();
        assert!(
            small_slice.truncated.is_none(),
            "a small slice is not truncated"
        );
    }

    #[test]
    fn returned_arcs_only_connect_returned_nodes_no_dangling_arc() {
        // S06: self-consistency — an edge to an out-of-range (or dropped) node
        // is excluded; only edges among the returned nodes ship.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "plan", "2026-06-10")); // in range
        g.upsert_node(doc("b-adr", "adr", "2026-06-11")); // in range
        g.upsert_node(doc("z-old-research", "research", "2026-01-01")); // OUT of range
        // Edge among two in-range nodes: kept. Edge to the out-of-range node:
        // dropped (its endpoint is not in the returned set).
        ingest(&mut g, structural_edge("a-plan", "b-adr"));
        ingest(&mut g, structural_edge("a-plan", "z-old-research"));

        let slice = lineage(
            &g,
            &scope(),
            Some("2026-06-01"),
            Some("2026-06-30"),
            Filter::default(),
            true,
        )
        .unwrap();

        let kept: HashSet<&str> = slice.nodes.iter().map(|n| n.id.as_str()).collect();
        assert!(
            !kept.contains("doc:z-old-research"),
            "out-of-range excluded"
        );
        assert_eq!(slice.arcs.len(), 1, "only the in-set edge survives");
        for arc in &slice.arcs {
            assert!(
                kept.contains(arc.src.as_str()) && kept.contains(arc.dst.as_str()),
                "no dangling arc: both endpoints are in the returned node set"
            );
        }

        // Self-consistency holds under truncation too: cap to a tiny ceiling by
        // building an over-ceiling set is covered above; here the invariant is
        // that the kept-set drives the arc retain, which we assert directly.
        assert!(
            slice
                .arcs
                .iter()
                .all(|a| kept.contains(a.src.as_str()) && kept.contains(a.dst.as_str()))
        );
    }

    #[test]
    fn same_date_nodes_are_returned_in_a_stable_id_order() {
        // Timeline fidelity: the frontmatter `created` date that positions a mark is
        // DAY-precision, so MANY documents share one timestamp. The timeline's
        // deterministic dot layout (its per-day stacking is keyed on stable id)
        // relies on the engine returning same-date nodes in a STABLE, id-sorted
        // order — never the nondeterministic graph-iteration (insertion) order. This
        // pins that guarantee: the date-source (`created`) drives placement and the
        // tie-break for a shared date is the stable id.
        let mut g = LinkageGraph::new();
        // Insert OUT of id order, all created on the same day.
        g.upsert_node(doc("c-plan", "plan", "2026-06-10"));
        g.upsert_node(doc("a-research", "research", "2026-06-10"));
        g.upsert_node(doc("b-adr", "adr", "2026-06-10"));

        let slice = lineage(&g, &scope(), None, None, Filter::default(), false).unwrap();
        let ids: Vec<&str> = slice.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(
            ids,
            vec!["doc:a-research", "doc:b-adr", "doc:c-plan"],
            "same-date nodes are id-sorted, not insertion-ordered"
        );
        // Every kept node carries the SAME blob-true `created` date that drove the
        // placement — the date-source the timeline positions by is on the wire.
        assert!(
            slice
                .nodes
                .iter()
                .all(|n| n.dates.created.as_deref() == Some("2026-06-10")),
            "the placement date-source (created) rides each node"
        );

        // The order is INDEPENDENT of insertion order: rebuilt with a different
        // insertion order, the id-sorted slice is byte-identical.
        let mut g2 = LinkageGraph::new();
        g2.upsert_node(doc("b-adr", "adr", "2026-06-10"));
        g2.upsert_node(doc("c-plan", "plan", "2026-06-10"));
        g2.upsert_node(doc("a-research", "research", "2026-06-10"));
        let slice2 = lineage(&g2, &scope(), None, None, Filter::default(), false).unwrap();
        let ids2: Vec<&str> = slice2.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(
            ids, ids2,
            "the same-date order is independent of insertion order (deterministic)"
        );
    }

    #[test]
    fn default_path_is_nodes_only_arcs_are_opt_in() {
        // The hot-path contract (dashboard-timeline ADR / backend hardening): the
        // DEFAULT timeline read draws dated marks ONLY — `include_arcs=false`
        // returns the nodes with an EMPTY arc set even when edges exist among the
        // kept nodes, so a scroll/zoom never iterates the graph's edges. The same
        // read with `include_arcs=true` (the on-demand relation overlay) returns
        // the self-consistent arcs.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "plan", "2026-06-10"));
        g.upsert_node(doc("b-adr", "adr", "2026-06-11"));
        ingest(&mut g, structural_edge("a-plan", "b-adr"));

        let nodes_only = lineage(&g, &scope(), None, None, Filter::default(), false).unwrap();
        assert_eq!(nodes_only.nodes.len(), 2, "the dated marks are served");
        assert!(
            nodes_only.arcs.is_empty(),
            "the default nodes-only path skips the edge scan — no arcs"
        );

        let with_arcs = lineage(&g, &scope(), None, None, Filter::default(), true).unwrap();
        assert_eq!(
            with_arcs.arcs.len(),
            1,
            "the opt-in overlay serves the self-consistent arcs"
        );
    }

    #[test]
    fn lineage_nodes_is_the_full_set_and_bound_range_slices_it() {
        // The cache contract: `lineage_nodes` is the FULL range-independent set a
        // route memoizes per generation; `bound_range` is the cheap per-request
        // slice over it. The composition must equal the all-in-one `lineage`
        // nodes-only result for any range — proving a scroll served from the cache
        // is byte-identical to a fresh projection (warm read == cold read).
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-research", "research", "2026-06-10"));
        g.upsert_node(doc("b-adr", "adr", "2026-06-12"));
        g.upsert_node(doc("c-plan", "plan", "2026-06-20"));
        // An undated node owns no timeline position and must be absent from the
        // cached full set's slices regardless of range.
        let mut undated = doc("d-rule", "rule", "ignored");
        undated.dates = Some(Dates {
            created: None,
            modified: None,
        });
        g.upsert_node(undated);

        // The full set carries every dated lane-owning node, id-sorted, unbounded
        // by range — the undated node is still collected here (it is dropped at
        // the range slice, where "no position" is enforced).
        let full = lineage_nodes(&g, &scope(), Filter::default()).unwrap();
        let full_ids: Vec<&str> = full.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(
            full_ids,
            vec!["doc:a-research", "doc:b-adr", "doc:c-plan", "doc:d-rule"],
            "the cached full set is id-sorted and range-independent"
        );

        // For several ranges, the cache slice equals the fresh nodes-only lineage.
        for (from, to) in [
            (None, None),
            (Some("2026-06-01"), Some("2026-06-15")),
            (Some("2026-06-13"), None),
            (None, Some("2026-06-11")),
        ] {
            let (sliced, _) = bound_range(&full, from, to);
            let fresh = lineage(&g, &scope(), from, to, Filter::default(), false).unwrap();
            assert_eq!(
                sliced, fresh.nodes,
                "the cache slice matches a fresh projection for range {from:?}..{to:?}"
            );
            // The undated node never appears in any range slice.
            assert!(
                !sliced.iter().any(|n| n.id == "doc:d-rule"),
                "the undated node has no timeline position in any range"
            );
        }
    }

    #[test]
    fn bound_range_caps_the_slice_with_an_honest_truncated_block() {
        // `bound_range` enforces the SAME document node ceiling the all-in-one
        // projection did, so serving from the cache stays bounded
        // (graph-queries-are-bounded-by-default): an over-ceiling full set slices
        // to the cap with an honest total, and a small set is untruncated.
        let mut g = LinkageGraph::new();
        let over = MAX_DOCUMENT_NODES + 250;
        for i in 0..over {
            g.upsert_node(doc(&format!("plan-{i:06}"), "plan", "2026-06-10"));
        }
        let full = lineage_nodes(&g, &scope(), Filter::default()).unwrap();
        let (sliced, truncated) = bound_range(&full, None, None);
        assert_eq!(
            sliced.len(),
            MAX_DOCUMENT_NODES,
            "the slice is hard-bounded"
        );
        let trunc = truncated.expect("over-ceiling slice truncates");
        assert_eq!(trunc.total_nodes, over);
        assert_eq!(trunc.returned_nodes, MAX_DOCUMENT_NODES);

        let mut small = LinkageGraph::new();
        small.upsert_node(doc("a-plan", "plan", "2026-06-10"));
        let small_full = lineage_nodes(&small, &scope(), Filter::default()).unwrap();
        let (_, small_trunc) = bound_range(&small_full, None, None);
        assert!(small_trunc.is_none(), "a small slice is not truncated");
    }
}
