use super::*;
use engine_graph::EdgeAttrs;
use engine_model::{
    CanonicalKey, Facet, NodeKind, Presence, Provenance, RelationKind, ResolutionState, Tier,
    edge_id, node_id,
};

fn scope() -> ScopeRef {
    ScopeRef::Ref {
        name: "main".into(),
    }
}

fn doc(stem: &str, feature: &str) -> Node {
    // Infer a doc_type from the stem's trailing segment so the ontology
    // projection (authority_class, derivation) has real types to read.
    let doc_type = match stem.rsplit('-').next() {
        Some(t @ ("plan" | "adr" | "exec" | "audit" | "research" | "reference")) => {
            Some(t.to_string())
        }
        _ => None,
    };
    Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.into(),
        title: None,
        doc_type,
        dates: None,
        feature_tags: vec![feature.into()],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    }
}

fn structural(src: &str, dst: &str, state: ResolutionState, confidence: f32) -> Edge {
    let s = node_id(&CanonicalKey::Document { stem: src });
    let d = node_id(&CanonicalKey::Document { stem: dst });
    let provenance = Provenance::DocumentBody {
        blob_hash: "b".into(),
        span: (0, 1),
        target: dst.into(),
    };
    Edge {
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
        confidence,
        state: Some(state),
        provenance,
        scope: scope(),
        observed_at: 0,
    }
}

fn fixture() -> LinkageGraph {
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    g.upsert_node(doc("b-adr", "feature-b"));
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "b-adr", ResolutionState::Resolved, 0.9),
        EdgeAttrs::default(),
    )
    .unwrap();
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "gone-doc", ResolutionState::Broken, 0.0),
        EdgeAttrs::default(),
    )
    .unwrap();
    g
}

#[test]
fn health_filter_selects_dangling_and_orphaned_nodes() {
    // filter-controls campaign: the health facet narrows by graph-derived
    // conditions — `dangling` (a broken outgoing edge) and `orphaned` (no
    // incoming edge) — applied in graph_query (graph context), and an
    // out-of-set condition 400s.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "f")); // → b (resolved) and → gone (broken)
    g.upsert_node(doc("b-adr", "f")); // has incoming from a-plan: healthy
    g.upsert_node(doc("c-research", "f")); // no edges: orphaned, not dangling
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "b-adr", ResolutionState::Resolved, 0.9),
        EdgeAttrs::default(),
    )
    .unwrap();
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "gone", ResolutionState::Broken, 0.0),
        EdgeAttrs::default(),
    )
    .unwrap();

    let a = node_id(&CanonicalKey::Document { stem: "a-plan" }).0;
    let c = node_id(&CanonicalKey::Document { stem: "c-research" }).0;
    let ids = |slice: GraphSlice| {
        let mut v: Vec<String> = slice
            .nodes
            .iter()
            .map(|n| n["id"].as_str().unwrap().to_string())
            .collect();
        v.sort();
        v
    };

    // dangling → only a-plan (it owns the broken outgoing edge).
    let dangling = Filter {
        health: vec!["dangling".into()],
        ..Default::default()
    };
    assert_eq!(
        ids(graph_query(&g, &scope(), dangling, Granularity::Document).unwrap()),
        vec![a.clone()]
    );

    // orphaned → a-plan and c-research (nothing links to them); b-adr is
    // excluded because a-plan links to it.
    let orphaned = Filter {
        health: vec!["orphaned".into()],
        ..Default::default()
    };
    let mut want = vec![a.clone(), c.clone()];
    want.sort();
    assert_eq!(
        ids(graph_query(&g, &scope(), orphaned, Granularity::Document).unwrap()),
        want
    );

    // The vocabulary enumerates the conditions actually present, canonical order.
    assert_eq!(
        crate::filter::vocabulary(&g).health,
        vec!["dangling".to_string(), "orphaned".to_string()]
    );

    // An out-of-set health condition 400s loud.
    let bad: Filter = serde_json::from_str(r#"{"health": ["rotten"]}"#).unwrap();
    assert!(matches!(
        bad.validated(),
        Err(crate::filter::FilterError::UnknownHealth(_))
    ));
}

