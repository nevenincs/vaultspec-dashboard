//! The engine-owned filter object (contract §4, D7.2): validated,
//! normalized, and echoed back; the filter vocabulary is server-enumerated
//! — clients render it, never define it.

use std::collections::BTreeMap;

use engine_graph::{LinkageGraph, StoredEdge};
use engine_model::{Node, ResolutionState};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum FilterError {
    #[error("unknown tier `{0}`")]
    UnknownTier(String),
    #[error("unknown structural state `{0}`")]
    UnknownState(String),
    #[error("min_confidence for `{tier}` must be 0..=1, found {found}")]
    ConfidenceRange { tier: String, found: f32 },
}

/// The wire filter (contract §4). All facets optional; absent = no
/// constraint. `deny_unknown_fields` keeps the grammar engine-owned:
/// a client inventing a facet fails loud instead of being ignored.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, default)]
pub struct Filter {
    /// Tier toggles: tier wire name → on/off.
    pub tiers: BTreeMap<String, bool>,
    /// Per-tier minimum confidence, floats 0..=1 (contract R3).
    pub min_confidence: BTreeMap<String, f32>,
    /// Edge relation wire names.
    pub relations: Vec<String>,
    /// Structural edge states (powers the "show broken" lens).
    pub structural_state: Vec<String>,
    /// Node kind wire names.
    pub kinds: Vec<String>,
    /// Feature tags.
    pub feature_tags: Vec<String>,
    /// Case-insensitive text match over node key/title.
    pub text: Option<String>,
}

const TIER_NAMES: &[&str] = &["declared", "structural", "temporal", "semantic"];
const STATE_NAMES: &[&str] = &["resolved", "stale", "broken"];

impl Filter {
    /// Validate and normalize (sort lists, lowercase names). The
    /// normalized form is what gets echoed back to clients.
    pub fn validated(mut self) -> Result<Filter, FilterError> {
        for name in self.tiers.keys().chain(self.min_confidence.keys()) {
            if !TIER_NAMES.contains(&name.as_str()) {
                return Err(FilterError::UnknownTier(name.clone()));
            }
        }
        for (tier, value) in &self.min_confidence {
            if !(0.0..=1.0).contains(value) {
                return Err(FilterError::ConfidenceRange {
                    tier: tier.clone(),
                    found: *value,
                });
            }
        }
        for state in &self.structural_state {
            if !STATE_NAMES.contains(&state.as_str()) {
                return Err(FilterError::UnknownState(state.clone()));
            }
        }
        self.relations.sort();
        self.relations.dedup();
        self.structural_state.sort();
        self.structural_state.dedup();
        self.kinds.sort();
        self.kinds.dedup();
        self.feature_tags.sort();
        self.feature_tags.dedup();
        Ok(self)
    }

    /// Does an edge pass this filter?
    pub fn matches_edge(&self, stored: &StoredEdge) -> bool {
        let edge = &stored.edge;
        let tier_name = edge.tier.as_str();
        if let Some(false) = self.tiers.get(tier_name) {
            return false;
        }
        if let Some(min) = self.min_confidence.get(tier_name) {
            // Broken edges are surfaced via the structural-state facet,
            // not hidden by confidence arithmetic (audit ruling
            // W02P05-201): when the state facet explicitly asks for
            // broken, the floor does not apply to them.
            let explicitly_broken = edge.state == Some(ResolutionState::Broken)
                && self.structural_state.iter().any(|s| s == "broken");
            if !explicitly_broken && edge.confidence < *min {
                return false;
            }
        }
        if !self.relations.is_empty() && !self.relations.iter().any(|r| r == edge.relation.as_str())
        {
            return false;
        }
        if !self.structural_state.is_empty() {
            // Non-structural edges (state None) are not excluded by the
            // structural facet; the facet narrows structural edges only.
            let state_name = match edge.state {
                Some(ResolutionState::Resolved) => Some("resolved"),
                Some(ResolutionState::Stale) => Some("stale"),
                Some(ResolutionState::Broken) => Some("broken"),
                None => None,
            };
            if let Some(name) = state_name
                && !self.structural_state.iter().any(|s| s == name)
            {
                return false;
            }
        }
        true
    }

