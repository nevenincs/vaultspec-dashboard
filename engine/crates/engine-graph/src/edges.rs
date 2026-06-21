//! Edge ingestion (engine-spec §3, D3.1/D3.2): tier and provenance are
//! mandatory by type; this module enforces the **fixed per-tier confidence
//! bands** and the structural-state invariants at the graph boundary, so
//! no malformed edge can enter the in-memory graph.
//!
//! Bands (D3.2 — fixed, nothing learned or tunable in v1):
//! - declared: exactly 1.0, or exactly 0.8 for the `core-derived` relation
//! - structural: 0.9 (resolved), 0.5 (stale), 0.0 (broken — retained,
//!   flagged, floor confidence)
//! - temporal: 0.3 ..= 0.9
//!
//! Semantic (RAG) matches are NOT a graph tier (D3.5): they are ephemeral
//! suggestions that live in the rag client's ephemeral TTL cache, never in the
//! graph. `Tier` carries no `Semantic` variant, so a `"semantic"` edge tier
//! string fails to deserialize as an unknown tier — rejected by the normal
//! unknown-tier path, no special-case here.

use engine_model::{Edge, RelationKind, ResolutionState, Tier};

use crate::graph::{EdgeAttrs, LinkageGraph};

pub const STRUCTURAL_BROKEN_CONFIDENCE: f32 = 0.0;
pub const TEMPORAL_BAND: (f32, f32) = (0.3, 0.9);

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum EdgeError {
    #[error("confidence {found} outside the fixed {tier:?} band")]
    OutOfBand { tier: Tier, found: f32 },
    #[error("structural edge missing resolution state")]
    MissingState,
    #[error("resolution state on non-structural tier {0:?}")]
    StateOnNonStructural(Tier),
    #[error("structural state {state:?} requires confidence {expected}, found {found}")]
    StateBandMismatch {
        state: ResolutionState,
        expected: f32,
        found: f32,
    },
}

/// Validate an edge against the fixed bands and invariants.
pub fn validate(edge: &Edge) -> Result<(), EdgeError> {
    match edge.tier {
        Tier::Declared => {
            if edge.state.is_some() {
                return Err(EdgeError::StateOnNonStructural(Tier::Declared));
            }
            let expected = if edge.relation == RelationKind::CoreDerived {
                0.8
            } else {
                1.0
            };
            if edge.confidence != expected {
                return Err(EdgeError::OutOfBand {
                    tier: Tier::Declared,
                    found: edge.confidence,
                });
            }
        }
        Tier::Structural => {
            let state = edge.state.ok_or(EdgeError::MissingState)?;
            let expected = match state {
                ResolutionState::Resolved => ingest_struct::CONFIDENCE_RESOLVED,
                ResolutionState::Stale => ingest_struct::CONFIDENCE_STALE,
                ResolutionState::Broken => STRUCTURAL_BROKEN_CONFIDENCE,
            };
            if edge.confidence != expected {
                return Err(EdgeError::StateBandMismatch {
                    state,
                    expected,
                    found: edge.confidence,
                });
            }
        }
        Tier::Temporal => {
            if edge.state.is_some() {
                return Err(EdgeError::StateOnNonStructural(Tier::Temporal));
            }
            if !(TEMPORAL_BAND.0..=TEMPORAL_BAND.1).contains(&edge.confidence) {
                return Err(EdgeError::OutOfBand {
                    tier: Tier::Temporal,
                    found: edge.confidence,
                });
            }
        }
    }
    Ok(())
}

/// Validate and insert. Same-id re-ingestion REPLACES (idempotent, audit
/// W02P05-202): multiplicity is aggregated at extraction granularity and
/// passed once via [`EdgeAttrs`] (audit W01P01-003); core's weight is
/// explicitly carried (audit W01P03-103). The freshest observation wins.
pub fn ingest(graph: &mut LinkageGraph, edge: Edge, attrs: EdgeAttrs) -> Result<(), EdgeError> {
    validate(&edge)?;
    graph.insert_validated_edge(edge, attrs);
    Ok(())
}

#[cfg(test)]
pub(crate) mod ingest_test_helpers {
    use engine_model::{
        CanonicalKey, Edge, NodeId, Provenance, RelationKind, ScopeRef, Tier, edge_id, node_id,
    };

