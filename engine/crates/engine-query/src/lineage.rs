//! The bounded temporal-lineage projection (dashboard-timeline ADR, W01.P01):
//! for a `scope`, a `[from, to]` date range, and an optional filter, return the
//! dated document nodes in range together with the edges among them — the
//! diachronic lineage the phase-lane timeline draws.
//!
//! This is a new temporal PROJECTION over the one model
//! (`views-are-projections-of-one-model`), not a new model: it reads the dated
//! document nodes and the typed edges the ingest already holds, derives each
//! node's pipeline lane from its doc-type, and pairs the nodes with the edges
//! among them. It writes nothing and mints no semantics
//! (`engine-read-and-infer`).
//!
//! Every read is bounded (`graph-queries-are-bounded-by-default`): the slice is
//! capped at [`MAX_DOCUMENT_NODES`] with an honest [`LineageTruncated`] block,
//! and only edges whose BOTH endpoints survive the cap are returned
//! (self-consistent — no dangling arc). The semantic tier is present-only in
//! history (ADR; mirrors `envelope::asof_tiers_block`): the lineage serves the
//! declared, structural, and temporal tiers and reports semantic excluded.
//!
//! The route + shared envelope is the NEXT phase (W01.P02); this module is the
//! pure, route-ready projection — its signature already takes
//! `scope + from + to + filter`.

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
/// `derivation` is the additive framework-relationship label specified by the
/// node-semantics ADR (`grounds`/`authorizes`/`generated-by`/...) — NOT yet
/// shipped on `engine_model::Edge`. Until it lands the arc carries the shipped
/// `relation`/`tier` truth and `derivation` is `None`; the surface draws REAL
/// lineage from day one and gains the richer label when the field arrives. The
/// projection never hard-depends on it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LineageArc {
    /// Stable edge id — arc identity, preserved across scrub and live update.
    pub id: String,
    pub src: String,
    pub dst: String,
    /// Typed relation wire name (`mentions`/`references`/`contains`/...).
    pub relation: String,
    /// The framework derivation label, when shipped (graceful fallback: `None`
    /// until the node-semantics `derivation` field lands).
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