#[test]
fn cached_document_query_is_byte_identical_to_uncached() {
    // A1 correctness invariant: reusing the per-generation enriched views via
    // graph_query_cached must produce exactly the same slice as recomputing
    // them in graph_query — both filtered and unfiltered.
    let g = fixture();
    let views = build_document_views(&g, &scope());
    for filter in [
        Filter::default(),
        serde_json::from_str(r#"{"feature_tags": ["feature-a"]}"#).unwrap(),
        serde_json::from_str(r#"{"structural_state": ["resolved"]}"#).unwrap(),
    ] {
        let uncached = graph_query(&g, &scope(), filter.clone(), Granularity::Document).unwrap();
        let cached =
            graph_query_cached(&g, &scope(), filter, Granularity::Document, &views).unwrap();
        assert_eq!(
            serde_json::to_value(&uncached).unwrap(),
            serde_json::to_value(&cached).unwrap(),
            "cached document slice diverged from uncached"
        );
    }
}

#[test]
fn filter_is_echoed_normalized_and_applied() {
    let g = fixture();
    let filter: Filter = serde_json::from_str(r#"{"structural_state": ["resolved"]}"#).unwrap();
    let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
    assert_eq!(slice.edges.len(), 1);
    assert_eq!(slice.edges[0]["state"], "resolved");
    assert_eq!(slice.filter.structural_state, vec!["resolved"]);
}

#[test]
fn broken_lens_survives_a_confidence_floor() {
    // Audit ruling W02P05-201: the broken lens must not be hidden by
    // confidence arithmetic — explicitly-requested broken edges pass.
    let g = fixture();
    let filter: Filter = serde_json::from_str(
        r#"{"structural_state": ["broken"], "min_confidence": {"structural": 0.5}}"#,
    )
    .unwrap();
    let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
    assert_eq!(slice.edges.len(), 1);
    assert_eq!(slice.edges[0]["state"], "broken");
}

#[test]
fn document_feature_filter_returns_a_self_consistent_subgraph() {
    // graph-queries-are-bounded-by-default: a `feature_tags` descent narrows
    // the node set, so no returned edge may dangle to a REAL node that was
    // filtered out (the unbounded cross-feature payload the bound prevents).
    // A broken/unresolved target may still dangle (broken lens), but a real
    // in-scope node must never appear on an edge without its node.
    let g = fixture();
    let filter: Filter = serde_json::from_str(r#"{"feature_tags": ["feature-a"]}"#).unwrap();
    let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
    let kept: std::collections::HashSet<&str> = slice
        .nodes
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();
    let real: std::collections::HashSet<String> = g.nodes().map(|n| n.id.0.clone()).collect();
    for e in &slice.edges {
        for key in ["src", "dst"] {
            let id = e[key].as_str().expect("endpoint serialized");
            if real.contains(id) {
                assert!(
                    kept.contains(id),
                    "edge {key} {id} is a real in-scope node but absent from the kept slice"
                );
            }
        }
    }
}

#[test]
fn document_doc_type_filter_returns_a_self_consistent_subgraph() {
    // unified-filter-plane D2/D4: the promoted graph category toggle and the
    // time-travelled snapshot drive the `doc_types` facet through this same
    // `graph_query`. A `doc_types` descent must narrow the node set AND stay
    // self-consistent — a resolved edge to a REAL node that the facet filtered
    // out is dropped, never left dangling (graph-queries-are-bounded-by-default).
    let g = fixture();
    // Keep only `plan` documents: `a-plan` stays, `b-adr` is filtered out.
    let filter: Filter = serde_json::from_str(r#"{"doc_types": ["plan"]}"#).unwrap();
    let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
    let kept: std::collections::HashSet<&str> = slice
        .nodes
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();
    let a_plan = node_id(&CanonicalKey::Document { stem: "a-plan" }).0;
    let b_adr = node_id(&CanonicalKey::Document { stem: "b-adr" }).0;
    assert!(kept.contains(a_plan.as_str()), "the plan node is kept");
    assert!(
        !kept.contains(b_adr.as_str()),
        "the adr node is filtered out by the doc_types facet"
    );
    // The resolved `a-plan -> b-adr` edge dangled to a real-but-filtered node,
    // so it is dropped; no kept edge references a node absent from the slice.
    let real: std::collections::HashSet<String> = g.nodes().map(|n| n.id.0.clone()).collect();
    for e in &slice.edges {
        for key in ["src", "dst"] {
            let id = e[key].as_str().expect("endpoint serialized");
            if real.contains(id) {
                assert!(
                    kept.contains(id),
                    "edge {key} {id} is a real in-scope node but absent from the kept slice"
                );
            }
        }
    }
}

#[test]
fn feature_granularity_returns_meta_edges_not_doc_edges() {
    let g = fixture();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Feature).unwrap();
    assert!(slice.edges.is_empty());
    assert_eq!(slice.meta_edges.len(), 1);
    assert_eq!(slice.meta_edges[0].count, 1, "cross-feature resolved edge");
    // Meta-edges address feature NODE ids, not bare tags (S02).
    assert_eq!(slice.meta_edges[0].src, "feature:feature-a");
    assert_eq!(slice.meta_edges[0].dst, "feature:feature-b");
}

#[test]
fn filtered_feature_granularity_prunes_dangling_meta_edges() {
    // graph-queries-are-bounded-by-default (the feature analogue of the
    // Document branch's endpoint pruning): a `feature_tags` filter narrows the
    // synthesized feature set to feature-a, so the lone cross-feature
    // meta-edge (feature-a -> feature-b) would dangle once feature-b is
    // filtered out. The constellation must stay self-consistent — the dangling
    // meta-edge is pruned, not shipped — because the GUI folds
    // meta_edges -> edges, and a dangling one renders an edge to an absent
    // node. (Unfiltered, both features are kept and the meta-edge survives:
    // feature_granularity_returns_meta_edges_not_doc_edges covers that.)
    let g = fixture();
    let filter: Filter = serde_json::from_str(r#"{"feature_tags": ["feature-a"]}"#).unwrap();
    let slice = graph_query(&g, &scope(), filter, Granularity::Feature).unwrap();
    assert_eq!(slice.nodes.len(), 1, "only feature-a survives the filter");
    assert_eq!(slice.nodes[0]["id"], "feature:feature-a");
    assert!(
        slice.meta_edges.is_empty(),
        "a meta-edge to a filtered-out feature must not dangle: {:?}",
        slice.meta_edges
    );
}

#[test]
fn feature_granularity_synthesizes_convergence_nodes() {
    // ADR D4.1: the convergence entity itself, never empty nodes.
    let g = fixture();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Feature).unwrap();
    assert_eq!(slice.nodes.len(), 2);
    assert!(slice.nodes.iter().all(|n| n["kind"] == "feature"));
    let a = slice
        .nodes
        .iter()
        .find(|n| n["id"] == "feature:feature-a")
        .expect("feature-a synthesized");
    assert_eq!(a["member_count"], 1);
    assert!(a["degree_by_tier"].is_object());
}

#[test]
fn document_list_shape_carries_contract_projections() {
    // Addendum S03: degree_by_tier + lifecycle on the LIST shape.
    let g = fixture();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    let a = slice
        .nodes
        .iter()
        .find(|n| n["id"] == "doc:a-plan")
        .expect("a-plan listed");
    assert!(a["degree_by_tier"]["structural"].as_u64().unwrap() >= 1);
    assert!(a.get("lifecycle").is_some(), "lifecycle key present");
    // Ontology projection (graph-node-semantics ADR): authority_class and
    // aggregate ride additively on the document list shape.
    assert_eq!(
        a["authority_class"], "roadmap",
        "a-plan maps to the roadmap register"
    );
    assert_eq!(a["aggregate"], false, "a plan is individually weighted");
    let b = slice
        .nodes
        .iter()
        .find(|n| n["id"] == "doc:b-adr")
        .expect("b-adr listed");
    assert_eq!(b["authority_class"], "design", "b-adr maps to design");
}

#[test]
fn ontology_is_additive_and_leaves_the_id_unchanged() {
    // Adding authority_class/aggregate must NOT perturb the §4 identity:
    // the node id on the enriched view equals the stored node id.
    let g = fixture();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    let a = slice
        .nodes
        .iter()
        .find(|n| n["id"] == "doc:a-plan")
        .expect("a-plan listed");
    assert_eq!(
        a["id"], "doc:a-plan",
        "the additive ontology fields do not re-key the node"
    );
    // The thin §4 fields are retained verbatim alongside the additions.
    assert_eq!(a["kind"], "document");
    assert!(a.get("authority_class").is_some());
    assert!(a.get("aggregate").is_some());
}

/// A document node carrying a specific parsed lifecycle `state` in scope,
/// so the status projection has a real per-type state to read.
fn doc_with_state(stem: &str, doc_type: &str, state: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.into(),
        title: None,
        doc_type: Some(doc_type.into()),
        dates: None,
        feature_tags: vec!["feature-a".into()],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: Some(engine_model::Lifecycle {
                state: state.into(),
                progress: None,
            }),
        }],
    }
}

#[test]
fn document_node_carries_per_type_status_when_the_type_has_one() {
    // node-visual-richness ADR P01: status_value/status_class ride additively
    // on the document list shape, projected from the parsed lifecycle state.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc_with_state("x-adr", "adr", "accepted"));
    g.upsert_node(doc_with_state("y-plan", "plan", "L2"));
    g.upsert_node(doc_with_state("z-audit", "audit", "high"));
    g.upsert_node(doc_with_state("w-rule", "rule", "superseded"));
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    let node = |id: &str| {
        slice
            .nodes
            .iter()
            .find(|n| n["id"] == id)
            .unwrap_or_else(|| panic!("{id} listed"))
            .clone()
    };
    let adr = node("doc:x-adr");
    assert_eq!(adr["status_value"], "accepted");
    assert_eq!(adr["status_class"], "affirmed");
    let plan = node("doc:y-plan");
    assert_eq!(
        plan["status_value"], "L2",
        "the tier ordinal rides in value"
    );
    assert_eq!(plan["status_class"], "tiered");
    let audit = node("doc:z-audit");
    assert_eq!(audit["status_value"], "high");
    assert_eq!(audit["status_class"], "graded");
    let rule = node("doc:w-rule");
    assert_eq!(rule["status_value"], "superseded");
    assert_eq!(rule["status_class"], "retired");
    // The id is untouched by the additive status fields.
    assert_eq!(adr["id"], "doc:x-adr", "status does not re-key the node");
}

#[test]
fn document_node_omits_both_status_fields_when_the_type_has_none() {
    // An exec record, and an ADR predating the H1 status convention (generic
    // checkbox `active`), both serialize NEITHER status field — honest
    // absence, never a fabricated status.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc_with_state("e-exec", "exec", "active"));
    g.upsert_node(doc_with_state("old-adr", "adr", "active"));
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    for id in ["doc:e-exec", "doc:old-adr"] {
        let n = slice
            .nodes
            .iter()
            .find(|n| n["id"] == id)
            .unwrap_or_else(|| panic!("{id} listed"));
        assert!(
            n.get("status_value").is_none(),
            "{id} carries no status_value"
        );
        assert!(
            n.get("status_class").is_none(),
            "{id} carries no status_class"
        );
        // The thin lifecycle is still present — only the per-type status is
        // absent.
        assert!(n.get("lifecycle").is_some(), "{id} keeps its lifecycle");
    }
}

#[test]
fn feature_convergence_node_carries_in_flight_status() {
    // The synthesized feature node carries the in-flight status the same way
    // a document node carries its per-type status (node-visual-richness P01).
    let g = fixture();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Feature).unwrap();
    let a = slice
        .nodes
        .iter()
        .find(|n| n["id"] == "feature:feature-a")
        .expect("feature-a synthesized");
    assert_eq!(a["status_value"], "in_flight");
    assert_eq!(a["status_class"], "affirmed");
}

