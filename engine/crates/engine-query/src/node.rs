//! Node queries (contract §4): detail with interior structure, lazy ego
//! neighbors with depth and tier filters, and evidence (documents,
//! correlated commits).

use std::collections::BTreeSet;

use engine_graph::{ContextBundle, LinkageGraph, context};
use engine_model::{Edge, Node, NodeId, Provenance, Tier};
use serde::Serialize;

/// Node detail: the context bundle is the interior-structure carrier in
/// v1 (plan wave/phase/step interiors arrive when plan-container nodes are
/// minted from plan parsing — the W02P06-301 identity decision keeps
/// mention-target ids stable for that arrival).
#[derive(Debug, Clone, Serialize)]
pub struct NodeDetail {
    pub bundle: ContextBundle,
}

/// Node detail, or `None` for unknown ids (truthful absence).
pub fn node_detail(graph: &LinkageGraph, id: &NodeId) -> Option<NodeDetail> {
    context(graph, id).map(|bundle| NodeDetail { bundle })
}

// --- Plan-container interior (dashboard-pipeline-wire W03.P08) ----------------

use engine_model::RelationKind;

/// Hard ceiling on the number of plan-container entities serialized in one
/// interior response (W03.P08.S42 / `graph-queries-are-bounded-by-default`): a
/// large L4 plan's step tree is a real payload, so the interior is served under
/// a node ceiling with honest `truncated` reporting, never an unbounded slice.
/// The count is total entities (waves + phases + steps).
pub const MAX_PLAN_INTERIOR_NODES: usize = 2000;

/// One interior step entity: its container node id, canonical id, action text,
/// completion, and the bound exec-record node id where one exists.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct InteriorStep {
    pub node_id: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    pub done: bool,
    /// The exec-record document node this step binds to, if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exec_node_id: Option<String>,
}

/// One interior phase entity with its ordered steps.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct InteriorPhase {
    pub node_id: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
    pub steps: Vec<InteriorStep>,
}

/// One interior wave entity with its ordered phases.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct InteriorWave {
    pub node_id: String,
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heading: Option<String>,
    pub phases: Vec<InteriorPhase>,
}

/// Honest truncation block (W03.P08.S42), mirroring the graph-query shape.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct InteriorTruncated {
    pub total_nodes: usize,
    pub returned_nodes: usize,
    pub reason: String,
}

/// The bounded interior of a plan node (W03.P08.S40): the ordered
/// wave/phase/step entities the plan descends into, at whatever depth the plan
/// declares, plus an optional truncation block. Tier-shape honest like the
/// parser: an L1 plan returns flat `steps`, an L2 plan `phases`, L3/L4 `waves`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanInterior {
    /// The plan document node this interior belongs to.
    pub plan_node_id: String,
    pub waves: Vec<InteriorWave>,
    pub phases: Vec<InteriorPhase>,
    pub steps: Vec<InteriorStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncated: Option<InteriorTruncated>,
}

/// Read one plan-container node's completion from its lifecycle facet (any
/// scope: a step has one unit of progress). A closed step is `complete`.
fn container_done(node: &Node) -> bool {
    node.facets
        .iter()
        .find_map(|f| f.lifecycle.as_ref())
        .map(|l| l.state == "complete")
        .unwrap_or(false)
}

/// The exec-record node a step container binds to, if any: a `References` edge
/// from the step to a `doc:*` node.
fn exec_binding(graph: &LinkageGraph, step_id: &NodeId) -> Option<String> {
    graph.edges_of(step_id).find_map(|s| {
        (s.edge.relation == RelationKind::References && s.edge.src == *step_id)
            .then(|| s.edge.dst.0.clone())
    })
}

/// The canonical leaf id of a plan-container key (`{stem}/W01/P02/S03` -> `S03`).
fn leaf_id(key: &str) -> &str {
    key.rsplit('/').next().unwrap_or(key)
}

