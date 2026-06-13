//! Parser for core's `vaultspec.vault.graph.v2` payload → declared-tier
//! edges (engine-spec §3, §5.1).
//!
//! Declared edges ingest at confidence 1.0 with `kind`/`multiplicity`/
//! `weight` preserved alongside the model edge. Core's separate
//! `derived_edges` array ingests as the distinct `core-derived` relation at
//! confidence 0.8 — never mixed into declared, mirroring core's own
//! discipline.

use engine_model::id::{CanonicalKey, content_hash, edge_id, node_id};
use engine_model::{Edge, Provenance, RelationKind, ScopeRef, Tier, Timestamp};
use serde::Deserialize;

use crate::runner::{CoreError, Result};

pub const DECLARED_CONFIDENCE: f32 = 1.0;
pub const CORE_DERIVED_CONFIDENCE: f32 = 0.8;

/// One vault document as core's graph reports it.
#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct GraphDoc {
    pub id: String,
    /// Core stamps `null` for a PHANTOM node — a document linked-to but
    /// nonexistent in the corpus view (no file to read a type from). Pre-0.1.31
    /// historical refs also lack the `modified` stamp entirely. Both are
    /// legitimate absences, so this is optional: a single phantom must never
    /// fail the whole graph parse and silently drop every declared edge
    /// (2026-06-13 as-of asymmetry — HEAD~N parsed 0 declared edges while HEAD
    /// parsed thousands, flooding `/graph/diff` with phantom add/remove deltas).
    #[serde(default)]
    pub doc_type: Option<String>,
    #[serde(default)]
    pub feature: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    /// Linked-to but nonexistent documents; kept, flagged.
    #[serde(default)]
    pub phantom: bool,
}

/// A declared edge with core's authored attributes preserved verbatim.
#[derive(Debug, Clone, PartialEq)]
pub struct DeclaredEdge {
    pub edge: Edge,
    /// Core's authored relation kind string (e.g. `related`), preserved.
    pub core_kind: String,
    pub multiplicity: u32,
    pub weight: f64,
}

#[derive(Debug)]
pub struct ParsedGraph {
    pub docs: Vec<GraphDoc>,
    pub declared: Vec<DeclaredEdge>,
    /// Core's derived edges, as `core-derived` relation at 0.8 — distinct
    /// from declared, never mixed.
    pub core_derived: Vec<Edge>,
    /// Content hash of the payload, recorded in every edge's provenance.
    pub payload_hash: String,
}

#[derive(Debug, Deserialize)]
struct RawGraph {
    nodes: Vec<GraphDoc>,
    #[serde(default)]
    edges: Vec<RawEdge>,
    #[serde(default)]
    derived_edges: Vec<RawDerivedEdge>,
}

#[derive(Debug, Deserialize)]
struct RawEdge {
    source: String,
    target: String,
    kind: String,
    #[serde(default = "one_u32")]
    multiplicity: u32,
    #[serde(default = "one_f64")]
    weight: f64,
}

#[derive(Debug, Deserialize)]
struct RawDerivedEdge {
    source: String,
    target: String,
    kind: String,
}

fn one_u32() -> u32 {
    1
}
fn one_f64() -> f64 {
    1.0
}

/// Map core's authored kind strings onto the engine relation vocabulary.
/// Unknown kinds fall back to `references` (the authored-link supertype);
/// the verbatim string is preserved on [`DeclaredEdge::core_kind`].
fn relation_for(kind: &str) -> RelationKind {
    match kind {
        "fulfills" => RelationKind::Fulfills,
        "implements" => RelationKind::Implements,
        "resolves" => RelationKind::Resolves,
        "reviews" => RelationKind::Reviews,
        "mentions" => RelationKind::Mentions,
        "touches" => RelationKind::Touches,
        "resembles" => RelationKind::Resembles,
        _ => RelationKind::References,
    }
}