#[test]
fn edges_carry_a_derivation_label_distinct_from_relation() {
    // a-plan -> b-adr is plan↔adr: the derivation label is `authorizes`,
    // carried ALONGSIDE the §4 relation, never replacing it.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    g.upsert_node(doc("b-adr", "feature-a"));
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "b-adr", ResolutionState::Resolved, 0.9),
        EdgeAttrs::default(),
    )
    .unwrap();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    let e = &slice.edges[0];
    // The §4 relation is preserved; the derivation rides alongside.
    assert_eq!(e["relation"], "mentions", "the §4 relation is untouched");
    assert_eq!(e["derivation"], "authorizes", "plan↔adr derivation label");
    assert!(e.get("tier").is_some(), "the §4 tier is still present");
}

/// A `PlanContainer` step node exactly as `engine-graph::mint_plan_containers`
/// mints it: `NodeKind::PlanContainer`, `doc_type: None`, key
/// `{plan_stem}/{container_id}`.
fn plan_container(plan_stem: &str, container_id: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::PlanContainer {
            plan_stem,
            container_id,
        }),
        kind: NodeKind::PlanContainer,
        key: format!("{plan_stem}/{container_id}"),
        title: None,
        doc_type: None,
        dates: None,
        feature_tags: vec!["feature-a".into()],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    }
}

