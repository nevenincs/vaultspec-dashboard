//! DERIVATION LABELING COMPLETENESS (graph-node-representation ADR D3 /
//! graph-lineage-dag ADR D3/D4/D7, plan W02.P06.S32): the authored
//! plan -> wave -> phase -> step -> exec hierarchy is one connected
//! `generated-by` spine, and BOTH front-door surfaces that read the shared
//! `ontology::derivation_label` projection see the same label, while combos
//! with no real derivation semantics stay honest `null`.
//!
//! This crate-level integration test exercises the PUBLIC query surfaces end to
//! end over a graph built with the production `engine_graph::ingest` path:
//!   - `/graph/query` (`graph::graph_query`) — the topological derivation slice
//!     the Sugiyama layout lays out; and
//!   - `/graph/lineage` (`lineage::lineage`) — the diachronic timeline arc that
//!     S29 wired to the SAME projection (D4 timeline parity), closing the
//!     hardcoded-`None` drop.
//!
//! Both surfaces share ONE projection (D7): they must agree on the label. The
//! container-path detection reads `node.kind` (the `PlanContainer` species,
//! `doc_type: None`), the shape the old doc-type-pair gate dropped (D3.1). The
//! label is ADDITIVE and NEVER part of the edge stable key (D3.3): re-deriving
//! the same logical edge yields the same `edge_id` regardless of the label.

use engine_graph::{EdgeAttrs, LinkageGraph, ingest};
use engine_model::{
    CanonicalKey, Dates, Edge, Facet, Node, NodeKind, Presence, Provenance, RelationKind, ScopeRef,
    Tier, edge_id, node_id,
};
use engine_query::filter::Filter;
use engine_query::graph::{Granularity, graph_query};
use engine_query::lineage::lineage;

fn scope() -> ScopeRef {
    ScopeRef::Ref {
        name: "main".into(),
    }
}

/// A dated document node (so it owns a lineage lane), `doc_type` inferred from
/// the caller.
fn doc(stem: &str, doc_type: Option<&str>, created: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.into(),
        title: None,
        doc_type: doc_type.map(str::to_string),
        dates: Some(Dates {
            created: Some(created.into()),
            modified: None,
            stamped: None,
        }),
        feature_tags: vec!["feature-a".into()],
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

/// A `PlanContainer` node exactly as `engine_graph::mint_plan_containers` mints
/// it: `NodeKind::PlanContainer`, `doc_type: None`, key `{plan_stem}/{cid}`.
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
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    }
}

/// The authored binding `References` edge `bind_steps_to_exec_records` mints
/// (`engine_graph::index`): identity-only `CoreGraph` provenance, declared tier.
fn binding_edge(step: &engine_model::NodeId, exec: &engine_model::NodeId, exec_stem: &str) -> Edge {
    let provenance = Provenance::CoreGraph {
        payload_hash: String::new(),
        edge_id: format!("{}->{}", step.0, exec_stem),
    };
    Edge {
        id: edge_id(
            step,
            exec,
            &RelationKind::References,
            Tier::Declared,
            &provenance,
        ),
        src: step.clone(),
        dst: exec.clone(),
        relation: RelationKind::References,
        tier: Tier::Declared,
        confidence: 1.0,
        state: None,
        provenance,
        scope: scope(),
        observed_at: 0,
    }
}

/// The plan-internal `Contains` hierarchy edge `mint_plan_containers` mints
/// (`engine_graph::index`): identity-only `CoreGraph` provenance keyed by the
/// child container id, declared tier.
fn contains_edge(
    parent: &engine_model::NodeId,
    child: &engine_model::NodeId,
    child_cid: &str,
) -> Edge {
    let provenance = Provenance::CoreGraph {
        payload_hash: String::new(),
        edge_id: child_cid.to_string(),
    };
    Edge {
        id: edge_id(
            parent,
            child,
            &RelationKind::Contains,
            Tier::Declared,
            &provenance,
        ),
        src: parent.clone(),
        dst: child.clone(),
        relation: RelationKind::Contains,
        tier: Tier::Declared,
        confidence: 1.0,
        state: None,
        provenance,
        scope: scope(),
        observed_at: 0,
    }
}

/// A structural `Mentions` edge on the doc -> doc wikilink path (the `related:`
/// frontmatter link every document carries).
fn wikilink_edge(src: &engine_model::NodeId, dst: &engine_model::NodeId, target: &str) -> Edge {
    let provenance = Provenance::DocumentBody {
        blob_hash: "b".into(),
        span: (0, 1),
        target: target.into(),
    };
    Edge {
        id: edge_id(
            src,
            dst,
            &RelationKind::Mentions,
            Tier::Structural,
            &provenance,
        ),
        src: src.clone(),
        dst: dst.clone(),
        relation: RelationKind::Mentions,
        tier: Tier::Structural,
        confidence: 0.9,
        state: Some(engine_model::ResolutionState::Resolved),
        provenance,
        scope: scope(),
        observed_at: 0,
    }
}