    /// Does a node pass this filter?
    pub fn matches_node(&self, node: &Node) -> bool {
        if !self.kinds.is_empty() {
            let kind = serde_json::to_value(&node.kind)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
                .unwrap_or_default();
            if !self.kinds.contains(&kind) {
                return false;
            }
        }
        if !self.feature_tags.is_empty()
            && !node
                .feature_tags
                .iter()
                .any(|t| self.feature_tags.contains(t))
        {
            return false;
        }
        if let Some(text) = &self.text {
            let needle = text.to_lowercase();
            let hit = node.key.to_lowercase().contains(&needle)
                || node
                    .title
                    .as_deref()
                    .is_some_and(|t| t.to_lowercase().contains(&needle));
            if !hit {
                return false;
            }
        }
        true
    }
}

/// Inclusive corpus date span (contract §4 `/filters` date bounds): the
/// min/max of the nodes' frontmatter `created` dates, the field a client's
/// date-range facet constrains against. ISO `yyyy-mm-dd` strings compare
/// lexically, so the bounds are well-ordered without date parsing. Absent
/// (serialized `null`) when no node in the graph carries a created date.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DateBounds {
    pub min: String,
    pub max: String,
}

/// The legal filter vocabulary actually present in a graph (contract §4
/// `/filters`): data-driven, nothing hardcoded client-side. Carries the full
/// §4 facet set — relation types, tiers, doc types, feature tags, node kinds,
/// date bounds, and refs — so the filter UI enumerates every facet from one
/// server read.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Vocabulary {
    pub tiers: Vec<&'static str>,
    pub relations: Vec<String>,
    pub kinds: Vec<String>,
    pub doc_types: Vec<String>,
    pub feature_tags: Vec<String>,
    pub structural_states: Vec<&'static str>,
    /// Inclusive corpus date span; `null` when no node carries a created date.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_bounds: Option<DateBounds>,
    /// The corpus-view refs actually present in node facets (worktree paths
    /// or ref names) — the time/scope axis surfaced data-driven, never a
    /// hardcoded client list.
    pub refs: Vec<String>,
}

