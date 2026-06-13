//! ADVERSARIAL REPRO (Lens B / M-B5): a resolved structural Symbol mention
//! produces a `bridge_node_id` that points to a node that does NOT exist in
//! the graph — a dead-end click-through.
//!
//! Mandate M-B5: "resolved structural mentions carry resolved_target /
//! bridge_node_id (no dead-end ids)." The bridge exists precisely so
//! step/symbol mention targets (whose own ids are disjoint from real node ids
//! by design, audit W02P06-301) become navigable. For that promise to hold,
//! the bridge MUST resolve to a real Node the GUI can fetch via
//! `/nodes/{id}`.
//!
//! This test ingests a single resolved Symbol mention exactly as the
//! production structural pass does (edge endpoint `code:#symbol`, attrs
//! carrying the resolver's `resolved_target` = the file PATH the symbol was
//! found in). It then asks `engine_query::node::evidence` for the bridge and
//! shows the bridge id has no Node in the graph — the GUI click-through 404s.

use engine_graph::{EdgeAttrs, LinkageGraph, ingest};
use engine_model::{
    CanonicalKey, Edge, Facet, Node, NodeKind, Presence, Provenance, RelationKind,
    ResolutionState, ScopeRef, Tier, edge_id, node_id,
};
use engine_query::node::evidence;

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

#[test]
fn resolved_symbol_mention_emits_no_dead_end_bridge() {
    let mut g = LinkageGraph::new();

    // The mentioning document is the only real (upserted) node.
    g.upsert_node(doc("a-plan"));
    let src = node_id(&CanonicalKey::Document { stem: "a-plan" });

    // A Symbol mention's dst id is the symbol-qualified code-artifact form
    // `code:#engine::graph::insert` (engine-graph index.rs:344-348:
    // CanonicalKey::CodeArtifact { path: "", symbol: Some(sym) }). The
    // structural-edge provenance carries the mention text in `target`.
    let symbol = "engine::graph::insert";
    let dst = node_id(&CanonicalKey::CodeArtifact {
        path: "",
        symbol: Some(symbol),
    });
    assert_eq!(dst.0, "code:#engine::graph::insert");

    let provenance = Provenance::DocumentBody {
        blob_hash: "blob1".into(),
        span: (0, 10),
        target: symbol.into(),
    };
    let edge = Edge {
        id: edge_id(&src, &dst, &RelationKind::Mentions, Tier::Structural, &provenance),
        src: src.clone(),
        dst: dst.clone(),
        relation: RelationKind::Mentions,
        tier: Tier::Structural,
        confidence: 0.9, // CONFIDENCE_RESOLVED
        state: Some(ResolutionState::Resolved),
        provenance,
        scope: scope(),
        observed_at: 0,
    };

    // The resolver (ingest-struct resolve.rs::resolve_symbol) returns the
    // PATH the symbol was found in as the resolved target — e.g.
    // "src/graph.rs". This rides in EdgeAttrs.resolved_target exactly as the
    // production index pass passes it (index.rs:227-237).
    ingest(
        &mut g,
        edge,
        EdgeAttrs {
            multiplicity: 1,
            resolved_target: Some("src/graph.rs".into()),
            ..Default::default()
        },
    )
    .unwrap();

    // Evidence surfaces the bridge that the GUI clicks through to.
    let ev = evidence(&g, &src).expect("source node exists");
    assert_eq!(ev.code_locations.len(), 1, "the symbol mention is surfaced");
    let loc = &ev.code_locations[0];
    assert_eq!(loc.state, Some(ResolutionState::Resolved));

    // M-B5 (no dead-end ids): v1 mints NO code-artifact node, so the bridge to
    // a code/symbol target is not navigable. The engine must surface None —
    // NEVER a dead-end id that 404s on /nodes/{id} — while the human-readable
    // resolved_target still rides along (LENSB-001 fix: the bridge is gated on
    // the target node actually existing). Full code/symbol navigability (minting
    // code-artifact nodes) is a separate, deferred enhancement.
    assert_eq!(
        loc.bridge_node_id, None,
        "a resolved code/symbol mention whose target node is not minted must \
         surface bridge_node_id=None, not a dead-end id"
    );
    assert_eq!(
        loc.resolved_target.as_deref(),
        Some("src/graph.rs"),
        "the human-readable resolved target still rides along"
    );
}