/// Build the authored plan spine over the production ingest path: a plan
/// document, its `PlanContainer` wave/phase/step interior joined by `Contains`,
/// the step bound to its exec record, and the exec's `related:` wikilink back to
/// the plan. Returns the graph plus the ids the assertions look up.
fn spine_graph() -> (LinkageGraph, Spine) {
    let mut g = LinkageGraph::new();
    let plan_stem = "2026-06-16-feature-plan";
    let exec_stem = "2026-06-16-feature-W01-P01-S01";

    let plan = doc(plan_stem, Some("plan"), "2026-06-10");
    let wave = plan_container(plan_stem, "W01");
    let phase = plan_container(plan_stem, "W01/P01");
    let step = plan_container(plan_stem, "W01/P01/S01");
    let exec = doc(exec_stem, Some("exec"), "2026-06-12");

    let plan_id = plan.id.clone();
    let wave_id = wave.id.clone();
    let phase_id = phase.id.clone();
    let step_id = step.id.clone();
    let exec_id = exec.id.clone();

    g.upsert_node(plan);
    g.upsert_node(wave);
    g.upsert_node(phase);
    g.upsert_node(step);
    g.upsert_node(exec);

    let contains_plan_wave = contains_edge(&plan_id, &wave_id, "W01");
    let contains_wave_phase = contains_edge(&wave_id, &phase_id, "W01/P01");
    let contains_phase_step = contains_edge(&phase_id, &step_id, "W01/P01/S01");
    let binding = binding_edge(&step_id, &exec_id, exec_stem);
    let wikilink = wikilink_edge(&exec_id, &plan_id, plan_stem);

    let ids = Spine {
        contains_plan_wave: contains_plan_wave.id.0.clone(),
        contains_wave_phase: contains_wave_phase.id.0.clone(),
        contains_phase_step: contains_phase_step.id.0.clone(),
        binding: binding.id.0.clone(),
        binding_src: step_id,
        binding_dst: exec_id,
        wikilink: wikilink.id.0.clone(),
    };

    for edge in [
        contains_plan_wave,
        contains_wave_phase,
        contains_phase_step,
        binding,
        wikilink,
    ] {
        ingest(&mut g, edge, EdgeAttrs::default()).unwrap();
    }
    (g, ids)
}

struct Spine {
    contains_plan_wave: String,
    contains_wave_phase: String,
    contains_phase_step: String,
    binding: String,
    binding_src: engine_model::NodeId,
    binding_dst: engine_model::NodeId,
    wikilink: String,
}

/// Look up an edge's served `derivation` value in the document graph slice.
fn derivation_in_slice<'a>(
    slice: &'a engine_query::graph::GraphSlice,
    edge_id: &str,
) -> &'a serde_json::Value {
    let edge = slice
        .edges
        .iter()
        .find(|e| e["id"] == edge_id)
        .unwrap_or_else(|| panic!("edge {edge_id} is served at document granularity"));
    &edge["derivation"]
}

#[test]
fn the_plan_exec_wikilink_is_generated_by_and_the_container_scaffold_is_pruned() {
    // graph-node-representation ADR D3 + documents-only slice (commit 60f6779d21,
    // narrowed by the 2026-06-21 wire-waste prune): the `generated-by` derivation
    // LABEL is live, but the PlanContainer scaffold edges — the `Contains`
    // hierarchy and the step -> exec binding, all with a PlanContainer endpoint —
    // are NOT `.vault/` documents, so they are PRUNED from the documents-only slice
    // (they would only dangle to an absent node the client filters out; the lineage
    // representation that once consumed the spine is retired). The container-spine
    // label parity is still covered on the LIVE consumer — the `/graph/lineage`
    // timeline surface — by `the_lineage_arc_surface_…` below.
    let (g, ids) = spine_graph();
    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();

    for (label, edge_id) in [
        ("plan->wave Contains", &ids.contains_plan_wave),
        ("wave->phase Contains", &ids.contains_wave_phase),
        ("phase->step Contains", &ids.contains_phase_step),
        ("step->exec binding", &ids.binding),
    ] {
        assert!(
            !slice.edges.iter().any(|e| e["id"] == *edge_id),
            "{label} (PlanContainer endpoint) is pruned from the documents-only slice"
        );
    }
    // The doc->doc wikilink path (exec -> plan via `related:`) survives — both
    // endpoints are documents — and carries the generated-by label.
    assert_eq!(
        derivation_in_slice(&slice, &ids.wikilink),
        "generated-by",
        "the exec->plan wikilink is the plan↔exec generated-by edge"
    );
}