pub fn vocabulary(graph: &LinkageGraph) -> Vocabulary {
    let mut relations: Vec<String> = graph
        .edges()
        .map(|s| s.edge.relation.as_str().to_string())
        .collect();
    relations.sort();
    relations.dedup();
    let mut kinds: Vec<String> = graph
        .nodes()
        .filter_map(|n| {
            serde_json::to_value(&n.kind)
                .ok()
                .and_then(|v| v.as_str().map(str::to_string))
        })
        .collect();
    kinds.sort();
    kinds.dedup();
    let mut doc_types: Vec<String> = graph.nodes().filter_map(|n| n.doc_type.clone()).collect();
    doc_types.sort();
    doc_types.dedup();
    let mut feature_tags: Vec<String> = graph
        .nodes()
        .flat_map(|n| n.feature_tags.iter().cloned())
        .collect();
    feature_tags.sort();
    feature_tags.dedup();
    // Corpus date span from frontmatter `created` dates (ISO yyyy-mm-dd,
    // lexically ordered): the bounds a date-range facet selects within.
    let date_bounds = graph
        .nodes()
        .filter_map(|n| n.dates.as_ref().and_then(|d| d.created.clone()))
        .fold(None::<(String, String)>, |acc, date| match acc {
            None => Some((date.clone(), date)),
            Some((min, max)) => Some((min.min(date.clone()), max.max(date))),
        })
        .map(|(min, max)| DateBounds { min, max });
    // Refs actually present in node facets: the scope/time axis, data-driven.
    let mut refs: Vec<String> = graph
        .nodes()
        .flat_map(|n| n.facets.iter())
        .map(|f| match &f.scope {
            engine_model::ScopeRef::Worktree { path } => path.clone(),
            engine_model::ScopeRef::Ref { name } => name.clone(),
        })
        .collect();
    refs.sort();
    refs.dedup();
    Vocabulary {
        tiers: TIER_NAMES.to_vec(),
        relations,
        kinds,
        doc_types,
        feature_tags,
        structural_states: STATE_NAMES.to_vec(),
        date_bounds,
        refs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_rejects_unknown_names_and_bad_ranges() {
        let bad_tier: Filter = serde_json::from_str(r#"{"tiers": {"psychic": true}}"#).unwrap();
        assert_eq!(
            bad_tier.validated(),
            Err(FilterError::UnknownTier("psychic".into()))
        );
        let bad_conf: Filter =
            serde_json::from_str(r#"{"min_confidence": {"temporal": 1.5}}"#).unwrap();
        assert!(matches!(
            bad_conf.validated(),
            Err(FilterError::ConfidenceRange { .. })
        ));
        let bad_state: Filter = serde_json::from_str(r#"{"structural_state": ["wonky"]}"#).unwrap();
        assert_eq!(
            bad_state.validated(),
            Err(FilterError::UnknownState("wonky".into()))
        );
        // Engine-owned grammar: unknown facets fail loud.
        assert!(serde_json::from_str::<Filter>(r#"{"vibes": "good"}"#).is_err());
    }

    #[test]
    fn vocabulary_emits_the_full_contract_facet_set() {
        // Contract §4 names the complete /filters facet set: relations,
        // tiers, doc types, feature tags, node kinds, date bounds, and refs.
        // This is the data-driven enumeration the filter UI renders.
        use engine_model::{
            CanonicalKey, Dates, Facet, Node, NodeKind, Presence, ScopeRef, node_id,
        };

        fn doc(stem: &str, doc_type: &str, created: &str, feature: &str, scope: ScopeRef) -> Node {
            Node {
                id: node_id(&CanonicalKey::Document { stem }),
                kind: NodeKind::Document,
                key: stem.to_string(),
                title: None,
                doc_type: Some(doc_type.to_string()),
                dates: Some(Dates {
                    created: Some(created.to_string()),
                    modified: None,
                }),
                feature_tags: vec![feature.to_string()],
                facets: vec![Facet {
                    scope,
                    presence: Presence::Exists,
                    content_hash: None,
                    lifecycle: None,
                }],
            }
        }

        let mut graph = LinkageGraph::new();
        graph.upsert_node(doc(
            "p1",
            "plan",
            "2026-06-12",
            "alpha",
            ScopeRef::Worktree {
                path: "/wt/main".into(),
            },
        ));
        graph.upsert_node(doc(
            "a1",
            "adr",
            "2026-06-10",
            "beta",
            ScopeRef::Ref {
                name: "feature-x".into(),
            },
        ));
        // Duplicate doc_type / scope to prove dedup; later created date to
        // prove the max bound moves.
        graph.upsert_node(doc(
            "p2",
            "plan",
            "2026-06-14",
            "alpha",
            ScopeRef::Worktree {
                path: "/wt/main".into(),
            },
        ));

        let vocab = vocabulary(&graph);
        assert_eq!(vocab.doc_types, vec!["adr", "plan"], "sorted, deduped");
        assert_eq!(vocab.feature_tags, vec!["alpha", "beta"]);
        assert_eq!(
            vocab.date_bounds,
            Some(DateBounds {
                min: "2026-06-10".into(),
                max: "2026-06-14".into(),
            }),
            "corpus min/max over created dates"
        );
        assert_eq!(
            vocab.refs,
            vec!["/wt/main", "feature-x"],
            "distinct facet scopes, sorted + deduped"
        );

        // An empty graph carries absent date bounds (serialized null), never a
        // bogus pair.
        let empty = vocabulary(&LinkageGraph::new());
        assert_eq!(empty.date_bounds, None);
        assert!(empty.doc_types.is_empty() && empty.refs.is_empty());
    }

    #[test]
    fn normalization_sorts_and_dedups_for_a_stable_echo() {
        let filter: Filter = serde_json::from_str(
            r#"{"relations": ["mentions", "fulfills", "mentions"],
                "structural_state": ["stale", "broken", "stale"]}"#,
        )
        .unwrap();
        let normalized = filter.validated().unwrap();
        assert_eq!(normalized.relations, vec!["fulfills", "mentions"]);
        assert_eq!(normalized.structural_state, vec!["broken", "stale"]);
    }
}
