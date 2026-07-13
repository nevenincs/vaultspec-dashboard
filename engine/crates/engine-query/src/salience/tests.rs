use super::*;
use engine_graph::EdgeAttrs;
use engine_model::{
    CanonicalKey, Dates, Facet, NodeKind, Presence, Provenance, RelationKind, ResolutionState,
    edge_id, node_id,
};

fn scope() -> ScopeRef {
    ScopeRef::Ref {
        name: "main".into(),
    }
}

pub(super) fn doc(stem: &str, doc_type: &str, feature: &str) -> Node {
    Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.into(),
        title: None,
        doc_type: Some(doc_type.into()),
        dates: Some(Dates {
            created: Some("2026-06-14".into()),
            modified: Some(1_000_000),
            stamped: None,
        }),
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

pub(super) fn edge(src: &str, dst: &str, tier: Tier) -> engine_model::Edge {
    let s = node_id(&CanonicalKey::Document { stem: src });
    let d = node_id(&CanonicalKey::Document { stem: dst });
    let provenance = Provenance::DocumentBody {
        blob_hash: "b".into(),
        span: (0, 1),
        target: dst.into(),
    };
    // Tier-calibrated confidence bands (engine-model D3.2): declared is
    // exactly 1.0, the others sit in their bands.
    let confidence = match tier {
        Tier::Declared => 1.0,
        Tier::Structural => 0.9,
        Tier::Temporal => 0.7,
    };
    engine_model::Edge {
        id: edge_id(&s, &d, &RelationKind::Mentions, tier, &provenance),
        src: s,
        dst: d,
        relation: RelationKind::Mentions,
        tier,
        confidence,
        state: (tier == Tier::Structural).then_some(ResolutionState::Resolved),
        provenance,
        scope: scope(),
        observed_at: 0,
    }
}

/// A small known graph: adr <- plan -> research, plan -> exec leaf, plus a
/// temporal edge that must NOT enter the backbone (semantic edges are never
/// graph fact — D3.5 — so temporal is the off-backbone tier we can ingest).
pub(super) fn fixture() -> (LinkageGraph, Vec<Node>) {
    let nodes = vec![
        doc("p", "plan", "f"),
        doc("a", "adr", "f"),
        doc("r", "research", "f"),
        doc("e", "exec", "f"),
        doc("s", "reference", "f"),
    ];
    let mut g = LinkageGraph::new();
    for n in &nodes {
        g.upsert_node(n.clone());
    }
    engine_graph::ingest(&mut g, edge("p", "a", Tier::Declared), EdgeAttrs::default()).unwrap();
    engine_graph::ingest(
        &mut g,
        edge("p", "r", Tier::Structural),
        EdgeAttrs::default(),
    )
    .unwrap();
    engine_graph::ingest(
        &mut g,
        edge("p", "e", Tier::Structural),
        EdgeAttrs::default(),
    )
    .unwrap();
    // A temporal edge a<->s: must be excluded from the backbone topology
    // (only declared/structural enter the backbone).
    engine_graph::ingest(&mut g, edge("a", "s", Tier::Temporal), EdgeAttrs::default()).unwrap();
    (g, nodes)
}

fn members(nodes: &[Node]) -> Vec<&Node> {
    nodes.iter().collect()
}

#[test]
fn backbone_applies_tier_weight_and_damps_semantic() {
    let (g, nodes) = fixture();
    let backbone = Backbone::build(&g, &members(&nodes));
    // 5 members; the semantic a<->s edge is excluded, so `s` is isolated.
    assert_eq!(backbone.node_count(), 5);
    let s = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "s" }))
        .unwrap();
    assert_eq!(
        backbone.adjacency[s].len(),
        0,
        "off-backbone (temporal) edge is not part of the backbone topology"
    );
    // The declared p<->a edge weights higher than a structural p<->r edge.
    let p = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
        .unwrap();
    let a = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
        .unwrap();
    let pa = backbone.adjacency[p]
        .iter()
        .find(|&&(j, _)| j == a)
        .unwrap()
        .1;
    assert!((pa - tier_weight(Tier::Declared)).abs() < 1e-9);
}