    /// A valid declared edge between two document stems; `salt` keeps
    /// provenance (and therefore ids) distinct across calls.
    pub(crate) fn declared_edge(src_stem: &str, dst_stem: &str, salt: u32) -> Edge {
        let src: NodeId = node_id(&CanonicalKey::Document { stem: src_stem });
        let dst: NodeId = node_id(&CanonicalKey::Document { stem: dst_stem });
        let provenance = Provenance::CoreGraph {
            payload_hash: "h".into(),
            edge_id: format!("{src_stem}->{dst_stem}:{salt}"),
        };
        let id = edge_id(
            &src,
            &dst,
            &RelationKind::References,
            Tier::Declared,
            &provenance,
        );
        Edge {
            id,
            src,
            dst,
            relation: RelationKind::References,
            tier: Tier::Declared,
            confidence: 1.0,
            state: None,
            provenance,
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            observed_at: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use engine_model::{EdgeId, NodeId, Provenance, ScopeRef};

    fn edge(tier: Tier, confidence: f32, state: Option<ResolutionState>) -> Edge {
        Edge {
            id: EdgeId(format!("e-{tier:?}-{confidence}")),
            src: NodeId("doc:a".into()),
            dst: NodeId("doc:b".into()),
            relation: RelationKind::References,
            tier,
            confidence,
            state,
            provenance: Provenance::CoreGraph {
                payload_hash: "h".into(),
                edge_id: "1".into(),
            },
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            observed_at: 0,
        }
    }

    #[test]
    fn bands_are_enforced_per_tier() {
        assert!(validate(&edge(Tier::Declared, 1.0, None)).is_ok());
        assert!(validate(&edge(Tier::Declared, 0.9, None)).is_err());
        assert!(
            validate(&edge(
                Tier::Structural,
                0.9,
                Some(ResolutionState::Resolved)
            ))
            .is_ok()
        );
        assert!(validate(&edge(Tier::Structural, 0.5, Some(ResolutionState::Stale))).is_ok());
        assert!(
            validate(&edge(Tier::Structural, 0.0, Some(ResolutionState::Broken))).is_ok(),
            "broken edges are retained, flagged, never dropped (D3.3)"
        );
        assert_eq!(
            validate(&edge(Tier::Structural, 0.9, None)),
            Err(EdgeError::MissingState)
        );
        assert!(validate(&edge(Tier::Temporal, 0.7, None)).is_ok());
        assert!(validate(&edge(Tier::Temporal, 0.2, None)).is_err());
    }

    #[test]
    fn a_semantic_edge_tier_is_rejected_as_an_unknown_tier_never_minted() {
        // Semantic (RAG) matches are ephemeral suggestions, never graph fact
        // (D3.5). With no `Tier::Semantic` variant, a `"semantic"` edge tier on
        // the wire is rejected by the normal unknown-tier deserialize path — the
        // same path any unknown tier string takes — rather than a special-case
        // ingestion error. It is rejected gracefully (an Err), never a panic.
        let valid = edge(Tier::Declared, 1.0, None);
        let json = serde_json::to_string(&valid).unwrap();
        assert!(
            json.contains("\"tier\":\"declared\""),
            "sanity: tier encodes"
        );
        // The only change is the tier string -> the now-unknown "semantic".
        let with_semantic = json.replace("\"tier\":\"declared\"", "\"tier\":\"semantic\"");
        let parsed: Result<Edge, _> = serde_json::from_str(&with_semantic);
        assert!(
            parsed.is_err(),
            "a `semantic` edge tier deserializes as an unknown tier (rejected, never minted)"
        );
    }

    #[test]
    fn same_id_reingestion_is_idempotent_replace_not_increment() {
        // Audit W02P05-202: re-ingesting the same logical edge (dirtied
        // doc re-extract, double watcher fire) must not inflate
        // multiplicity — the value is aggregated upstream and replaces.
        let mut g = LinkageGraph::new();
        let e = edge(Tier::Declared, 1.0, None);
        ingest(
            &mut g,
            e.clone(),
            EdgeAttrs {
                multiplicity: 3,
                ..Default::default()
            },
        )
        .unwrap();
        let mut later = e.clone();
        later.observed_at = 99;
        ingest(
            &mut g,
            later,
            EdgeAttrs {
                multiplicity: 3,
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(g.edge_count(), 1, "one logical edge");
        let stored = g.edge(&e.id).unwrap();
        assert_eq!(stored.attrs.multiplicity, 3, "replace, never inflate");
        assert_eq!(stored.edge.observed_at, 99, "freshest observation kept");
    }
}