/// Parse a pinned graph-v2 `data` payload into declared-tier edges.
///
/// `scope` names the corpus view the payload was ingested from (per-request
/// scope, engine-spec §2.3); `observed_at` is caller-supplied.
pub fn parse(
    data: &serde_json::Value,
    scope: &ScopeRef,
    observed_at: Timestamp,
) -> Result<ParsedGraph> {
    let payload_hash = content_hash(data.to_string().as_bytes());
    let raw: RawGraph = serde_json::from_value(data.clone()).map_err(CoreError::Json)?;

    let declared = raw
        .edges
        .iter()
        .map(|e| {
            let src = node_id(&CanonicalKey::Document { stem: &e.source });
            let dst = node_id(&CanonicalKey::Document { stem: &e.target });
            let provenance = Provenance::CoreGraph {
                payload_hash: payload_hash.clone(),
                // Stable per logical edge, not per payload: identity
                // survives re-ingestion (contract §2).
                edge_id: format!("{}->{}:{}", e.source, e.target, e.kind),
            };
            let id = edge_id(
                &src,
                &dst,
                &relation_for(&e.kind),
                Tier::Declared,
                &provenance,
            );
            DeclaredEdge {
                edge: Edge {
                    id,
                    src,
                    dst,
                    relation: relation_for(&e.kind),
                    tier: Tier::Declared,
                    confidence: DECLARED_CONFIDENCE,
                    state: None,
                    provenance,
                    scope: scope.clone(),
                    observed_at,
                },
                core_kind: e.kind.clone(),
                multiplicity: e.multiplicity,
                weight: e.weight,
            }
        })
        .collect();

    let core_derived = raw
        .derived_edges
        .iter()
        .map(|e| {
            let src = node_id(&CanonicalKey::Document { stem: &e.source });
            let dst = node_id(&CanonicalKey::Document { stem: &e.target });
            let provenance = Provenance::CoreGraph {
                payload_hash: payload_hash.clone(),
                edge_id: format!("derived:{}->{}:{}", e.source, e.target, e.kind),
            };
            let id = edge_id(
                &src,
                &dst,
                &RelationKind::CoreDerived,
                Tier::Declared,
                &provenance,
            );
            Edge {
                id,
                src,
                dst,
                relation: RelationKind::CoreDerived,
                tier: Tier::Declared,
                confidence: CORE_DERIVED_CONFIDENCE,
                state: None,
                provenance,
                scope: scope.clone(),
                observed_at,
            }
        })
        .collect();

    Ok(ParsedGraph {
        docs: raw.nodes,
        declared,
        core_derived,
        payload_hash,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> ScopeRef {
        ScopeRef::Ref {
            name: "main".into(),
        }
    }

    #[test]
    fn parses_declared_edges_preserving_core_attributes() {
        let data = serde_json::json!({
            "nodes": [
                {"id": "doc-a", "doc_type": "adr", "feature": "f", "phantom": false},
                {"id": "doc-b", "doc_type": "plan"}
            ],
            "edges": [
                {"source": "doc-a", "target": "doc-b", "kind": "related",
                 "multiplicity": 2, "weight": 1.5}
            ],
            "derived_edges": []
        });
        let parsed = parse(&data, &scope(), 7).unwrap();
        assert_eq!(parsed.docs.len(), 2);
        assert_eq!(parsed.declared.len(), 1);
        let d = &parsed.declared[0];
        assert_eq!(d.core_kind, "related");
        assert_eq!(d.multiplicity, 2);
        assert_eq!(d.weight, 1.5);
        assert_eq!(d.edge.confidence, 1.0);
        assert_eq!(d.edge.tier, Tier::Declared);
        assert_eq!(d.edge.src.0, "doc:doc-a");
        assert_eq!(d.edge.observed_at, 7);
    }

    #[test]
    fn derived_edges_are_core_derived_at_point_eight_never_declared() {
        let data = serde_json::json!({
            "nodes": [],
            "edges": [],
            "derived_edges": [
                {"source": "doc-a", "target": "doc-b", "kind": "co_citation",
                 "signals": {"co_citation": 4.0}, "weight": 2.7}
            ]
        });
        let parsed = parse(&data, &scope(), 0).unwrap();
        assert!(parsed.declared.is_empty());
        assert_eq!(parsed.core_derived.len(), 1);
        let e = &parsed.core_derived[0];
        assert_eq!(e.relation, RelationKind::CoreDerived);
        assert_eq!(e.confidence, 0.8);
    }

    #[test]
    fn phantom_node_with_null_doc_type_never_fails_the_parse() {
        // A linked-but-nonexistent doc: core emits it with every field null but
        // `id`. One such phantom previously aborted the entire parse (serde
        // `invalid type: null, expected a string` on `doc_type`), dropping every
        // declared edge — the as-of declared-tier asymmetry that flooded
        // `/graph/diff`. The whole graph must still parse, edges intact.
        let data = serde_json::json!({
            "nodes": [
                {"id": "real-adr", "doc_type": "adr"},
                {"id": "ghost", "doc_type": null, "phantom": true}
            ],
            "edges": [{"source": "real-adr", "target": "ghost", "kind": "related"}],
            "derived_edges": []
        });
        let parsed = parse(&data, &scope(), 0).unwrap();
        assert_eq!(parsed.docs.len(), 2);
        assert_eq!(parsed.declared.len(), 1, "the edge to the phantom survives");
        assert!(parsed.docs.iter().any(|d| d.id == "ghost" && d.doc_type.is_none()));
    }

    #[test]
    fn edge_ids_survive_payload_changes() {
        let mk = |extra_node: bool| {
            let mut nodes = vec![serde_json::json!({"id": "x", "doc_type": "adr"})];
            if extra_node {
                nodes.push(serde_json::json!({"id": "y", "doc_type": "plan"}));
            }
            serde_json::json!({
                "nodes": nodes,
                "edges": [{"source": "doc-a", "target": "doc-b", "kind": "related"}],
                "derived_edges": []
            })
        };
        let a = parse(&mk(false), &scope(), 0).unwrap();
        let b = parse(&mk(true), &scope(), 99).unwrap();
        assert_ne!(a.payload_hash, b.payload_hash, "payloads differ");
        assert_eq!(
            a.declared[0].edge.id, b.declared[0].edge.id,
            "same logical edge keeps its id across re-ingestion"
        );
    }
}