#[test]
fn backbone_membership_is_preserved_under_bounding() {
    let (g, nodes) = fixture();
    // Bound to a 3-node subset; edges to dropped nodes must not appear.
    let subset: Vec<&Node> = nodes
        .iter()
        .filter(|n| matches!(n.key.as_str(), "p" | "a" | "r"))
        .collect();
    let backbone = Backbone::build(&g, &subset);
    assert_eq!(backbone.node_count(), 3);
    // `e` was dropped, so p has only the a and r backbone edges.
    let p = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
        .unwrap();
    assert_eq!(backbone.adjacency[p].len(), 2);
}

#[test]
fn pagerank_converges_and_sums_to_one() {
    let (g, nodes) = fixture();
    let backbone = Backbone::build(&g, &members(&nodes));
    let n = backbone.node_count();
    let teleport = vec![1.0; n];
    let rank = personalized_pagerank(&backbone, &teleport);
    let total: f64 = rank.iter().sum();
    assert!(
        (total - 1.0).abs() < 1e-6,
        "stationary distribution sums to 1"
    );
    // The central plan node `p` outranks the isolated semantic-only node `s`.
    let p = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
        .unwrap();
    let s = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "s" }))
        .unwrap();
    assert!(rank[p] > rank[s], "the hub plan outranks the isolated node");
}

#[test]
fn personalized_teleport_biases_toward_the_preference_set() {
    let (g, nodes) = fixture();
    let backbone = Backbone::build(&g, &members(&nodes));
    let n = backbone.node_count();
    let a = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
        .unwrap();
    // Teleport biased entirely onto the ADR `a`.
    let mut teleport = vec![0.0; n];
    teleport[a] = 1.0;
    let biased = personalized_pagerank(&backbone, &teleport);
    let uniform = personalized_pagerank(&backbone, &vec![1.0; n]);
    assert!(
        biased[a] > uniform[a],
        "biasing the teleport onto `a` raises its stationary mass"
    );
}

#[test]
fn partial_vector_basis_is_linear_in_the_teleport() {
    // Jeh-Widom linearity: combining hub vectors equals the PPR of the
    // combined teleport. This is what makes per-lens vectors cheap.
    let (g, nodes) = fixture();
    let backbone = Backbone::build(&g, &members(&nodes));
    let n = backbone.node_count();
    let a = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
        .unwrap();
    let r = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "r" }))
        .unwrap();
    let mut ta = vec![0.0; n];
    ta[a] = 1.0;
    let mut tr = vec![0.0; n];
    tr[r] = 1.0;
    let basis = PartialVectorBasis::compute(&backbone, &[ta.clone(), tr.clone()]);
    let combined = basis.combine(&[1.0, 1.0]);
    // The PPR of the (a+r)/2 teleport computed directly.
    let mut blended = vec![0.0; n];
    blended[a] = 0.5;
    blended[r] = 0.5;
    let direct = personalized_pagerank(&backbone, &blended);
    for i in 0..n {
        assert!(
            (combined[i] - direct[i]).abs() < 1e-6,
            "partial-vector linearity holds at index {i}"
        );
    }
}

#[test]
fn brandes_betweenness_finds_the_bridge() {
    // path a - p - r: p is the only bridge, so it carries all the
    // betweenness; a and r carry none.
    let nodes = vec![
        doc("a", "adr", "f"),
        doc("p", "plan", "f"),
        doc("r", "research", "f"),
    ];
    let mut g = LinkageGraph::new();
    for node in &nodes {
        g.upsert_node(node.clone());
    }
    engine_graph::ingest(
        &mut g,
        edge("a", "p", Tier::Structural),
        EdgeAttrs::default(),
    )
    .unwrap();
    engine_graph::ingest(
        &mut g,
        edge("p", "r", Tier::Structural),
        EdgeAttrs::default(),
    )
    .unwrap();
    let backbone = Backbone::build(&g, &members(&nodes));
    let bc = brandes_betweenness(&backbone);
    let p = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
        .unwrap();
    let a = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "a" }))
        .unwrap();
    let r = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "r" }))
        .unwrap();
    assert!(
        (bc[p] - 1.0).abs() < 1e-9,
        "the middle node is the only bridge"
    );
    assert!(bc[a] < 1e-9 && bc[r] < 1e-9, "the endpoints bridge nothing");
}

#[test]
fn coreness_peels_pendant_exec_leaves_first() {
    let (g, nodes) = fixture();
    let backbone = Backbone::build(&g, &members(&nodes));
    let core = coreness(&backbone);
    let e = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "e" }))
        .unwrap();
    // The exec leaf `e` is a pendant (degree 1): coreness 1, peeled first.
    assert_eq!(core[e], 1, "pendant exec leaf has minimal coreness");
}