/// Children of a container reached over `Contains` edges (src -> dst), as their
/// container nodes, sorted by key for deterministic ordering.
fn contained_children<'a>(graph: &'a LinkageGraph, parent: &NodeId) -> Vec<&'a Node> {
    let mut children: Vec<&Node> = graph
        .edges_of(parent)
        .filter(|s| s.edge.relation == RelationKind::Contains && s.edge.src == *parent)
        .filter_map(|s| graph.node(&s.edge.dst))
        .collect();
    children.sort_by(|a, b| a.key.cmp(&b.key));
    children
}

/// Project a plan node into its bounded plan-container interior (W03.P08.S41).
/// Returns `None` for an unknown node or a node that is not a plan document
/// (truthful absence). Descends the `Contains` hierarchy under a node ceiling;
/// when the entity count exceeds the ceiling the returned subtree stays
/// self-consistent (whole waves/phases are kept up to the cap) and the honest
/// original total is reported.
pub fn plan_interior(graph: &LinkageGraph, id: &NodeId) -> Option<PlanInterior> {
    let node = graph.node(id)?;
    if node.doc_type.as_deref() != Some("plan") {
        return None;
    }
    let mut budget = Budget {
        remaining: MAX_PLAN_INTERIOR_NODES,
        total: 0,
    };
    let mut interior = PlanInterior {
        plan_node_id: id.0.clone(),
        waves: Vec::new(),
        phases: Vec::new(),
        steps: Vec::new(),
        truncated: None,
    };

    for child in contained_children(graph, id) {
        let leaf = leaf_id(&child.key);
        match leaf.chars().next() {
            Some('W') => {
                if let Some(wave) = project_wave(graph, child, &mut budget) {
                    interior.waves.push(wave);
                }
            }
            Some('P') => {
                if let Some(phase) = project_phase(graph, child, &mut budget) {
                    interior.phases.push(phase);
                }
            }
            Some('S') => {
                if let Some(step) = project_step(graph, child, &mut budget) {
                    interior.steps.push(step);
                }
            }
            _ => {}
        }
    }

    if budget.total > MAX_PLAN_INTERIOR_NODES {
        interior.truncated = Some(InteriorTruncated {
            total_nodes: budget.total,
            returned_nodes: MAX_PLAN_INTERIOR_NODES - budget.remaining,
            reason: format!(
                "plan interior node ceiling ({MAX_PLAN_INTERIOR_NODES}); the \
                 returned subtree is self-consistent up to the cap — narrow by \
                 wave or phase"
            ),
        });
    }
    Some(interior)
}

/// Descent budget: `remaining` is the live cap, `total` counts every entity the
/// full tree would contain (so truncation reports an honest original total even
/// past the cap).
struct Budget {
    remaining: usize,
    total: usize,
}

impl Budget {
    /// Account for one entity; returns `true` if it fits within the cap.
    fn take(&mut self) -> bool {
        self.total += 1;
        if self.remaining == 0 {
            return false;
        }
        self.remaining -= 1;
        true
    }
}

fn project_step(graph: &LinkageGraph, node: &Node, budget: &mut Budget) -> Option<InteriorStep> {
    if !budget.take() {
        return None;
    }
    Some(InteriorStep {
        node_id: node.id.0.clone(),
        id: leaf_id(&node.key).to_string(),
        action: node.title.clone(),
        done: container_done(node),
        exec_node_id: exec_binding(graph, &node.id),
    })
}

fn project_phase(graph: &LinkageGraph, node: &Node, budget: &mut Budget) -> Option<InteriorPhase> {
    if !budget.take() {
        // Count the steps for an honest total even when the phase itself is
        // past the cap, but keep none (self-consistency: a dropped phase keeps
        // no orphan steps).
        for child in contained_children(graph, &node.id) {
            if leaf_id(&child.key).starts_with('S') {
                budget.total += 1;
            }
        }
        return None;
    }
    let mut steps = Vec::new();
    for child in contained_children(graph, &node.id) {
        if leaf_id(&child.key).starts_with('S')
            && let Some(step) = project_step(graph, child, budget)
        {
            steps.push(step);
        }
    }
    Some(InteriorPhase {
        node_id: node.id.0.clone(),
        id: leaf_id(&node.key).to_string(),
        heading: node.title.clone(),
        steps,
    })
}