#[test]
fn the_lineage_arc_surface_carries_the_same_generated_by_label_as_graph_query() {
    // graph-lineage-dag ADR D4/D7 (plan S29): `/graph/lineage`'s `lineage_arc`
    // reads the SAME `ontology::derivation_label` projection `/graph/query` uses,
    // closing the hardcoded-`None` drop. The exec -> plan wikilink arc (both
    // endpoints are dated, lane-owning documents, so they survive into the
    // lineage slice) must carry the SAME `generated-by` label the graph-query
    // surface serves — timeline parity, one projection two surfaces.
    let (g, _) = spine_graph();
    let slice = lineage(&g, &scope(), None, None, Filter::default(), true).unwrap();

    // Only the two DOCUMENT endpoints (plan, exec) take a lineage lane — the
    // PlanContainer scaffold is not a dated document — so exactly the exec->plan
    // arc survives, and it carries the shared label (no longer hardcoded None).
    assert_eq!(
        slice.arcs.len(),
        1,
        "exactly the exec<->plan document arc survives"
    );
    let arc = &slice.arcs[0];
    assert_eq!(
        arc.derivation.as_deref(),
        Some("generated-by"),
        "the lineage arc carries the shared label (D4 timeline parity, S29 closed the None drop)"
    );
}

#[test]
fn unrelated_relation_and_doc_type_combos_stay_honest_null() {
    // graph-node-representation ADR D3: combos with no real derivation semantics
    // remain honest `null` — the widening labels only what is genuinely a
    // derivation relation, never invents structure to fill holes.
    let mut g = LinkageGraph::new();
    // Two same-feature plan documents: a bare structural mention the derivation
    // vocabulary does not name (plan↔plan is not a pipeline-derivation pair).
    g.upsert_node(doc("a-plan", Some("plan"), "2026-06-10"));
    g.upsert_node(doc("b-plan", Some("plan"), "2026-06-11"));
    let a = node_id(&CanonicalKey::Document { stem: "a-plan" });
    let b = node_id(&CanonicalKey::Document { stem: "b-plan" });
    let plan_plan = wikilink_edge(&a, &b, "b-plan");
    // A doc with no doc_type at all (an unknown species) mentioning a plan: the
    // vocabulary names no relationship, so honest null.
    g.upsert_node(doc("c-unknown", None, "2026-06-11"));
    let c = node_id(&CanonicalKey::Document { stem: "c-unknown" });
    let unknown_plan = wikilink_edge(&c, &a, "a-plan");

    let plan_plan_id = plan_plan.id.0.clone();
    let unknown_plan_id = unknown_plan.id.0.clone();
    ingest(&mut g, plan_plan, EdgeAttrs::default()).unwrap();
    ingest(&mut g, unknown_plan, EdgeAttrs::default()).unwrap();

    let slice = graph_query(&g, &scope(), Filter::default(), Granularity::Document).unwrap();
    assert_eq!(
        derivation_in_slice(&slice, &plan_plan_id),
        &serde_json::Value::Null,
        "a bare plan↔plan structural mention has no derivation label"
    );
    assert_eq!(
        derivation_in_slice(&slice, &unknown_plan_id),
        &serde_json::Value::Null,
        "an unknown-species -> plan mention has no derivation label"
    );
}

#[test]
fn the_generated_by_label_never_enters_the_edge_stable_key() {
    // graph-node-representation ADR D3 / graph-lineage-dag ADR D3.3
    // (provenance-stable-keys-are-identity-bearing): the WIDENED container-path
    // detection changes the served label only, NEVER an id. Re-deriving the
    // step->exec binding's stable key with the same endpoints/relation/tier/
    // provenance reproduces the same id — the label is not an id input, so
    // re-indexing never re-keys. (Independent of whether the binding is served:
    // it is pruned from the documents-only slice as a PlanContainer-endpoint edge.)
    let (_g, ids) = spine_graph();

    // Recompute the stable key from the SAME identity inputs the binding minted
    // from — the derivation label was never one of them.
    let provenance = Provenance::CoreGraph {
        payload_hash: String::new(),
        edge_id: format!(
            "{}->{}",
            ids.binding_src.0, "2026-06-16-feature-W01-P01-S01"
        ),
    };
    let recomputed = edge_id(
        &ids.binding_src,
        &ids.binding_dst,
        &RelationKind::References,
        Tier::Declared,
        &provenance,
    );
    assert_eq!(
        recomputed.0, ids.binding,
        "the generated-by label never threads into the edge stable key (D3.3)"
    );
}
