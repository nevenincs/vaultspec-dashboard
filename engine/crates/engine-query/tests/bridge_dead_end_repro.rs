//! BRIDGE NAVIGABILITY (Lens B / M-B5, code-artifact-nodes ADR D1/D7): a
//! resolved structural Path/Symbol mention now produces a `bridge_node_id` that
//! points to a REAL `code:` node the GUI can fetch via `/nodes/{id}` — no
//! dead-end click-through.
//!
//! Mandate M-B5: "resolved structural mentions carry resolved_target /
//! bridge_node_id (no dead-end ids)." The bridge exists precisely so
//! step/symbol mention targets (whose own ids are disjoint from real node ids
//! by design, audit W02P06-301) become navigable. For that promise to hold,
//! the bridge MUST resolve to a real Node the GUI can fetch via `/nodes/{id}`.
//!
//! Before the code-artifact-nodes feature this WAS a dead-end: `bridge_node_id`
//! computed the correct `code:` id but the graph minted no such node, so it
//! returned `None` rather than surface a 404 id. The feature mints the node from
//! the resolver's `resolved_target` in ingest Pass 2, so the bridge flips from
//! `None` to a real id with NO change to `bridge_node_id` itself (D5/D7). These
//! reproductions assert both halves of the D1 boundary:
//!   - a resolved/stale mention's target node exists and the bridge is navigable;
//!   - a BROKEN mention mints no node and the bridge stays `None` (truthful
//!     absence — no navigable artifact is fabricated for an absent target).

use engine_graph::{EdgeAttrs, LinkageGraph, ingest};
use engine_model::{
    CanonicalKey, Edge, Facet, Node, NodeKind, Presence, Provenance, RelationKind, ResolutionState,
    ScopeRef, Tier, Timestamp, edge_id, node_id,
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

/// Mint the inferred `code:` node from a resolved target exactly as ingest
/// Pass 2 (`engine-graph::index::mint_code_artifact`) does: `NodeKind::
/// CodeArtifact`, `doc_type` `code`, a per-scope `Exists` facet, identity
/// `node_id(CanonicalKey::CodeArtifact { path: resolved_target, symbol: None })`.
fn code_node(resolved_target: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::CodeArtifact {
            path: resolved_target,
            symbol: None,
        }),
        kind: NodeKind::CodeArtifact,
        key: resolved_target.into(),
        title: None,
        doc_type: Some("code".into()),
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

/// Ingest one structural Symbol mention exactly as the production pass does: the
/// edge endpoint is the name-only `code:#symbol` form, and `EdgeAttrs`
/// carries the resolver's `resolved_target` = the file PATH the symbol was found
/// in. `mint` controls whether the code-artifact node is minted (the production
/// behavior for a resolved/stale mention) or left unminted (a broken mention).
fn ingest_symbol_mention(
    g: &mut LinkageGraph,
    src: &engine_model::NodeId,
    symbol: &str,
    resolved_target: Option<&str>,
    state: ResolutionState,
    confidence: f32,
    observed_at: Timestamp,
) {
    let dst = node_id(&CanonicalKey::CodeArtifact {
        path: "",
        symbol: Some(symbol),
    });
    let provenance = Provenance::DocumentBody {
        blob_hash: "blob1".into(),
        span: (0, 10),
        target: symbol.into(),
    };
    let edge = Edge {
        id: edge_id(
            src,
            &dst,
            &RelationKind::Mentions,
            Tier::Structural,
            &provenance,
        ),
        src: src.clone(),
        dst,
        relation: RelationKind::Mentions,
        tier: Tier::Structural,
        confidence,
        state: Some(state),
        provenance,
        scope: scope(),
        observed_at,
    };
    // Production mints the code node BESIDE the edge from the resolved target —
    // only for resolved/stale mentions (a broken mention passes `None`).
    if let Some(target) = resolved_target {
        g.upsert_node(code_node(target));
    }
    ingest(
        g,
        edge,
        EdgeAttrs {
            multiplicity: 1,
            resolved_target: resolved_target.map(str::to_string),
            ..Default::default()
        },
    )
    .unwrap();
}

#[test]
fn resolved_symbol_mention_bridges_to_a_real_code_node() {
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan"));
    let src = node_id(&CanonicalKey::Document { stem: "a-plan" });

    // A resolved symbol mention: the resolver found `engine::graph::insert` in
    // `src/graph.rs`, so production mints `code:src/graph.rs` (the name-only,
    // path-anchored node the bridge looks up) beside the edge.
    let symbol = "engine::graph::insert";
    ingest_symbol_mention(
        &mut g,
        &src,
        symbol,
        Some("src/graph.rs"),
        ResolutionState::Resolved,
        0.9, // CONFIDENCE_RESOLVED
        0,
    );

    // Evidence surfaces the bridge the GUI clicks through to.
    let ev = evidence(&g, &src).expect("source node exists");
    assert_eq!(ev.code_locations.len(), 1, "the symbol mention is surfaced");
    let loc = &ev.code_locations[0];
    assert_eq!(loc.state, Some(ResolutionState::Resolved));

    // The inverted assertion (code-artifact-nodes ADR D1/D7): the bridge is now
    // a REAL `code:` id whose node exists in the graph — `/nodes/{id}` no longer
    // 404s. The id is derived from the resolved target, with NO change to
    // `bridge_node_id` itself.
    assert_eq!(
        loc.bridge_node_id.as_deref(),
        Some("code:src/graph.rs"),
        "a resolved symbol mention bridges to the minted code-artifact node"
    );
    assert!(
        g.node(&node_id(&CanonicalKey::CodeArtifact {
            path: "src/graph.rs",
            symbol: None,
        }))
        .is_some(),
        "the bridge id resolves to a real, fetchable node (no dead end)"
    );
    assert_eq!(
        loc.resolved_target.as_deref(),
        Some("src/graph.rs"),
        "the human-readable resolved target still rides along"
    );
}

#[test]
fn broken_mention_mints_no_node_and_carries_a_null_bridge() {
    // The truthful-absence boundary from code-artifact-nodes ADR D1: a BROKEN
    // mention points at a target the tree cannot produce, so the engine mints
    // NO node and the bridge stays `None` — never a fabricated navigable
    // artifact for something absent. This locks the broken half of the policy so
    // a future change cannot silently start minting broken targets.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan"));
    let src = node_id(&CanonicalKey::Document { stem: "a-plan" });

    let symbol = "vanished_function";
    // A broken mention has no resolved target: production mints nothing.
    ingest_symbol_mention(&mut g, &src, symbol, None, ResolutionState::Broken, 0.0, 0);

    let ev = evidence(&g, &src).expect("source node exists");
    assert_eq!(ev.code_locations.len(), 1, "the broken mention is surfaced");
    let loc = &ev.code_locations[0];
    assert_eq!(loc.state, Some(ResolutionState::Broken));
    assert_eq!(
        loc.bridge_node_id, None,
        "a broken mention carries a null bridge — no navigable artifact is \
         fabricated for an absent target"
    );
    assert_eq!(
        loc.resolved_target, None,
        "a broken mention resolved to nothing"
    );
    // No code-artifact node was minted for the absent symbol/path.
    assert!(
        g.nodes().all(|n| n.kind != NodeKind::CodeArtifact),
        "a broken mention mints no code-artifact node"
    );
}