/// An exec-record document node (stem encodes the `W##/P##/S##` container
/// path), `doc_type: exec`.
fn exec_doc(stem: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.into(),
        title: None,
        doc_type: Some("exec".into()),
        dates: None,
        feature_tags: vec!["feature-a".into()],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    }
}

#[test]
fn plan_container_to_exec_binding_is_pruned_but_keeps_its_stable_key() {
    // Documents-only slice (commit 60f6779d21, narrowed by the 2026-06-21
    // wire-waste prune): the PlanContainer(step) -> exec-record binding edge
    // has a PlanContainer src, which is NOT a `.vault/` document and is
    // excluded from the document slice — so the binding edge is PRUNED rather
    // than served to dangle against an absent node the client only filters out
    // (the lineage representation that once consumed the `generated-by` spine
    // is retired). Its stable key still never re-keys (graph-lineage-dag ADR
    // D3.3): the derivation label was never an id input.
    let mut g = LinkageGraph::new();
    let step = plan_container("2026-06-16-feature-plan", "W01/P01/S01");
    let exec = exec_doc("2026-06-16-feature-W01-P01-S01");
    let step_id = step.id.clone();
    let exec_id = exec.id.clone();
    g.upsert_node(step);
    g.upsert_node(exec);

    // The binding `References` edge minted exactly as
    // `bind_steps_to_exec_records` mints it: identity-only provenance.
    let provenance = Provenance::CoreGraph {
        payload_hash: String::new(),
        edge_id: format!("{}->{}", step_id.0, "2026-06-16-feature-W01-P01-S01"),
    };
    let binding = Edge {
        id: edge_id(
            &step_id,
            &exec_id,
            &RelationKind::References,
            Tier::Declared,
            &provenance,
        ),
        src: step_id.clone(),
        dst: exec_id.clone(),
        relation: RelationKind::References,
        tier: Tier::Declared,
        confidence: 1.0,
        state: None,
        provenance: provenance.clone(),
        scope: scope(),
        observed_at: 0,
    };
    let binding_id = binding.id.clone();
    engine_graph::ingest(&mut g, binding, EdgeAttrs::default()).unwrap();

    // Documents-only slice: the PlanContainer src excludes the binding edge.
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    assert!(
        !slice.edges.iter().any(|e| e["id"] == binding_id.0),
        "the PlanContainer->exec binding edge is pruned from the documents-only slice"
    );

    // D3.3: the stable key never re-keys. Re-computing the edge id with the
    // SAME endpoints/relation/tier/provenance yields the same id.
    let recomputed = edge_id(
        &step_id,
        &exec_id,
        &RelationKind::References,
        Tier::Declared,
        &provenance,
    );
    assert_eq!(
        recomputed, binding_id,
        "the derivation label never threads into the edge stable key (D3.3)"
    );
}