#[test]
fn coreness_preserves_dense_core_with_many_pendant_leaves() {
    let mut g = LinkageGraph::new();
    let mut nodes = Vec::new();
    for i in 0..20 {
        nodes.push(doc(&format!("core-{i}"), "plan", "f"));
    }
    for i in 0..80 {
        nodes.push(doc(&format!("leaf-{i}"), "exec", "f"));
    }
    for node in &nodes {
        g.upsert_node(node.clone());
    }

    for a in 0..20 {
        for b in (a + 1)..20 {
            engine_graph::ingest(
                &mut g,
                edge(&format!("core-{a}"), &format!("core-{b}"), Tier::Structural),
                EdgeAttrs::default(),
            )
            .unwrap();
        }
    }
    for i in 0..80 {
        engine_graph::ingest(
            &mut g,
            edge("core-0", &format!("leaf-{i}"), Tier::Structural),
            EdgeAttrs::default(),
        )
        .unwrap();
    }

    let backbone = Backbone::build(&g, &members(&nodes));
    let core = coreness(&backbone);
    let dense = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "core-7" }))
        .unwrap();
    let connector = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "core-0" }))
        .unwrap();
    let leaf = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "leaf-42" }))
        .unwrap();

    assert_eq!(core[dense], 19, "a 20-node clique has coreness 19");
    assert_eq!(
        core[connector], 19,
        "pendant fan-out does not inflate the dense core"
    );
    assert_eq!(core[leaf], 1, "pendant leaves stay in the outer shell");
}

#[test]
fn lens_basis_computes_every_measure_in_one_sweep() {
    let (g, nodes) = fixture();
    let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
    assert_eq!(basis.node_count(), 5);
    assert_eq!(basis.betweenness.len(), 5);
    assert_eq!(basis.coreness.len(), 5);
    assert_eq!(basis.roles.len(), 5);
    assert_eq!(basis.aggregated_exec.len(), 5);
    assert_eq!(basis.ppr_basis.hub_count(), HUB_CLASSES.len());
    // The plan `p` aggregates its exec child `e`.
    let p = basis
        .backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "p" }))
        .unwrap();
    assert_eq!(
        basis.aggregated_exec[p].child_count, 1,
        "exec child rolled up"
    );
    let e = basis
        .backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "e" }))
        .unwrap();
    assert!(
        basis.aggregated_exec[e].is_aggregate,
        "exec record is aggregate species"
    );
}

// --- W02.P03: recency, lifecycle, burst ------------------------------------

#[test]
fn recency_halves_at_the_half_life() {
    let now = 100 * MS_PER_DAY as i64;
    // A node modified exactly one half-life (30 days) ago.
    let modified = now - (30.0 * MS_PER_DAY) as i64;
    let r = recency(Some(modified), now, 30.0);
    assert!((r - 0.5).abs() < 1e-6, "freshness halves at the half-life");
    // A brand-new node is ~1.0; an ancient node tends to 0.
    assert!(recency(Some(now), now, 30.0) > 0.99);
    assert!(recency(Some(0), now, 30.0) < 0.1);
    // No date -> neutral midpoint, never inflating or zeroing.
    assert_eq!(recency(None, now, 30.0), 0.5);
}

#[test]
fn lifecycle_multiplier_handles_recent_archived_and_old_in_flight() {
    // Status lens: in-flight strongly boosts; archived heavily damps.
    assert!(lifecycle_multiplier(Lens::Status, LifecyclePhase::InFlight) > 1.0);
    assert!(lifecycle_multiplier(Lens::Status, LifecyclePhase::Archived) < 0.5);
    // Design lens: an archived ADR is damped but NEVER zeroed.
    let design_archived = lifecycle_multiplier(Lens::Design, LifecyclePhase::Archived);
    assert!(design_archived > 0.0 && design_archived < 1.0);
}