fn project_wave(graph: &LinkageGraph, node: &Node, budget: &mut Budget) -> Option<InteriorWave> {
    if !budget.take() {
        for child in contained_children(graph, &node.id) {
            if leaf_id(&child.key).starts_with('P') {
                budget.total += 1;
                for gc in contained_children(graph, &child.id) {
                    if leaf_id(&gc.key).starts_with('S') {
                        budget.total += 1;
                    }
                }
            }
        }
        return None;
    }
    let mut phases = Vec::new();
    for child in contained_children(graph, &node.id) {
        if leaf_id(&child.key).starts_with('P')
            && let Some(phase) = project_phase(graph, child, budget)
        {
            phases.push(phase);
        }
    }
    Some(InteriorWave {
        node_id: node.id.0.clone(),
        id: leaf_id(&node.key).to_string(),
        heading: node.title.clone(),
        phases,
    })
}

/// The lazy ego network: nodes and edges within `depth` hops, optionally
/// restricted to `tiers` (contract §4 `/nodes/{id}/neighbors`).
#[derive(Debug, Clone, Serialize)]
pub struct EgoSlice {
    pub center: NodeId,
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

pub fn neighbors(
    graph: &LinkageGraph,
    id: &NodeId,
    depth: usize,
    tiers: &[Tier],
) -> Option<EgoSlice> {
    graph.node(id)?;
    let tier_ok = |tier: Tier| tiers.is_empty() || tiers.contains(&tier);

    let mut visited: BTreeSet<String> = BTreeSet::new();
    visited.insert(id.0.clone());
    let mut frontier = vec![id.clone()];
    let mut edges: Vec<Edge> = Vec::new();
    let mut edge_ids: BTreeSet<String> = BTreeSet::new();

    for _ in 0..depth.max(1) {
        let mut next = Vec::new();
        for node_id in &frontier {
            for stored in graph.edges_of(node_id) {
                if !tier_ok(stored.edge.tier) {
                    continue;
                }
                if edge_ids.insert(stored.edge.id.0.clone()) {
                    edges.push(stored.edge.clone());
                }
                let other = if &stored.edge.src == node_id {
                    stored.edge.dst.clone()
                } else {
                    stored.edge.src.clone()
                };
                if visited.insert(other.0.clone()) {
                    next.push(other);
                }
            }
        }
        frontier = next;
        if frontier.is_empty() {
            break;
        }
    }

    let mut nodes: Vec<Node> = visited
        .iter()
        .filter_map(|node_id| graph.node(&NodeId(node_id.clone())).cloned())
        .collect();
    nodes.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    // #13 mis-resolved-edge prune (2026-06-22, product decision (b)): drop any edge
    // whose endpoint is not a materialized graph node, mirroring the document slice's
    // `endpoint_ok` (graph.rs). A step mention derives its target from the bare mention
    // text (`plan:W01.P01.S01`), which can never match a real plan-container step node
    // (`plan:<stem>/W01/P02/S03`) — a phantom; a broken wiki-link (`doc:<missing-stem>`)
    // and a temporal `commit:<sha>` endpoint are likewise non-materialized. The client
    // `buildEdges` filters such dangling edges anyway, so serving them is pure wire-waste
    // the user directed us never to send (2026-06-21). The center is always materialized
    // (`graph.node(id)?` above), so it is never pruned.
    edges.retain(|e| graph.node(&e.src).is_some() && graph.node(&e.dst).is_some());
    edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    Some(EgoSlice {
        center: id.clone(),
        nodes,
        edges,
    })
}

/// Evidence for a node (contract §4 `/nodes/{id}/evidence`).
///
/// The item shapes are ENRICHED to the GUI `NodeEvidence` type
/// (figma-parity-reconciliation S13): `documents` carry `{ path, doc_type }`
/// (not bare stems), and `commits` carry the `subject`. The subject is filled
/// by the route from a read-only git lookup (the pure graph projection has no
/// git access), defaulting to empty until then.
#[derive(Debug, Clone, Serialize)]
pub struct Evidence {
    /// Attached documents with their repo-relative path and vault doc type.
    pub documents: Vec<EvidenceDocument>,
    /// Correlated commits, each with the rule that correlated it.
    pub commits: Vec<CorrelatedCommit>,
}

/// One attached document in the evidence projection, aligned to the GUI
/// `NodeEvidence` document item: the repo-relative `path` (under `.vault/`) and
/// the vault `doc_type` (the `.vault/` subdirectory), resolved from the graph
/// node rather than a bare stem.
#[derive(Debug, Clone, Serialize)]
pub struct EvidenceDocument {
    /// The repo-relative path, e.g. `.vault/adr/<stem>.md`.
    pub path: String,
    /// The vault document type (the `.vault/` subdirectory).
    pub doc_type: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CorrelatedCommit {
    pub sha: String,
    /// The commit subject (first message line), aligned to the GUI
    /// `NodeEvidence` commit `subject`. Filled by the route from a read-only
    /// git lookup; empty in the pure graph projection (which has no git access)
    /// and for a sha that does not resolve.
    pub subject: String,
    /// The named correlation rule that fired (D3.4 attribution).
    pub rule: String,
    pub confidence: f32,
}

pub fn evidence(graph: &LinkageGraph, id: &NodeId) -> Option<Evidence> {
    graph.node(id)?;
    let mut documents: Vec<EvidenceDocument> = Vec::new();
    let mut seen_documents: BTreeSet<String> = BTreeSet::new();
    let mut commits = Vec::new();

    for stored in graph.edges_of(id) {
        let edge = &stored.edge;
        let other = if &edge.src == id {
            &edge.dst
        } else {
            &edge.src
        };
        if let Some(stem) = other.0.strip_prefix("doc:")
            && seen_documents.insert(stem.to_string())
        {
            // Resolve the GUI-shape document item from the graph node: its
            // `doc_type` is the vault subdirectory, and the repo-relative path
            // is `.vault/<doc_type>/<stem>.md`. A node missing a doc_type (a
            // thin/absent document) falls back to the bare `document` type and a
            // best-effort `.vault/<stem>.md` path rather than dropping the item.
            let doc_type = graph
                .node(other)
                .and_then(|n| n.doc_type.clone())
                .unwrap_or_else(|| "document".to_string());
            let path = document_path(&doc_type, stem);
            documents.push(EvidenceDocument { path, doc_type });
        }
        if let Provenance::CommitCorrelation { sha, rule } = &edge.provenance {
            commits.push(CorrelatedCommit {
                sha: sha.clone(),
                // Filled by the route from a read-only git lookup; empty here in
                // the pure graph projection (no git access).
                subject: String::new(),
                rule: rule.clone(),
                confidence: edge.confidence,
            });
        }
    }
    documents.sort_by(|a, b| a.path.cmp(&b.path));
    commits.sort_by(|a, b| a.sha.cmp(&b.sha));
    Some(Evidence { documents, commits })
}

/// The repo-relative path for a vault document, `.vault/<doc_type>/<stem>.md`.
/// Mirrors the vault-tree path derivation (`docTypeFromStem` on the client),
/// so the evidence document item carries the same path the rest of the wire
/// uses to address a document.
fn document_path(doc_type: &str, stem: &str) -> String {
    format!(".vault/{doc_type}/{stem}.md")
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_graph::EdgeAttrs;
    use engine_model::{
        CanonicalKey, Facet, NodeKind, Presence, RelationKind, ResolutionState, ScopeRef, edge_id,
        node_id,
    };

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    fn doc(stem: &str) -> Node {
        // Derive a doc_type from the stem suffix so the evidence projection's
        // `{ path, doc_type }` document item is exercised (S13): `b-adr` → adr.
        let doc_type = stem.rsplit('-').next().map(|s| s.to_string());
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type,
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

    fn edge(src: &NodeId, dst: &NodeId, tier: Tier, provenance: Provenance, conf: f32) -> Edge {
        Edge {
            id: edge_id(src, dst, &RelationKind::Mentions, tier, &provenance),
            src: src.clone(),
            dst: dst.clone(),
            relation: RelationKind::Mentions,
            tier,
            confidence: conf,
            state: if tier == Tier::Structural {
                Some(ResolutionState::Resolved)
            } else {
                None
            },
            provenance,
            scope: scope(),
            observed_at: 0,
        }
    }

    fn fixture() -> (LinkageGraph, NodeId) {
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan"));
        g.upsert_node(doc("b-adr"));
        g.upsert_node(doc("c-far"));
        let a = node_id(&CanonicalKey::Document { stem: "a-plan" });
        let b = node_id(&CanonicalKey::Document { stem: "b-adr" });
        let c = node_id(&CanonicalKey::Document { stem: "c-far" });
        let commit = node_id(&CanonicalKey::Commit { sha: "abc123" });

        // a —structural→ b, b —structural→ c (2 hops), commit —temporal→ a.
        engine_graph::ingest(
            &mut g,
            edge(
                &a,
                &b,
                Tier::Structural,
                Provenance::DocumentBody {
                    blob_hash: "h".into(),
                    span: (2, 3),
                    target: "b-adr".into(),
                },
                0.9,
            ),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            edge(
                &b,
                &c,
                Tier::Structural,
                Provenance::DocumentBody {
                    blob_hash: "h2".into(),
                    span: (0, 1),
                    target: "c-far".into(),
                },
                0.9,
            ),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            edge(
                &commit,
                &a,
                Tier::Temporal,
                Provenance::CommitCorrelation {
                    sha: "abc123".into(),
                    rule: "doc-and-code-in-one-commit".into(),
                },
                0.7,
            ),
            EdgeAttrs::default(),
        )
        .unwrap();
        (g, a)
    }

    #[test]
    fn neighbors_respect_depth_and_tier_filters() {
        let (g, a) = fixture();
        let one_hop = neighbors(&g, &a, 1, &[]).unwrap();
        // a—structural→b is kept; the commit—temporal→a edge is DROPPED because its
        // `commit:<sha>` endpoint is not a materialized graph node (#13 prune, 2026-06-22:
        // the ego serves only edges between real nodes, mirroring the document slice).
        assert_eq!(
            one_hop.edges.len(),
            1,
            "only a's edge to a real node (commit pruned)"
        );
        assert!(!one_hop.nodes.iter().any(|n| n.key == "c-far"));

        let two_hops = neighbors(&g, &a, 2, &[]).unwrap();
        assert!(two_hops.nodes.iter().any(|n| n.key == "c-far"));

        let structural_only = neighbors(&g, &a, 1, &[Tier::Structural]).unwrap();
        assert!(
            structural_only
                .edges
                .iter()
                .all(|e| e.tier == Tier::Structural)
        );
        assert_eq!(structural_only.edges.len(), 1);

        assert!(neighbors(&g, &NodeId("doc:nope".into()), 1, &[]).is_none());
    }

    #[test]
    fn neighbors_prunes_edges_to_unmaterialized_phantom_targets() {
        // #13 (2026-06-22, product decision (b)): a step-mention edge derives its target
        // from the bare mention text (`plan:W01.P01.S01`), which never matches a real
        // plan-container step node (`plan:<stem>/W01/P02/S03`), so it dangles to a
        // phantom the ego must NOT serve (the client `buildEdges` filters it anyway;
        // user directive: never send a filtered-out edge). A mention to a REAL doc is kept.
        let mut g = LinkageGraph::new();
        g.upsert_node(doc("a-plan"));
        g.upsert_node(doc("b-adr"));
        let a = node_id(&CanonicalKey::Document { stem: "a-plan" });
        let b = node_id(&CanonicalKey::Document { stem: "b-adr" });
        let phantom = NodeId("plan:W01.P01.S01".into()); // never upserted: a phantom
        engine_graph::ingest(
            &mut g,
            edge(
                &a,
                &b,
                Tier::Structural,
                Provenance::DocumentBody {
                    blob_hash: "h".into(),
                    span: (0, 1),
                    target: "b-adr".into(),
                },
                0.9,
            ),
            EdgeAttrs::default(),
        )
        .unwrap();
        engine_graph::ingest(
            &mut g,
            edge(
                &a,
                &phantom,
                Tier::Structural,
                Provenance::DocumentBody {
                    blob_hash: "h".into(),
                    span: (2, 3),
                    target: "W01.P01.S01".into(),
                },
                0.9,
            ),
            EdgeAttrs::default(),
        )
        .unwrap();
        let ego = neighbors(&g, &a, 1, &[]).unwrap();
        assert_eq!(
            ego.edges.len(),
            1,
            "phantom-target edge pruned, real edge kept"
        );
        assert!(
            ego.edges.iter().all(|e| e.dst != phantom),
            "no served edge points at the phantom target"
        );
        assert!(
            !ego.nodes.iter().any(|n| n.id == phantom),
            "the phantom is never materialized as a node"
        );
    }

    #[test]
    fn evidence_separates_documents_from_commits() {
        let (g, a) = fixture();
        let ev = evidence(&g, &a).unwrap();
        // Documents are the GUI shape `{ path, doc_type }`, resolved from the
        // graph node's doc_type and the `.vault/<doc_type>/<stem>.md` path.
        assert_eq!(ev.documents.len(), 1);
        assert_eq!(ev.documents[0].doc_type, "adr");
        assert_eq!(ev.documents[0].path, ".vault/adr/b-adr.md");
        assert_eq!(ev.commits.len(), 1);
        assert_eq!(ev.commits[0].rule, "doc-and-code-in-one-commit");
        // Subject is empty in the pure graph projection (the route fills it).
        assert_eq!(ev.commits[0].subject, "");
    }

    #[test]
    fn evidence_serializes_to_the_gui_node_evidence_shape() {
        // S13: the wire item shapes align to the GUI `NodeEvidence` type:
        // documents carry `{ path, doc_type }`, and commits carry `subject`.
        let (g, a) = fixture();
        let ev = evidence(&g, &a).unwrap();
        let value = serde_json::to_value(&ev).unwrap();
        let doc0 = &value["documents"][0];
        assert_eq!(doc0["path"], ".vault/adr/b-adr.md");
        assert_eq!(doc0["doc_type"], "adr");
        let commit0 = &value["commits"][0];
        assert!(commit0.get("subject").is_some(), "commit carries subject");
        assert_eq!(commit0["rule"], "doc-and-code-in-one-commit");
    }

    // --- Plan-interior projection (W03.P08.S45/S46) -------------------------

    fn plan_doc(stem: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: Some(format!("{stem} title")),
            doc_type: Some("plan".into()),
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: Some("L3".into()),
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    fn container(plan_stem: &str, container_id: &str, done: Option<bool>) -> Node {
        Node {
            id: node_id(&CanonicalKey::PlanContainer {
                plan_stem,
                container_id,
            }),
            kind: NodeKind::PlanContainer,
            key: format!("{plan_stem}/{container_id}"),
            title: Some(format!("{container_id} title")),
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![Facet {
                scope: scope(),
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: done.map(|d| engine_model::Lifecycle {
                    state: if d { "complete" } else { "active" }.into(),
                    progress: Some(engine_model::Progress {
                        done: u32::from(d),
                        total: 1,
                    }),
                }),
            }],
        }
    }

    fn contains(g: &mut LinkageGraph, parent: &NodeId, child: &NodeId, salt: &str) {
        let provenance = Provenance::CoreGraph {
            payload_hash: String::new(),
            edge_id: salt.into(),
        };
        let id = edge_id(
            parent,
            child,
            &RelationKind::Contains,
            Tier::Declared,
            &provenance,
        );
        engine_graph::ingest(
            &mut *g,
            Edge {
                id,
                src: parent.clone(),
                dst: child.clone(),
                relation: RelationKind::Contains,
                tier: Tier::Declared,
                confidence: 1.0,
                state: None,
                provenance,
                scope: scope(),
                observed_at: 0,
            },
            EdgeAttrs::default(),
        )
        .unwrap();
    }

    #[test]
    fn a_small_plan_interior_returns_whole_with_no_truncated_block() {
        // W03.P08.S45: a small L3 interior returns the full wave/phase/step
        // tree with completion, and no truncated block.
        let mut g = LinkageGraph::new();
        let stem = "2026-06-14-x-plan";
        g.upsert_node(plan_doc(stem));
        g.upsert_node(container(stem, "W01", None));
        g.upsert_node(container(stem, "W01/P01", None));
        g.upsert_node(container(stem, "W01/P01/S01", Some(true)));
        g.upsert_node(container(stem, "W01/P01/S02", Some(false)));

        let plan = node_id(&CanonicalKey::Document { stem });
        let w = node_id(&CanonicalKey::PlanContainer {
            plan_stem: stem,
            container_id: "W01",
        });
        let p = node_id(&CanonicalKey::PlanContainer {
            plan_stem: stem,
            container_id: "W01/P01",
        });
        let s1 = node_id(&CanonicalKey::PlanContainer {
            plan_stem: stem,
            container_id: "W01/P01/S01",
        });
        let s2 = node_id(&CanonicalKey::PlanContainer {
            plan_stem: stem,
            container_id: "W01/P01/S02",
        });
        contains(&mut g, &plan, &w, "c1");
        contains(&mut g, &w, &p, "c2");
        contains(&mut g, &p, &s1, "c3");
        contains(&mut g, &p, &s2, "c4");

        let interior = plan_interior(&g, &plan).expect("plan interior");
        assert!(
            interior.truncated.is_none(),
            "small interior is not truncated"
        );
        assert_eq!(interior.waves.len(), 1);
        assert!(interior.phases.is_empty() && interior.steps.is_empty());
        let wave = &interior.waves[0];
        assert_eq!(wave.id, "W01");
        assert_eq!(wave.phases.len(), 1);
        let phase = &wave.phases[0];
        assert_eq!(phase.id, "P01");
        assert_eq!(phase.steps.len(), 2);
        assert_eq!(phase.steps[0].id, "S01");
        assert!(phase.steps[0].done, "S01 closed");
        assert!(!phase.steps[1].done, "S02 open");

        // A non-plan node has no interior (truthful None).
        assert!(plan_interior(&g, &s1).is_none());
        assert!(plan_interior(&g, &NodeId("doc:nope".into())).is_none());
    }

    #[test]
    fn an_oversized_plan_interior_truncates_at_the_ceiling_and_reports_the_total() {
        // W03.P08.S46: an interior exceeding the ceiling truncates at the cap,
        // keeps a self-consistent subtree, and reports the honest original
        // total. Build one phase with MAX + 100 steps directly under the plan.
        let mut g = LinkageGraph::new();
        let stem = "2026-06-14-big-plan";
        g.upsert_node(plan_doc(stem));
        let plan = node_id(&CanonicalKey::Document { stem });
        // One top-level phase (L2 shape) so we can cleanly overflow with steps.
        g.upsert_node(container(stem, "P01", None));
        let phase = node_id(&CanonicalKey::PlanContainer {
            plan_stem: stem,
            container_id: "P01",
        });
        contains(&mut g, &plan, &phase, "cp");
        let n_steps = MAX_PLAN_INTERIOR_NODES + 100;
        for i in 0..n_steps {
            let cid = format!("P01/S{i:04}");
            g.upsert_node(container(stem, &cid, Some(false)));
            let s = node_id(&CanonicalKey::PlanContainer {
                plan_stem: stem,
                container_id: &cid,
            });
            contains(&mut g, &phase, &s, &format!("cs{i}"));
        }

        let interior = plan_interior(&g, &plan).expect("plan interior");
        let trunc = interior.truncated.expect("oversized interior truncates");
        assert_eq!(
            trunc.returned_nodes, MAX_PLAN_INTERIOR_NODES,
            "kept exactly the ceiling"
        );
        assert_eq!(
            trunc.total_nodes,
            1 + n_steps,
            "honest total: the phase + every step it contains"
        );
        // Self-consistent: the returned phase carries exactly the steps that fit
        // under the cap (phase counts as 1, so MAX-1 steps).
        assert_eq!(interior.phases.len(), 1);
        assert_eq!(
            interior.phases[0].steps.len(),
            MAX_PLAN_INTERIOR_NODES - 1,
            "phase keeps cap-minus-one steps; no orphan beyond the cap"
        );
    }

    #[test]
    fn node_detail_wraps_the_context_bundle() {
        let (g, a) = fixture();
        let detail = node_detail(&g, &a).unwrap();
        assert_eq!(detail.bundle.node.id, a);
        assert_eq!(detail.bundle.degree_by_tier["structural"], 1);
    }
}