#[test]
fn contains_hierarchy_edges_are_pruned_from_the_documents_only_slice() {
    // Documents-only slice (commit 60f6779d21, narrowed by the 2026-06-21
    // wire-waste prune): the plan-internal Contains hierarchy
    // (plan -> wave -> phase -> step) has PlanContainer endpoints, none of
    // which are `.vault/` documents. The document slice serves documents only,
    // so the hierarchy edges are pruned rather than served to dangle (the
    // lineage representation that once consumed the spine is retired).
    let mut g = LinkageGraph::new();
    let wave = plan_container("2026-06-16-feature-plan", "W01");
    let phase = plan_container("2026-06-16-feature-plan", "W01/P01");
    let wave_id = wave.id.clone();
    let phase_id = phase.id.clone();
    g.upsert_node(wave);
    g.upsert_node(phase);

    let provenance = Provenance::CoreGraph {
        payload_hash: String::new(),
        edge_id: "W01/P01".into(),
    };
    let contains = Edge {
        id: edge_id(
            &wave_id,
            &phase_id,
            &RelationKind::Contains,
            Tier::Declared,
            &provenance,
        ),
        src: wave_id.clone(),
        dst: phase_id.clone(),
        relation: RelationKind::Contains,
        tier: Tier::Declared,
        confidence: 1.0,
        state: None,
        provenance,
        scope: scope(),
        observed_at: 0,
    };
    let contains_id = contains.id.clone();
    engine_graph::ingest(&mut g, contains, EdgeAttrs::default()).unwrap();

    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    assert!(
        !slice.edges.iter().any(|e| e["id"] == contains_id.0),
        "Contains hierarchy edges (PlanContainer endpoints) are pruned from the documents-only slice"
    );
}