#[test]
fn activity_burst_weights_recent_temporal_edges() {
    // A node with a recent temporal edge bursts; one with none does not.
    let mut g = LinkageGraph::new();
    let a = doc("a", "plan", "f");
    let c = doc("c", "exec", "f");
    g.upsert_node(a.clone());
    g.upsert_node(c.clone());
    let now = 100 * MS_PER_DAY as i64;
    let mut recent_edge = edge("a", "c", Tier::Temporal);
    recent_edge.observed_at = now - (1.0 * MS_PER_DAY) as i64; // 1 day ago
    engine_graph::ingest(&mut g, recent_edge, EdgeAttrs::default()).unwrap();
    let hot = activity_burst(&g, &a.id, now, 7.0);
    assert!(hot > 0.0, "a node with a recent temporal edge bursts");
    // A node with no temporal edges has zero burst.
    let mut g2 = LinkageGraph::new();
    let q = doc("q", "plan", "f");
    g2.upsert_node(q.clone());
    assert_eq!(activity_burst(&g2, &q.id, now, 7.0), 0.0);
}

// --- W02.P04: normalization + composition + DOI ----------------------------

#[test]
fn rank_normalize_is_robust_to_heavy_tails() {
    // A heavy-tailed input: rank normalization spreads it evenly to [0,1].
    let values = vec![0.001, 0.002, 0.003, 1000.0];
    let normed = rank_normalize(&values);
    assert_eq!(normed[0], 0.0, "smallest maps to 0");
    assert_eq!(normed[3], 1.0, "largest maps to 1 regardless of magnitude");
    assert!(
        normed[1] > normed[0] && normed[2] > normed[1],
        "rank order preserved"
    );
    // Ties share the average rank.
    let tied = rank_normalize(&[5.0, 5.0, 9.0]);
    assert!(
        (tied[0] - tied[1]).abs() < 1e-12,
        "tied values share a rank"
    );
}

#[test]
fn weighted_composition_matches_a_hand_blend() {
    // A single node with known normalized criteria and a known weight row:
    // API = alpha*tp + beta*centrality + delta*rec + zeta*role + burst, *mult.
    let criteria = NormalizedCriteria {
        type_prior: vec![1.0],
        centrality_ppr: vec![0.5],
        betweenness: vec![0.0],
        recency: vec![1.0],
        structural_role: vec![0.0],
        burst: vec![0.0],
        lifecycle_mult: vec![1.0],
    };
    let row = Lens::Design.weights();
    // centrality blend with a single node normalizes to 0.5 (single elem).
    let expected = row.type_prior * 1.0
        + row.centrality * ((1.0 - row.betweenness_blend) * 0.5 + row.betweenness_blend * 0.0)
        + row.recency * 1.0
        + row.structural_role * 0.0
        + row.burst * 0.0;
    let api = compose_api(&criteria, Lens::Design);
    assert!(
        (api[0] - expected).abs() < 1e-9,
        "weighted blend matches by hand"
    );
}

#[test]
fn doi_subtracts_the_focus_distance() {
    let api = vec![1.0, 1.0, 1.0];
    // Node 1 is far (distance 1.0), node 0 is the focus (0.0).
    let distance = vec![0.0, 1.0, 0.5];
    let doi = apply_focus_distance(&api, &distance, Lens::Status);
    let gamma = Lens::Status.weights().focus_gamma;
    assert!(
        (doi[0] - 1.0).abs() < 1e-9,
        "the focus node keeps its full API"
    );
    assert!(
        (doi[1] - (1.0 - gamma)).abs() < 1e-9,
        "a far node loses gamma*distance"
    );
    assert!(
        doi[0] > doi[2] && doi[2] > doi[1],
        "interest falls with distance"
    );
}

#[test]
fn backbone_distance_is_bfs_hops_from_focus() {
    // path a - p - r: distance from a is 0,1,2.
    let nodes = vec![
        doc("a", "adr", "f"),
        doc("p", "plan", "f"),
        doc("r", "research", "f"),
    ];
    let mut g = LinkageGraph::new();
    for node in &nodes {
        g.upsert_node(node.clone());
    }
    engine_graph::ingest(
        &mut g,
        edge("a", "p", Tier::Structural),
        EdgeAttrs::default(),
    )
    .unwrap();
    engine_graph::ingest(
        &mut g,
        edge("p", "r", Tier::Structural),
        EdgeAttrs::default(),
    )
    .unwrap();
    let backbone = Backbone::build(&g, &members(&nodes));
    let a = node_id(&CanonicalKey::Document { stem: "a" });
    let dist = backbone_distance(&backbone, Some(&a));
    let ia = backbone.index_of(&a).unwrap();
    let ir = backbone
        .index_of(&node_id(&CanonicalKey::Document { stem: "r" }))
        .unwrap();
    assert!(
        dist[ia] < dist[ir],
        "the focus is nearest, the far node farthest"
    );
    // No focus -> all zero distance.
    assert!(backbone_distance(&backbone, None).iter().all(|&d| d == 0.0));
}

