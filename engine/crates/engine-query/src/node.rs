//! Node queries (contract §4): detail with interior structure, lazy ego
//! neighbors with depth and tier filters, and evidence (documents,
//! resolved code locations, correlated commits).

use std::collections::BTreeSet;

use engine_graph::{ContextBundle, LinkageGraph, context};
use engine_model::{Edge, Node, NodeId, Provenance, ResolutionState, Tier};
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
    edges.sort_by(|a, b| a.id.0.cmp(&b.id.0));
    Some(EgoSlice {
        center: id.clone(),
        nodes,
        edges,
    })
}

/// Evidence for a node (contract §4 `/nodes/{id}/evidence`).
#[derive(Debug, Clone, Serialize)]
pub struct Evidence {
    /// Attached documents (stems of document neighbors).
    pub documents: Vec<String>,
    /// Resolved code locations with live resolution state.
    pub code_locations: Vec<CodeLocation>,
    /// Correlated commits, each with the rule that correlated it.
    pub commits: Vec<CorrelatedCommit>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CodeLocation {
    /// The mention target (path or unqualified symbol).
    pub target: String,
    pub state: Option<ResolutionState>,
    /// What the mention resolved to in the live tree, if anything.
    pub resolved_target: Option<String>,
    /// The navigable bridge (audit W02P06-301 consequence): mention-target
    /// ids are disjoint from real container/file node ids by design, so
    /// the resolved target is surfaced as the real node's id — without it
    /// step/symbol mentions are dead ends on the stage.
    pub bridge_node_id: Option<String>,
}

/// Map a resolved target path to the real node it bridges to — but ONLY when
/// that node actually exists in the graph. A computed id for a target the graph
/// never minted (v1 mints no code-artifact node) would be a dead-end
/// click-through that 404s on `/nodes/{id}` (M-B5, finding LENSB-001), so the
/// bridge is surfaced only when navigable; otherwise None, and the
/// human-readable `resolved_target` still rides along. (Minting code-artifact
/// nodes so code/symbol bridges become navigable is a separate, deferred
/// enhancement.)
fn bridge_node_id(graph: &LinkageGraph, resolved_target: &str) -> Option<String> {
    use engine_model::{CanonicalKey, node_id};
    let nid = if let Some(stem) = resolved_target
        .strip_prefix(".vault/")
        .and_then(|rest| rest.split('/').next_back())
        .and_then(|file| file.strip_suffix(".md"))
    {
        node_id(&CanonicalKey::Document { stem })
    } else {
        node_id(&CanonicalKey::CodeArtifact {
            path: resolved_target,
            symbol: None,
        })
    };
    graph.node(&nid).map(|_| nid.0)
}

#[derive(Debug, Clone, Serialize)]
pub struct CorrelatedCommit {
    pub sha: String,
    /// The named correlation rule that fired (D3.4 attribution).
    pub rule: String,
    pub confidence: f32,
}

pub fn evidence(graph: &LinkageGraph, id: &NodeId) -> Option<Evidence> {
    graph.node(id)?;
    let mut documents = Vec::new();
    let mut code_locations = Vec::new();
    let mut commits = Vec::new();

    for stored in graph.edges_of(id) {
        let edge = &stored.edge;
        let other = if &edge.src == id {
            &edge.dst
        } else {
            &edge.src
        };
        if let Some(stem) = other.0.strip_prefix("doc:")
            && !documents.contains(&stem.to_string())
        {
            documents.push(stem.to_string());
        }
        if (other.0.starts_with("code:") || other.0.starts_with("plan:"))
            && let Provenance::DocumentBody { target, .. } = &edge.provenance
        {
            code_locations.push(CodeLocation {
                target: target.clone(),
                state: edge.state,
                resolved_target: stored.attrs.resolved_target.clone(),
                bridge_node_id: stored
                    .attrs
                    .resolved_target
                    .as_deref()
                    .and_then(|t| bridge_node_id(graph, t)),
            });
        }
        if let Provenance::CommitCorrelation { sha, rule } = &edge.provenance {
            commits.push(CorrelatedCommit {
                sha: sha.clone(),
                rule: rule.clone(),
                confidence: edge.confidence,
            });
        }
    }
    documents.sort();
    code_locations.sort_by(|a, b| a.target.cmp(&b.target));
    commits.sort_by(|a, b| a.sha.cmp(&b.sha));
    Some(Evidence {
        documents,
        code_locations,
        commits,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_graph::EdgeAttrs;
    use engine_model::{
        CanonicalKey, Facet, NodeKind, Presence, RelationKind, ScopeRef, edge_id, node_id,
    };

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    fn doc(stem: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
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
        let code = node_id(&CanonicalKey::CodeArtifact {
            path: "src/lib.rs",
            symbol: None,
        });
        let commit = node_id(&CanonicalKey::Commit { sha: "abc123" });

        // a —structural→ code, a —structural→ b, b —structural→ c (2 hops),
        // commit —temporal→ a.
        engine_graph::ingest(
            &mut g,
            edge(
                &a,
                &code,
                Tier::Structural,
                Provenance::DocumentBody {
                    blob_hash: "h".into(),
                    span: (0, 1),
                    target: "src/lib.rs".into(),
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
        assert_eq!(one_hop.edges.len(), 3, "a's direct edges");
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
        assert_eq!(structural_only.edges.len(), 2);

        assert!(neighbors(&g, &NodeId("doc:nope".into()), 1, &[]).is_none());
    }

    #[test]
    fn evidence_separates_documents_code_and_commits() {
        let (g, a) = fixture();
        let ev = evidence(&g, &a).unwrap();
        assert_eq!(ev.documents, vec!["b-adr"]);
        assert_eq!(ev.code_locations.len(), 1);
        assert_eq!(ev.code_locations[0].target, "src/lib.rs");
        assert_eq!(ev.code_locations[0].state, Some(ResolutionState::Resolved));
        assert_eq!(ev.commits.len(), 1);
        assert_eq!(ev.commits[0].rule, "doc-and-code-in-one-commit");
    }

    #[test]
    fn node_detail_wraps_the_context_bundle() {
        let (g, a) = fixture();
        let detail = node_detail(&g, &a).unwrap();
        assert_eq!(detail.bundle.node.id, a);
        assert!(detail.bundle.degree_by_tier["structural"] >= 2);
    }
}