/// An `index` doc-type document node (a generated feature index): a real
/// `doc:` node on disk, but never a displayable knowledge node (ADR D5).
fn index_doc(stem: &str, feature: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.into(),
        title: None,
        doc_type: Some("index".into()),
        dates: None,
        feature_tags: vec![feature.into()],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    }
}

/// A `code` artifact node (`NodeKind::CodeArtifact`): a source file in the
/// index, but never a displayable knowledge node (ADR D6).
fn code_artifact(path: &str, feature: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::CodeArtifact { path, symbol: None }),
        kind: NodeKind::CodeArtifact,
        key: path.into(),
        title: None,
        doc_type: None,
        dates: None,
        feature_tags: vec![feature.into()],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    }
}

#[test]
fn vault_tree_rows_exclude_index_documents() {
    // terminology-standardization ADR D5: an `index` document is a real
    // `doc:` node but must never appear as a `/vault-tree` row.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    g.upsert_node(index_doc("feature-a.index", "feature-a"));
    let rows = build_vault_tree_rows(&g, &scope());
    let stems: Vec<&str> = rows.iter().filter_map(|r| r["stem"].as_str()).collect();
    assert!(
        stems.contains(&"a-plan"),
        "the knowledge document still rows"
    );
    assert!(
        !stems.contains(&"feature-a.index"),
        "the index document is excluded from vault-tree rows: {stems:?}"
    );
    assert!(
        rows.iter().all(|r| r["doc_type"] != "index"),
        "no row carries the index doc_type"
    );
}

#[test]
fn vault_tree_rows_carry_size_and_absent_size_serves_null() {
    // left-rail-tree-controls ADR D2: the ingest-measured weight rides the
    // row; a node without one (older cache, projection) serves an honest
    // null, never a fabricated zero.
    let mut g = LinkageGraph::new();
    let mut sized = doc("a-sized", "feature-a");
    sized.size = Some(engine_model::DocSize::measure("four words of body"));
    g.upsert_node(sized);
    g.upsert_node(doc("b-sizeless", "feature-a"));
    let rows = build_vault_tree_rows(&g, &scope());
    let sized_row = rows.iter().find(|r| r["stem"] == "a-sized").unwrap();
    assert_eq!(sized_row["size"]["bytes"], 18);
    assert_eq!(sized_row["size"]["words"], 4);
    let sizeless_row = rows.iter().find(|r| r["stem"] == "b-sizeless").unwrap();
    assert!(
        sizeless_row["size"].is_null(),
        "absent weight serves null: {sizeless_row}"
    );
}

/// A titled `code` artifact node — mirrors `code_artifact` but carries a
/// display title, so the projection's title pass-through is exercised.
fn titled_code_artifact(path: &str, title: &str) -> Node {
    let mut n = code_artifact(path, "feature-a");
    n.title = Some(title.into());
    n
}

#[test]
fn code_file_rows_project_only_code_nodes_sorted_by_path() {
    // The projection is the complete code-file listing: every `code:` FILE
    // node, and NOTHING else (no `doc:` or `index` node bleeds in). Rows
    // are path-sorted for cursor determinism.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    g.upsert_node(index_doc("feature-a.index", "feature-a"));
    g.upsert_node(code_artifact("src/zeta.rs", "feature-a"));
    g.upsert_node(code_artifact("src/alpha.ts", "feature-a"));
    let rows = build_code_file_rows(&g);
    let paths: Vec<&str> = rows.iter().filter_map(|r| r["path"].as_str()).collect();
    assert_eq!(
        paths,
        vec!["src/alpha.ts", "src/zeta.rs"],
        "only code files, sorted by path"
    );
    // The node id rides each row so a hit is directly navigable.
    assert_eq!(rows[0]["node_id"], "code:src/alpha.ts");
    assert_eq!(rows[1]["node_id"], "code:src/zeta.rs");
}