// --- W02.P05: the weight-sensitivity sweep ---------------------------------

/// A richer fixture with enough structure that a top-k is meaningful: two
/// features, several plans/adrs/exec records.
fn sweep_fixture() -> (LinkageGraph, Vec<Node>) {
    let mut nodes = Vec::new();
    for (stem, dt) in [
        ("p1", "plan"),
        ("p2", "plan"),
        ("a1", "adr"),
        ("a2", "adr"),
        ("r1", "research"),
        ("e1", "exec"),
        ("e2", "exec"),
        ("e3", "exec"),
        ("au1", "audit"),
    ] {
        nodes.push(doc(stem, dt, "f"));
    }
    let mut g = LinkageGraph::new();
    for n in &nodes {
        g.upsert_node(n.clone());
    }
    for (s, d, t) in [
        ("p1", "a1", Tier::Declared),
        ("p1", "r1", Tier::Structural),
        ("p1", "e1", Tier::Structural),
        ("p1", "e2", Tier::Structural),
        ("p2", "a2", Tier::Declared),
        ("p2", "e3", Tier::Structural),
        ("a1", "r1", Tier::Structural),
        ("au1", "p1", Tier::Structural),
    ] {
        engine_graph::ingest(&mut g, edge(s, d, t), EdgeAttrs::default()).unwrap();
    }
    (g, nodes)
}

#[test]
fn weight_sweep_top_k_stays_stable_for_both_lenses() {
    let (g, nodes) = sweep_fixture();
    let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
    let now = 100 * MS_PER_DAY as i64;
    for lens in [Lens::Design, Lens::Status] {
        let sweep = weight_sensitivity_sweep(&basis, &g, lens, now, 3, 0.3);
        assert!(
            sweep.is_stable(),
            "{:?} top-k must stay stable under +/-30% weight perturbation: overlap={}, tau={}",
            lens,
            sweep.min_topk_overlap,
            sweep.min_tau
        );
    }
}

#[test]
fn kendall_tau_is_one_for_identical_orders_and_negative_for_reversed() {
    let a = vec![1.0, 2.0, 3.0, 4.0];
    assert!((kendall_tau(&a, &a) - 1.0).abs() < 1e-9);
    let reversed = vec![4.0, 3.0, 2.0, 1.0];
    assert!((kendall_tau(&a, &reversed) + 1.0).abs() < 1e-9);
}

// --- W03.P06: the two lenses from one model --------------------------------

#[test]
fn the_two_lenses_yield_distinct_orderings_on_the_same_graph() {
    let (g, nodes) = sweep_fixture();
    let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
    let now = 100 * MS_PER_DAY as i64;
    let design = compose_api(
        &normalize_criteria(&basis, &g, Lens::Design, now),
        Lens::Design,
    );
    let status = compose_api(
        &normalize_criteria(&basis, &g, Lens::Status, now),
        Lens::Status,
    );
    let design_top = top_k_ids(&basis.backbone, &design, 3);
    let status_top = top_k_ids(&basis.backbone, &status, 3);
    assert_ne!(
        design_top, status_top,
        "the design (authority-led) and status (pivotal-bridge-led) lenses \
             order the same graph differently"
    );
    // Design should rank an ADR highly; status should favor a plan.
    assert!(
        design_top
            .iter()
            .any(|id| id.0.contains("a1") || id.0.contains("a2")),
        "design lens surfaces an authority ADR in its top-k: {design_top:?}"
    );
    assert!(
        status_top
            .iter()
            .any(|id| id.0.contains("p1") || id.0.contains("p2")),
        "status lens surfaces a plan in its top-k: {status_top:?}"
    );
}

#[test]
fn lens_parse_defaults_to_status() {
    assert_eq!(Lens::parse(None), Some(Lens::Status));
    assert_eq!(Lens::parse(Some("status")), Some(Lens::Status));
    assert_eq!(Lens::parse(Some("design")), Some(Lens::Design));
    assert_eq!(Lens::parse(Some("bogus")), None);
    assert_eq!(Lens::default(), Lens::Status);
}

// --- W03.P07: focus folding + memoization keys -----------------------------

