//! Facet reconciliation across corpus views (engine-spec §4.2, D4.2).
//!
//! Identity lives in the key; branch variance lives in facets. Divergence
//! between facets is not a conflict to resolve — it *is the information*:
//! "this feature is ahead on its branch" is precisely the outer-framework
//! insight nothing else provides. Reconciliation therefore *surfaces*
//! divergence; it never auto-merges.

use engine_model::{Node, NodeId, Presence, ScopeRef};
use serde::Serialize;

/// One surfaced divergence between two corpus views of the same node.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Divergence {
    pub node: NodeId,
    pub kind: DivergenceKind,
    pub scope_a: ScopeRef,
    pub scope_b: ScopeRef,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DivergenceKind {
    /// Present in one view, absent or archived in the other.
    Presence,
    /// Different content bytes across views.
    Content,
    /// Different lifecycle state or progress (plan 60% vs 30%).
    Lifecycle,
}

/// Surface every pairwise divergence among a node's facets.
pub fn divergences(node: &Node) -> Vec<Divergence> {
    let mut out = Vec::new();
    for (i, a) in node.facets.iter().enumerate() {
        for b in node.facets.iter().skip(i + 1) {
            let mut push = |kind| {
                out.push(Divergence {
                    node: node.id.clone(),
                    kind,
                    scope_a: a.scope.clone(),
                    scope_b: b.scope.clone(),
                })
            };
            if a.presence != b.presence {
                push(DivergenceKind::Presence);
            }
            // Content comparison is meaningful only between existing views.
            if a.presence == Presence::Exists
                && b.presence == Presence::Exists
                && a.content_hash != b.content_hash
            {
                push(DivergenceKind::Content);
            }
            if a.lifecycle != b.lifecycle {
                push(DivergenceKind::Lifecycle);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::{CanonicalKey, Facet, Lifecycle, NodeKind, Progress, node_id};

    fn facet(scope: &str, presence: Presence, hash: &str, done: u32) -> Facet {
        Facet {
            scope: ScopeRef::Ref { name: scope.into() },
            presence,
            content_hash: Some(hash.into()),
            lifecycle: Some(Lifecycle {
                state: "active".into(),
                progress: Some(Progress { done, total: 10 }),
            }),
        }
    }

    #[test]
    fn divergence_is_surfaced_per_dimension_never_merged() {
        let node = Node {
            id: node_id(&CanonicalKey::Feature { tag: "editor-demo" }),
            kind: NodeKind::Feature,
            key: "editor-demo".into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec!["editor-demo".into()],
            status: None,
            tier: None,
            facets: vec![
                facet("main", Presence::Exists, "h1", 3),
                facet("feature-x", Presence::Exists, "h2", 6),
            ],
        };
        let found = divergences(&node);
        let kinds: Vec<&DivergenceKind> = found.iter().map(|d| &d.kind).collect();
        assert!(kinds.contains(&&DivergenceKind::Content));
        assert!(kinds.contains(&&DivergenceKind::Lifecycle));
        assert!(!kinds.contains(&&DivergenceKind::Presence));
        // The node's facets are untouched: surfacing, not merging.
        assert_eq!(node.facets.len(), 2);
    }

    #[test]
    fn absent_views_diverge_on_presence_but_not_content() {
        let node = Node {
            id: node_id(&CanonicalKey::Document {
                stem: "2026-06-12-x-adr",
            }),
            kind: NodeKind::Document,
            key: "2026-06-12-x-adr".into(),
            title: None,
            doc_type: None,
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            facets: vec![
                facet("main", Presence::Exists, "h1", 1),
                Facet {
                    scope: ScopeRef::Ref {
                        name: "old-branch".into(),
                    },
                    presence: Presence::Absent,
                    content_hash: None,
                    lifecycle: None,
                },
            ],
        };
        let found = divergences(&node);
        assert!(found.iter().any(|d| d.kind == DivergenceKind::Presence));
        assert!(!found.iter().any(|d| d.kind == DivergenceKind::Content));
    }
}