#[test]
fn code_file_rows_derive_language_and_pass_title_honestly() {
    // `lang` derives from the path extension via the one language_token
    // source of truth; an unclassified extension serves a null lang. The
    // title passes through, honestly null when the node carries none.
    let mut g = LinkageGraph::new();
    g.upsert_node(titled_code_artifact("app/main.py", "main"));
    g.upsert_node(code_artifact("docs/readme.md", "feature-a"));
    let rows = build_code_file_rows(&g);
    let py = rows.iter().find(|r| r["path"] == "app/main.py").unwrap();
    assert_eq!(py["lang"], "python");
    assert_eq!(py["title"], "main");
    let md = rows.iter().find(|r| r["path"] == "docs/readme.md").unwrap();
    assert_eq!(
        md["lang"],
        Value::Null,
        "unclassified extension → null lang"
    );
    assert_eq!(
        md["title"],
        Value::Null,
        "no title → null, never fabricated"
    );
}

#[test]
fn code_file_rows_empty_on_a_graph_with_no_code() {
    // A vault-only graph (no code corpus) projects zero rows — the honest
    // empty listing, never a 5xx or a fabricated entry.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    assert!(build_code_file_rows(&g).is_empty());
}

#[test]
fn graph_query_excludes_index_and_code_nodes() {
    // terminology-standardization ADR D5/D6: an `index` document and a
    // `code` artifact are real graph nodes but are never emitted as
    // knowledge-graph nodes by the document slice.
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    g.upsert_node(index_doc("feature-a.index", "feature-a"));
    g.upsert_node(code_artifact("src/main.rs", "feature-a"));
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    let ids: Vec<&str> = slice
        .nodes
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();
    assert!(
        ids.contains(&"doc:a-plan"),
        "the knowledge document is kept"
    );
    assert!(
        !ids.iter().any(|id| id.starts_with("code:")),
        "no code-artifact node is emitted: {ids:?}"
    );
    assert!(
        !ids.contains(&"doc:feature-a.index"),
        "the index document is not emitted: {ids:?}"
    );
    assert!(
        slice.nodes.iter().all(|n| n["doc_type"] != "index"),
        "no emitted node carries the index doc_type"
    );
}

#[test]
fn graph_query_drops_edges_to_an_excluded_node() {
    // terminology-standardization ADR D5/D6 + graph-queries-are-bounded:
    // when an `index`/`code` node is excluded from the kept node set, any
    // edge whose endpoint is that excluded (but in-scope) node must also be
    // dropped, so the returned subgraph stays self-consistent (only edges
    // among kept nodes).
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    g.upsert_node(index_doc("feature-a.index", "feature-a"));
    // a-plan -> feature-a.index: a resolved edge to a REAL in-scope node
    // that is excluded as non-displayable. It must not survive as a dangling
    // edge to an absent node.
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "feature-a.index", ResolutionState::Resolved, 0.9),
        EdgeAttrs::default(),
    )
    .unwrap();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    let kept: std::collections::HashSet<&str> = slice
        .nodes
        .iter()
        .filter_map(|n| n["id"].as_str())
        .collect();
    let index_id = node_id(&CanonicalKey::Document {
        stem: "feature-a.index",
    })
    .0;
    assert!(
        !kept.contains(index_id.as_str()),
        "the index node is excluded"
    );
    for e in &slice.edges {
        for key in ["src", "dst"] {
            let id = e[key].as_str().expect("endpoint serialized");
            assert_ne!(
                id,
                index_id.as_str(),
                "no served edge references the excluded index node"
            );
        }
    }
}

#[test]
fn document_slice_drops_unresolved_danglers_by_default_keeps_the_broken_lens() {
    // User directive (2026-06-21): the backend must never serve an edge the
    // client only filters out. A RESOLVED edge whose target never resolved to
    // a real graph node (the shape that leaked ~1.5k `mentions`-to-plan-step
    // edges onto the wire) is pure waste — dropped by default. A BROKEN edge to
    // an unresolved target is the broken-lens subject, surfaced ONLY when the
    // lens is explicitly requested (`structural_state: ["broken"]`).
    let mut g = LinkageGraph::new();
    g.upsert_node(doc("a-plan", "feature-a"));
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "unresolved-step", ResolutionState::Resolved, 0.9),
        EdgeAttrs::default(),
    )
    .unwrap();
    engine_graph::ingest(
        &mut g,
        structural("a-plan", "gone-doc", ResolutionState::Broken, 0.0),
        EdgeAttrs::default(),
    )
    .unwrap();

    // Default query: both dangling edges are dropped (no wire waste).
    let default_slice =
        graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    assert!(
        default_slice.edges.is_empty(),
        "dangling edges are dropped by default: {:?}",
        default_slice.edges
    );

    // Broken lens: the dangling BROKEN edge is surfaced on explicit request;
    // the resolved dangler is excluded by the state filter and never returns.
    let lens: Filter = serde_json::from_str(r#"{"structural_state": ["broken"]}"#).unwrap();
    let lens_slice = graph_query(&g, &scope(), lens, Granularity::Document).unwrap();
    assert_eq!(
        lens_slice.edges.len(),
        1,
        "only the broken dangler surfaces"
    );
    assert_eq!(lens_slice.edges[0]["state"], "broken");
}