#[test]
fn focus_folding_raises_nodes_near_the_focus() {
    let (g, nodes) = sweep_fixture();
    let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
    let now = 100 * MS_PER_DAY as i64;
    let no_focus = compute_salience(&basis, &g, Lens::Status, None, now, false);
    let a1 = node_id(&CanonicalKey::Document { stem: "a1" });
    let focused = compute_salience(&basis, &g, Lens::Status, Some(&a1), now, false);
    // The focus node itself (distance 0) is not penalized; a node FAR from the
    // focus loses interest relative to the unfocused ranking.
    let far = node_id(&CanonicalKey::Document { stem: "p2" });
    // Focused score of the focus's own neighborhood should not collapse.
    assert!(focused.get(&a1.0).is_some());
    // The no-focus and focused maps differ (focus folding actually changed
    // the ordering for at least the far node).
    assert!(
        (no_focus.get(&far.0).unwrap_or(0.0) - focused.get(&far.0).unwrap_or(0.0)).abs() > 1e-9
            || no_focus.by_id != focused.by_id,
        "focus folding shifts the DOI ranking"
    );
}

#[test]
fn no_focus_lens_switch_keys_differ_focus_keys_match() {
    // A no-focus lens switch is a different (lens,focus) key; a focus change
    // for one lens is a different key too (the route memoizes per this key).
    let status_none = FocusKey::new(Lens::Status, None, false);
    let design_none = FocusKey::new(Lens::Design, None, false);
    assert_ne!(status_none, design_none, "lens is part of the key");
    let a = node_id(&CanonicalKey::Document { stem: "a" });
    let status_focus = FocusKey::new(Lens::Status, Some(&a), false);
    assert_ne!(status_none, status_focus, "focus is part of the key");
    // Same lens + same focus + same partiality is a cache hit (equal key).
    assert_eq!(status_focus, FocusKey::new(Lens::Status, Some(&a), false));
}

// --- W03.P08.S33: partial-tier flag ----------------------------------------

#[test]
fn salience_is_partial_when_a_relevant_tier_is_degraded() {
    // A degraded BACKBONE tier (declared/structural) makes ANY lens partial.
    assert!(is_partial(Lens::Design, &["declared"]));
    assert!(is_partial(Lens::Status, &["structural"]));
    // A degraded temporal tier makes the STATUS lens partial (it reads the
    // recency burst) but NOT the design lens (no temporal input).
    assert!(is_partial(Lens::Status, &["temporal"]));
    assert!(!is_partial(Lens::Design, &["temporal"]));
    // A degraded semantic tier alone never makes the backbone salience partial.
    assert!(!is_partial(Lens::Design, &["semantic"]));
    assert!(!is_partial(Lens::Status, &["semantic"]));
    // No degradation -> not partial.
    assert!(!is_partial(Lens::Status, &[]));
    // The partial flag carries through compute_salience to the served scores.
    let (g, nodes) = fixture();
    let basis = LensBasis::compute(&g, &scope(), &members(&nodes));
    let scores = compute_salience(&basis, &g, Lens::Status, None, 0, true);
    assert!(
        scores.partial,
        "the partial flag carries into the served scores"
    );
}

// --- W03.P08: annotate + DOI-ordered bounding ------------------------------

#[test]
fn annotate_attaches_salience_to_scored_nodes_only() {
    let mut scores = SalienceScores::default();
    scores.by_id.insert("doc:a".into(), 0.75);
    let mut nodes = vec![
        serde_json::json!({"id": "doc:a"}),
        serde_json::json!({"id": "feature:x"}), // unscored
    ];
    annotate_nodes(&mut nodes, &scores);
    assert_eq!(nodes[0]["salience"].as_f64().unwrap(), 0.75);
    assert!(
        nodes[1].get("salience").is_none(),
        "an unscored node gets no guessed salience"
    );
}

#[test]
fn order_by_salience_puts_top_doi_first_unscored_last() {
    let mut scores = SalienceScores::default();
    scores.by_id.insert("doc:a".into(), 0.2);
    scores.by_id.insert("doc:b".into(), 0.9);
    let mut nodes = vec![
        serde_json::json!({"id": "doc:a"}),
        serde_json::json!({"id": "doc:unscored"}),
        serde_json::json!({"id": "doc:b"}),
    ];
    order_by_salience(&mut nodes, &scores);
    assert_eq!(nodes[0]["id"], "doc:b", "highest DOI first");
    assert_eq!(nodes[1]["id"], "doc:a");
    assert_eq!(
        nodes[2]["id"], "doc:unscored",
        "unscored recedes under truncation"
    );
}