/// True when a node's blob-true `created` date falls within `[from, to]`
/// inclusive. ISO `yyyy-mm-dd` strings compare lexically, so the bounds are
/// well-ordered without date parsing (the same lexical-compare discipline the
/// filter's `DateBounds` uses). A node with no `created` date is excluded — it
/// has no position on the timeline. An absent bound is open on that side.
fn created_in_range(node: &Node, from: Option<&str>, to: Option<&str>) -> bool {
    let Some(created) = node.dates.as_ref().and_then(|d| d.created.as_deref()) else {
        return false;
    };
    if let Some(from) = from
        && created < from
    {
        return false;
    }
    if let Some(to) = to
        && created > to
    {
        return false;
    }
    true
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

/// Project one stored edge into a lineage arc.
///
/// `derivation` falls back gracefully (W01.P01.S03): the shipped `Edge` carries
/// no `derivation` field yet, so the arc is built from the shipped
/// `relation`/`tier` truth and `derivation` is `None`. When the node-semantics
/// `derivation` field lands this is the single seam that reads it.
fn lineage_arc(stored: &StoredEdge) -> LineageArc {
    let edge = &stored.edge;
    LineageArc {
        id: edge.id.0.clone(),
        src: edge.src.0.clone(),
        dst: edge.dst.0.clone(),
        relation: edge.relation.as_str().to_string(),
        // Graceful fallback: no `derivation` field shipped on `Edge` yet.
        derivation: None,
        tier: edge.tier.as_str().to_string(),
        confidence: edge.confidence,
    }
}

/// Run the bounded temporal-lineage projection (W01.P01.S02-S04). For `scope`,
/// the `[from, to]` ISO date range (either bound optional/open), and the
/// validated `filter`, return the dated document nodes in range plus the
/// self-consistent edges among them, capped at [`MAX_DOCUMENT_NODES`] with an
/// honest truncation block.
///
/// `scope` narrows nodes to one corpus view (a node passes if any facet matches
/// the scope) and narrows edges to that scope, exactly as the graph query does.
/// The filter is validated and applied to both nodes and edges. This is the
/// route-ready signature: the W01.P02 route validates the scope, parses the
/// range, and wraps the result in the shared envelope.
pub fn lineage(
    graph: &LinkageGraph,
    scope: &ScopeRef,
    from: Option<&str>,
    to: Option<&str>,
    filter: Filter,
) -> Result<LineageSlice, FilterError> {
    let filter = filter.validated()?;

    // Collect the dated, in-scope, in-range, filter-passing document nodes that
    // own a pipeline lane, sorted by stable id so the bound's kept page is
    // deterministic (mirrors the graph query's id-sort-then-bound).
    let mut nodes: Vec<LineageNode> = graph
        .nodes()
        .filter(|n| n.facets.iter().any(|f| &f.scope == scope))
        .filter(|n| filter.matches_node(n))
        .filter(|n| created_in_range(n, from, to))
        .filter_map(|n| lineage_node(graph, n))
        .collect();
    nodes.sort_by(|a, b| a.id.cmp(&b.id));

    // Bound under the document node ceiling (S04): keep the first ceiling nodes
    // (id-sorted, so deterministic) and report the honest original total.
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

    // Self-consistency (S03/S06): only edges whose BOTH endpoints are in the
    // KEPT (post-cap) node set ship — no dangling arc to a dropped or
    // out-of-range node. Built from the kept node ids so it stays correct under
    // truncation.
    let kept: HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
    let mut arcs: Vec<LineageArc> = graph
        .edges()
        .filter(|s| &s.edge.scope == scope)
        .filter(|s| filter.matches_edge(s))
        .filter(|s| kept.contains(s.edge.src.0.as_str()) && kept.contains(s.edge.dst.0.as_str()))
        .map(lineage_arc)
        .collect();
    arcs.sort_by(|a, b| a.id.cmp(&b.id));

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
        let all = lineage(&g, &scope(), None, None, Filter::default()).unwrap();
        let ids: Vec<&str> = all.nodes.iter().map(|n| n.id.as_str()).collect();
        assert_eq!(ids, vec!["doc:a-adr"], "the undated node is excluded");

        // Inclusive bounds: a node exactly on `from`/`to` is kept.
        let exact = lineage(
            &g,
            &scope(),
            Some("2026-06-12"),
            Some("2026-06-12"),
            Filter::default(),
        )
        .unwrap();
        assert_eq!(exact.nodes.len(), 1, "bounds are inclusive");
    }

    #[test]
    fn arcs_carry_relation_tier_confidence_and_a_graceful_derivation_fallback() {
        // S03: arcs are built from the shipped relation/tier edges; `derivation`
        // falls back to None until the node-semantics field lands.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan", "plan", "2026-06-10"));
        g.upsert_node(doc("b-adr", "adr", "2026-06-11"));
        ingest(&mut g, structural_edge("a-plan", "b-adr"));

        let slice = lineage(&g, &scope(), None, None, Filter::default()).unwrap();
        assert_eq!(slice.arcs.len(), 1);
        let arc = &slice.arcs[0];
        assert_eq!(arc.src, "doc:a-plan");
        assert_eq!(arc.dst, "doc:b-adr");
        assert_eq!(arc.relation, "mentions");
        assert_eq!(arc.tier, "structural");
        assert_eq!(arc.confidence, 0.9);
        assert_eq!(
            arc.derivation, None,
            "graceful fallback: no derivation field shipped yet"
        );
    }

    #[test]
    fn semantic_tier_is_present_only_declared_structural_temporal_serve() {
        // S04: the lineage serves declared/structural/temporal and reports
        // semantic excluded (present-only in history), consistent with the
        // as-of tiers block.
        let g = LinkageGraph::new();
        let slice = lineage(&g, &scope(), None, None, Filter::default()).unwrap();
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

        let slice = lineage(&g, &scope(), None, None, Filter::default()).unwrap();
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
        let small_slice = lineage(&small, &scope(), None, None, Filter::default()).unwrap();
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
}