#[test]
fn text_and_feature_facets_narrow_nodes() {
    let g = fixture();
    let filter: Filter =
        serde_json::from_str(r#"{"feature_tags": ["feature-b"], "text": "ADR"}"#).unwrap();
    let slice = graph_query(&g, &scope(), filter, Granularity::Document).unwrap();
    assert_eq!(slice.nodes.len(), 1);
    assert_eq!(slice.nodes[0]["key"], "b-adr");
}

#[test]
fn feature_delta_projects_constellation_changes_tagged_on_the_clock() {
    // S50: the feature/meta-edge delta between two graph states.
    // old: just feature-a, no cross-feature edge (no meta-edge yet).
    let mut old = LinkageGraph::new();
    old.upsert_node(doc("a-plan", "feature-a"));
    // new: the fixture adds feature-b and a cross-feature edge, so a
    // meta-edge appears (feature-a -> feature-b) and feature-a's degree
    // changes.
    let new = fixture();

    let (entries, last_seq, truncated) = feature_delta(&old, &new, &scope(), 100, 5);

    assert!(
        truncated.is_none(),
        "an in-bounds feature diff is not truncated"
    );
    assert!(!entries.is_empty(), "constellation changed: deltas emitted");
    // Every entry rides the FEATURE species and the shared clock from 5.
    assert!(entries.iter().all(|e| e["granularity"] == "feature"));
    assert!(entries.iter().all(|e| e["seq"].as_u64().unwrap() >= 5));
    assert_eq!(
        last_seq,
        5 + entries.len() as u64 - 1,
        "contiguous seqs from seq_start"
    );
    assert!(entries.iter().all(|e| e["t"] == 100));
    // The cross-feature meta-edge is an `add` (absent in old); meta-edge
    // identity is the endpoint pair, stable across re-derivation.
    assert!(
        entries.iter().any(|e| {
            e["op"] == "add"
                && e["edge"]["src"] == "feature:feature-a"
                && e["edge"]["dst"] == "feature:feature-b"
        }),
        "the new cross-feature meta-edge appears as a tagged add: {entries:?}"
    );
}

#[test]
fn over_ceiling_feature_delta_degrades_to_keyframe_only() {
    // GIR-014: a feature diff whose feature-node/meta-edge delta count exceeds
    // MAX_DIFF_DELTAS degrades to keyframe-only (empty entries + honest
    // truncation), the SAME contract as the document diff. One distinct
    // feature tag per doc → one feature-convergence node → one add delta.
    let old = LinkageGraph::new();
    let mut new = LinkageGraph::new();
    let over = MAX_DIFF_DELTAS + 1;
    for i in 0..over {
        new.upsert_node(doc(&format!("d{i:06}-plan"), &format!("feat-{i:06}")));
    }
    let (entries, _last_seq, truncated) = feature_delta(&old, &new, &scope(), 7, 0);
    assert!(
        entries.is_empty(),
        "an over-ceiling feature diff emits no deltas (keyframe-only)"
    );
    let truncated = truncated.expect("over-ceiling feature diff carries truncation");
    assert_eq!(
        truncated.total_deltas, over,
        "the TRUE delta count is reported"
    );
    assert_eq!(truncated.returned_deltas, 0);
}

#[test]
fn at_ceiling_feature_delta_ships_every_delta() {
    // Exactly at the ceiling is in-bounds: all feature deltas ship, no truncation.
    let old = LinkageGraph::new();
    let mut new = LinkageGraph::new();
    for i in 0..MAX_DIFF_DELTAS {
        new.upsert_node(doc(&format!("d{i:06}-plan"), &format!("feat-{i:06}")));
    }
    let (entries, _last_seq, truncated) = feature_delta(&old, &new, &scope(), 7, 0);
    assert_eq!(entries.len(), MAX_DIFF_DELTAS);
    assert!(truncated.is_none());
}
