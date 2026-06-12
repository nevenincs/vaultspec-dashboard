//! Fixture tests against live core JSON payloads (W01.P03.S14).
//!
//! Fixtures were recorded from vaultspec-core 0.1.28 against this
//! repository's own vault on 2026-06-12 — real envelopes, not hand-written
//! approximations.

use engine_model::{ScopeRef, Tier};
use ingest_core::runner::Envelope;
use ingest_core::{graph_v2, inventory};

fn fixture(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    std::fs::read_to_string(path).expect("fixture readable")
}

fn scope() -> ScopeRef {
    ScopeRef::Ref {
        name: "main".into(),
    }
}

#[test]
fn live_graph_v2_payload_parses_end_to_end() {
    let envelope = Envelope::parse_pinned(
        &fixture("vault-graph-v2.json"),
        ingest_core::SUPPORTED_GRAPH_SCHEMAS,
    )
    .expect("schema pinned");
    let data = envelope.data().expect("payload present");
    let parsed = graph_v2::parse(&data, &scope(), 0).expect("parses");

    assert_eq!(parsed.docs.len(), 26, "recorded vault has 26 documents");
    assert_eq!(parsed.declared.len(), 54, "54 declared edges");
    assert_eq!(parsed.core_derived.len(), 203, "203 derived edges");

    // Declared discipline: confidence 1.0, tier declared, kind preserved.
    assert!(parsed.declared.iter().all(|d| d.edge.confidence == 1.0
        && d.edge.tier == Tier::Declared
        && !d.core_kind.is_empty()));
    // Core-derived discipline: 0.8, never mixed into declared relations.
    assert!(
        parsed
            .core_derived
            .iter()
            .all(|e| e.confidence == 0.8 && e.relation == engine_model::RelationKind::CoreDerived)
    );

    // Identity: every edge id unique within the payload.
    let mut ids: Vec<_> = parsed
        .declared
        .iter()
        .map(|d| d.edge.id.0.clone())
        .chain(parsed.core_derived.iter().map(|e| e.id.0.clone()))
        .collect();
    let total = ids.len();
    ids.sort();
    ids.dedup();
    assert_eq!(ids.len(), total, "edge ids are unique");
}

#[test]
fn live_graph_reparse_is_deterministic() {
    let envelope = Envelope::parse_pinned(
        &fixture("vault-graph-v2.json"),
        ingest_core::SUPPORTED_GRAPH_SCHEMAS,
    )
    .unwrap();
    let data = envelope.data().unwrap();
    let a = graph_v2::parse(&data, &scope(), 0).unwrap();
    let b = graph_v2::parse(&data, &scope(), 0).unwrap();
    assert_eq!(a.payload_hash, b.payload_hash);
    assert_eq!(a.declared, b.declared);
    assert_eq!(a.core_derived, b.core_derived);
}

#[test]
fn live_list_payload_parses() {
    let envelope = Envelope::parse_pinned(
        &fixture("vault-list.json"),
        ingest_core::SUPPORTED_LIST_SCHEMAS,
    )
    .unwrap();
    let docs = inventory::parse_list(&envelope.data().unwrap()).unwrap();
    assert_eq!(docs.len(), 26);
    assert!(docs.iter().any(|d| d.doc_type == "adr"));
    assert!(docs.iter().all(|d| !d.name.is_empty()));
}

#[test]
fn live_stats_payload_parses() {
    let envelope = Envelope::parse_pinned(
        &fixture("vault-stats.json"),
        ingest_core::SUPPORTED_STATS_SCHEMAS,
    )
    .unwrap();
    let stats = inventory::parse_stats(&envelope.data().unwrap()).unwrap();
    assert_eq!(stats.total_docs, 26);
    assert_eq!(stats.total_features, 3);
    assert_eq!(stats.counts_by_type["exec"], 14);
}

#[test]
fn live_feature_list_payload_parses() {
    let envelope = Envelope::parse_pinned(
        &fixture("vault-feature-list.json"),
        ingest_core::SUPPORTED_FEATURE_LIST_SCHEMAS,
    )
    .unwrap();
    let features = inventory::parse_feature_list(&envelope.data().unwrap()).unwrap();
    assert_eq!(features.len(), 3);
    let engine = features
        .iter()
        .find(|f| f.name == "vaultspec-engine")
        .expect("engine feature present");
    assert!(engine.has_plan);
}
