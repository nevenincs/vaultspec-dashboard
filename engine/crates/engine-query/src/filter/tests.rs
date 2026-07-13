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
    use engine_model::{CanonicalKey, Dates, Facet, Node, NodeKind, Presence, ScopeRef, node_id};

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
                stamped: None,
            }),
            feature_tags: vec![feature.to_string()],
            status: None,
            tier: None,
            size: None,
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
fn vocabulary_serves_per_criterion_date_bounds_for_all_three_fields() {
    // TTR-008 guard: the /filters vocabulary serves an HONEST per-criterion
    // corpus span for created / modified / stamped — never a created-only
    // value. The timeline strip's edges track the ACTIVE criterion, so each
    // field's bounds must be served independently, and a field absent from
    // every node is omitted (honest degradation), never faked to `created`.
    use engine_model::{
        CanonicalKey, Dates, Facet, Node, NodeKind, Presence, ScopeRef, Timestamp, node_id,
    };

    fn doc(
        stem: &str,
        created: Option<&str>,
        modified: Option<Timestamp>,
        stamped: Option<&str>,
    ) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.to_string(),
            title: None,
            doc_type: Some("adr".to_string()),
            dates: Some(Dates {
                created: created.map(str::to_string),
                modified,
                stamped: stamped.map(str::to_string),
            }),
            feature_tags: vec!["alpha".to_string()],
            status: None,
            tier: None,
            size: None,
            facets: vec![Facet {
                scope: ScopeRef::Worktree {
                    path: "/wt/main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    // Deliberately DISJOINT spans per field: created in June, modified far
    // earlier (mtime epochs), stamped in July — so a created-only fallback
    // would be caught immediately.
    let (m_lo, m_hi): (Timestamp, Timestamp) = (1_700_000_000_000, 1_705_000_000_000);
    let mut graph = LinkageGraph::new();
    graph.upsert_node(doc(
        "d1",
        Some("2026-06-10"),
        Some(m_lo),
        Some("2026-07-02"),
    ));
    graph.upsert_node(doc(
        "d2",
        Some("2026-06-14"),
        Some(m_hi),
        Some("2026-07-01"),
    ));

    let vocab = vocabulary(&graph);
    assert_eq!(
        vocab.date_bounds_by_field.created,
        Some(DateBounds {
            min: "2026-06-10".into(),
            max: "2026-06-14".into(),
        }),
    );
    assert_eq!(
        vocab.date_bounds_by_field.modified,
        Some(DateBounds {
            min: crate::lineage::ms_to_date_key(m_lo),
            max: crate::lineage::ms_to_date_key(m_hi),
        }),
        "modified span served from the mtime field, independent of created",
    );
    assert_eq!(
        vocab.date_bounds_by_field.stamped,
        Some(DateBounds {
            min: "2026-07-01".into(),
            max: "2026-07-02".into(),
        }),
        "stamped span served independently of created",
    );
    // Flat back-compat alias stays the created span.
    assert_eq!(vocab.date_bounds, vocab.date_bounds_by_field.created);

    // A criterion absent from every node is OMITTED (serialized null), never
    // faked to the created span.
    let mut created_only = LinkageGraph::new();
    created_only.upsert_node(doc("c1", Some("2026-06-10"), None, None));
    let vocab2 = vocabulary(&created_only);
    assert_eq!(
        vocab2.date_bounds_by_field.created,
        Some(DateBounds {
            min: "2026-06-10".into(),
            max: "2026-06-10".into(),
        }),
    );
    assert_eq!(
        vocab2.date_bounds_by_field.modified, None,
        "absent modified omitted, not faked to created"
    );
    assert_eq!(
        vocab2.date_bounds_by_field.stamped, None,
        "absent stamped omitted, not faked to created"
    );
}

#[test]
fn status_and_plan_tier_facets_are_enumerated_sorted_and_deduped() {
    // W01.P03.S14: the status and plan-tier vocabulary is data-driven —
    // enumerated from the nodes actually present, sorted, deduped. A node
    // with neither contributes to neither facet.
    use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};

    fn node(stem: &str, doc_type: &str, status: Option<&str>, tier: Option<&str>) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.to_string(),
            title: None,
            doc_type: Some(doc_type.to_string()),
            dates: None,
            feature_tags: vec![],
            status: status.map(str::to_string),
            tier: tier.map(str::to_string),
            size: None,
            facets: vec![engine_model::Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: None,
            }],
        }
    }

    let mut graph = LinkageGraph::new();
    // Two ADRs sharing `accepted` (proves dedup), one `proposed`.
    graph.upsert_node(node("a1", "adr", Some("accepted"), None));
    graph.upsert_node(node("a2", "adr", Some("proposed"), None));
    graph.upsert_node(node("a3", "adr", Some("accepted"), None));
    // Two plans, tiers L3 and L1 (proves sort), plus a duplicate L3.
    graph.upsert_node(node("p1", "plan", None, Some("L3")));
    graph.upsert_node(node("p2", "plan", None, Some("L1")));
    graph.upsert_node(node("p3", "plan", None, Some("L3")));
    // A research doc with neither — contributes to neither facet.
    graph.upsert_node(node("r1", "research", None, None));

    let vocab = vocabulary(&graph);
    assert_eq!(
        vocab.statuses,
        vec!["accepted", "proposed"],
        "statuses sorted + deduped from the graph"
    );
    assert_eq!(
        vocab.plan_tiers,
        vec!["L1", "L3"],
        "plan tiers sorted + deduped from the graph"
    );

    // An empty graph carries empty facets, never a hardcoded enum.
    let empty = vocabulary(&LinkageGraph::new());
    assert!(empty.statuses.is_empty() && empty.plan_tiers.is_empty());
}

#[test]
fn status_and_plan_tier_filters_narrow_and_reject_out_of_enum() {
    // W01.P03.S12/S13: the matches_node check narrows to the requested set;
    // a node with no status/tier is excluded when the facet is non-empty;
    // validation rejects an out-of-enum status or tier.
    use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};
    let node = |status: Option<&str>, tier: Option<&str>| Node {
        id: node_id(&CanonicalKey::Document { stem: "x" }),
        kind: NodeKind::Document,
        key: "x".into(),
        title: None,
        doc_type: None,
        dates: None,
        feature_tags: vec![],
        status: status.map(str::to_string),
        tier: tier.map(str::to_string),
        size: None,
        facets: vec![engine_model::Facet {
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    };
    let _ = NodeKind::Document;

    let by_status = Filter {
        statuses: vec!["accepted".into()],
        ..Default::default()
    };
    assert!(by_status.matches_node(&node(Some("accepted"), None)));
    assert!(!by_status.matches_node(&node(Some("proposed"), None)));
    assert!(
        !by_status.matches_node(&node(None, None)),
        "a status-less node is excluded by a non-empty status facet"
    );

    let by_tier = Filter {
        plan_tiers: vec!["L3".into()],
        ..Default::default()
    };
    assert!(by_tier.matches_node(&node(None, Some("L3"))));
    assert!(!by_tier.matches_node(&node(None, Some("L1"))));
    assert!(!by_tier.matches_node(&node(None, None)));

    // `superseded` is a real ADR status (a decision retired by a later one) and
    // must VALIDATE — it is served in the statuses vocabulary.
    let superseded: Filter = serde_json::from_str(r#"{"statuses": ["superseded"]}"#).unwrap();
    assert!(superseded.validated().is_ok());

    // Out-of-enum facets fail validation loud.
    let bad_status: Filter = serde_json::from_str(r#"{"statuses": ["bogus"]}"#).unwrap();
    assert_eq!(
        bad_status.validated(),
        Err(FilterError::UnknownStatus("bogus".into()))
    );
    let bad_tier: Filter = serde_json::from_str(r#"{"plan_tiers": ["L9"]}"#).unwrap();
    assert_eq!(
        bad_tier.validated(),
        Err(FilterError::UnknownPlanTier("L9".into()))
    );
}

#[test]
fn doc_type_facet_narrows_and_is_an_accepted_grammar_field() {
    // The filter vocabulary advertises `doc_types` as filterable, so the
    // grammar must ACCEPT them (it 400'd before): a non-empty facet narrows
    // to nodes whose doc_type is in the set; a doc_type-less node (a feature/
    // code node) is excluded, the same exclusion kinds/statuses apply.
    use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};
    let node = |doc_type: Option<&str>| Node {
        id: node_id(&CanonicalKey::Document { stem: "x" }),
        kind: NodeKind::Document,
        key: "x".into(),
        title: None,
        doc_type: doc_type.map(str::to_string),
        dates: None,
        feature_tags: vec![],
        status: None,
        tier: None,
        size: None,
        facets: vec![engine_model::Facet {
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    };
    // `doc_types` is an accepted field (no deny_unknown_fields rejection) and
    // normalizes (sort + dedup) like the other data-driven facets.
    let by_doc_type: Filter =
        serde_json::from_str(r#"{"doc_types": ["plan", "adr", "adr"]}"#).unwrap();
    let normalized = by_doc_type.validated().unwrap();
    assert_eq!(normalized.doc_types, vec!["adr", "plan"], "sorted, deduped");
    assert!(normalized.matches_node(&node(Some("adr"))));
    assert!(normalized.matches_node(&node(Some("plan"))));
    assert!(!normalized.matches_node(&node(Some("research"))));
    assert!(
        !normalized.matches_node(&node(None)),
        "a doc_type-less node is excluded by a non-empty doc_types facet"
    );
}

#[test]
fn date_range_facet_narrows_by_created_and_is_an_accepted_grammar_field() {
    // The client GraphFilter emits `date_range`; the grammar must accept it
    // (it 400'd before). A node passes if its blob-true `created` date is in
    // the inclusive window; open bounds are allowed; an undated node is
    // excluded when the window is set (mirrors lineage::created_in_range).
    use engine_model::{CanonicalKey, Dates, NodeKind, Presence, ScopeRef, node_id};
    let node = |created: Option<&str>| Node {
        id: node_id(&CanonicalKey::Document { stem: "x" }),
        kind: NodeKind::Document,
        key: "x".into(),
        title: None,
        doc_type: Some("adr".into()),
        dates: created.map(|c| Dates {
            created: Some(c.to_string()),
            modified: None,
            stamped: None,
        }),
        feature_tags: vec![],
        status: None,
        tier: None,
        size: None,
        facets: vec![engine_model::Facet {
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    };
    // `date_range` is an accepted field (no deny_unknown_fields rejection).
    let f: Filter =
        serde_json::from_str(r#"{"date_range": {"from": "2026-06-01", "to": "2026-06-15"}}"#)
            .unwrap();
    let f = f.validated().unwrap();
    assert!(f.matches_node(&node(Some("2026-06-10"))), "in range");
    assert!(
        f.matches_node(&node(Some("2026-06-01"))),
        "from is inclusive"
    );
    assert!(f.matches_node(&node(Some("2026-06-15"))), "to is inclusive");
    assert!(!f.matches_node(&node(Some("2026-05-31"))), "before from");
    assert!(!f.matches_node(&node(Some("2026-06-16"))), "after to");
    assert!(
        !f.matches_node(&node(None)),
        "an undated node is excluded by a set window"
    );
    // Open upper bound.
    let open: Filter = serde_json::from_str(r#"{"date_range": {"from": "2026-06-10"}}"#).unwrap();
    assert!(open.matches_node(&node(Some("2026-12-31"))));
    assert!(!open.matches_node(&node(Some("2026-06-09"))));
}

#[test]
fn date_field_selects_which_date_the_window_filters_by() {
    // #14: the `date_field` criterion switches WHICH date the same
    // `date_range` window tests — `created` (default) vs `stamped` (frontmatter
    // `modified:`) — and `modified` (mtime) absent on a node is honestly
    // excluded. ONE node, ONE window, three criteria → three outcomes.
    use engine_model::{CanonicalKey, Dates, NodeKind, Presence, ScopeRef, node_id};
    let node = Node {
        id: node_id(&CanonicalKey::Document { stem: "x" }),
        kind: NodeKind::Document,
        key: "x".into(),
        title: None,
        doc_type: Some("adr".into()),
        dates: Some(Dates {
            created: Some("2026-01-01".into()), // before the window
            modified: None,                     // mtime absent (e.g. as-of view)
            stamped: Some("2026-06-10".into()), // inside the window
        }),
        feature_tags: vec![],
        status: None,
        tier: None,
        size: None,
        facets: vec![engine_model::Facet {
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    };
    let window = r#""date_range": {"from": "2026-06-01", "to": "2026-06-30"}"#;
    let by_created: Filter =
        serde_json::from_str(&format!(r#"{{{window}, "date_field": "created"}}"#)).unwrap();
    let by_stamped: Filter =
        serde_json::from_str(&format!(r#"{{{window}, "date_field": "stamped"}}"#)).unwrap();
    let by_modified: Filter =
        serde_json::from_str(&format!(r#"{{{window}, "date_field": "modified"}}"#)).unwrap();
    assert_eq!(
        by_created.date_field,
        DateField::Created,
        "default-equivalent"
    );
    assert!(
        !by_created.matches_node(&node),
        "by created (2026-01-01) the node is OUT of the June window"
    );
    assert!(
        by_stamped.matches_node(&node),
        "by stamped (2026-06-10) the node is IN the June window"
    );
    assert!(
        !by_modified.matches_node(&node),
        "by modified (mtime absent) the node has no position — honest exclusion"
    );
    // Absent `date_field` defaults to created (back-compat).
    let bare: Filter = serde_json::from_str(&format!(r#"{{{window}}}"#)).unwrap();
    assert_eq!(bare.date_field, DateField::Created, "absent => created");
}

#[test]
fn feature_query_glob_and_regex_search_over_feature_tags() {
    // filter-controls campaign: the feature query narrows by glob or regex
    // over a node's feature_tags (any-match), case-insensitive; an empty
    // pattern is dropped; a malformed regex 400s.
    use engine_model::{CanonicalKey, NodeKind, Presence, ScopeRef, node_id};
    let node = |tags: &[&str]| Node {
        id: node_id(&CanonicalKey::Document { stem: "x" }),
        kind: NodeKind::Document,
        key: "x".into(),
        title: None,
        doc_type: None,
        dates: None,
        feature_tags: tags.iter().map(|t| t.to_string()).collect(),
        status: None,
        tier: None,
        size: None,
        facets: vec![engine_model::Facet {
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: None,
        }],
    };

    // Glob: anchored full-match, `*` wildcard, case-insensitive.
    let glob: Filter =
        serde_json::from_str(r#"{"feature_query": {"value": "dashboard-*", "mode": "glob"}}"#)
            .unwrap();
    let glob = glob.validated().unwrap();
    assert!(glob.matches_node(&node(&["dashboard-gui"])));
    assert!(glob.matches_node(&node(&["unrelated", "Dashboard-Settings"])));
    assert!(!glob.matches_node(&node(&["engine-hardening"])));
    // Anchored: a glob must match the whole tag, not a substring.
    assert!(!glob.matches_node(&node(&["my-dashboard-gui"])));

    // Regex: unanchored search.
    let regex: Filter =
        serde_json::from_str(r#"{"feature_query": {"value": "sync$", "mode": "regex"}}"#).unwrap();
    let regex = regex.validated().unwrap();
    assert!(regex.matches_node(&node(&["delta-sync"])));
    assert!(!regex.matches_node(&node(&["sync-engine"])));

    // An empty pattern is normalized away (no constraint).
    let empty: Filter =
        serde_json::from_str(r#"{"feature_query": {"value": "   ", "mode": "glob"}}"#).unwrap();
    let empty = empty.validated().unwrap();
    assert_eq!(empty.feature_query, None);
    assert!(empty.matches_node(&node(&["anything"])));

    // A malformed regex 400s loud rather than silently matching nothing.
    let bad: Filter =
        serde_json::from_str(r#"{"feature_query": {"value": "(unclosed", "mode": "regex"}}"#)
            .unwrap();
    assert!(matches!(
        bad.validated(),
        Err(FilterError::InvalidFeatureQuery { .. })
    ));
}

#[test]
fn plan_state_facet_narrows_by_progress_completion_and_excludes_non_plans() {
    // plan_states is the served plan-COMPLETION facet
    // (not-started/in-progress/finished), derived from checkbox PROGRESS
    // (done/total), NEVER from `lifecycle.state` (which is the plan TIER for a
    // tiered plan). Scope-dependent like `health`: a node passes only if it is
    // a PLAN whose scoped progress maps to a completion class in the requested
    // set; a non-plan node, or a plan with no scoped progress, is EXCLUDED
    // when the facet is set (the statuses exclusion).
    use engine_model::{
        CanonicalKey, Facet, Lifecycle, NodeKind, Presence, Progress, ScopeRef, node_id,
    };
    let scope = ScopeRef::Ref {
        name: "main".into(),
    };
    let plan = |stem: &str, lifecycle: Option<Lifecycle>| Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.to_string(),
        title: None,
        doc_type: Some("plan".into()),
        dates: None,
        feature_tags: vec![],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            presence: Presence::Exists,
            content_hash: None,
            lifecycle,
        }],
    };
    // A tiered plan: lifecycle.state is the TIER (`L2`), completion lives in
    // progress. done==total → finished.
    let finished = plan(
        "done",
        Some(Lifecycle {
            state: "L2".into(),
            progress: Some(Progress { done: 5, total: 5 }),
        }),
    );
    // 0<done<total → in-progress.
    let in_progress = plan(
        "wip",
        Some(Lifecycle {
            state: "L3".into(),
            progress: Some(Progress { done: 2, total: 5 }),
        }),
    );
    // done==0, total>0 → not-started.
    let not_started = plan(
        "fresh",
        Some(Lifecycle {
            state: "L1".into(),
            progress: Some(Progress { done: 0, total: 4 }),
        }),
    );
    let no_lifecycle = plan("bare", None);
    // A non-plan node (an ADR carrying state "accepted") must be excluded by
    // any plan_states filter.
    let adr = Node {
        id: node_id(&CanonicalKey::Document { stem: "a1" }),
        kind: NodeKind::Document,
        key: "a1".into(),
        title: None,
        doc_type: Some("adr".into()),
        dates: None,
        feature_tags: vec![],
        status: Some("accepted".into()),
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: ScopeRef::Ref {
                name: "main".into(),
            },
            presence: Presence::Exists,
            content_hash: None,
            lifecycle: Some(Lifecycle {
                state: "accepted".into(),
                progress: None,
            }),
        }],
    };

    let by_finished = Filter {
        plan_states: vec!["finished".into()],
        ..Default::default()
    }
    .validated()
    .unwrap();
    // (a) keeps a finished plan, excludes an in-progress one.
    assert!(by_finished.matches_plan_state(&finished, &scope));
    assert!(!by_finished.matches_plan_state(&in_progress, &scope));
    // (b) a plan with no progress is excluded when the facet is set.
    assert!(!by_finished.matches_plan_state(&no_lifecycle, &scope));
    // (c) a non-plan node (ADR "accepted") is excluded by a plan_states facet.
    assert!(!by_finished.matches_plan_state(&adr, &scope));

    // in-progress facet keeps the in-progress plan only.
    let by_in_progress = Filter {
        plan_states: vec!["in-progress".into()],
        ..Default::default()
    }
    .validated()
    .unwrap();
    assert!(by_in_progress.matches_plan_state(&in_progress, &scope));
    assert!(!by_in_progress.matches_plan_state(&finished, &scope));
    assert!(!by_in_progress.matches_plan_state(&not_started, &scope));

    // not-started facet keeps the 0/N plan only.
    let by_not_started = Filter {
        plan_states: vec!["not-started".into()],
        ..Default::default()
    }
    .validated()
    .unwrap();
    assert!(by_not_started.matches_plan_state(&not_started, &scope));
    assert!(!by_not_started.matches_plan_state(&in_progress, &scope));
    assert!(!by_not_started.matches_plan_state(&finished, &scope));

    // An empty facet is no constraint — every node passes, plan or not.
    let none = Filter::default();
    assert!(none.matches_plan_state(&finished, &scope));
    assert!(none.matches_plan_state(&no_lifecycle, &scope));
    assert!(none.matches_plan_state(&adr, &scope));

    // A lifecycle in a DIFFERENT scope does not satisfy this scope's facet.
    let other_scope = ScopeRef::Ref {
        name: "feature-x".into(),
    };
    assert!(
        !by_finished.matches_plan_state(&finished, &other_scope),
        "the lifecycle lives on the `main` facet, not `feature-x`"
    );
}

#[test]
fn plan_state_validation_rejects_unknown_and_normalizes() {
    // (c) an unknown plan-state value is a typed validation error. The old
    // active/complete lifecycle-state values are no longer plan states.
    let bad: Filter = serde_json::from_str(r#"{"plan_states": ["pending"]}"#).unwrap();
    assert_eq!(
        bad.validated(),
        Err(FilterError::UnknownPlanState("pending".into()))
    );
    let stale: Filter = serde_json::from_str(r#"{"plan_states": ["complete"]}"#).unwrap();
    assert_eq!(
        stale.validated(),
        Err(FilterError::UnknownPlanState("complete".into())),
        "the old lifecycle-state value is rejected by the completion enum"
    );
    // The known completion set normalizes (sort + dedup) like the other facets.
    let dup: Filter =
        serde_json::from_str(r#"{"plan_states": ["finished", "not-started", "finished"]}"#)
            .unwrap();
    assert_eq!(
        dup.validated().unwrap().plan_states,
        vec!["finished", "not-started"],
        "sorted, deduped"
    );
}

#[test]
fn vocabulary_lists_only_progress_derived_plan_completions() {
    // (d) the vocabulary enumerates the DISTINCT plan-COMPLETION classes
    // present among PLAN nodes — derived from checkbox progress (done/total),
    // in lifecycle order, deduped, never a hardcoded enum and never a tier/status/severity
    // (the previous bug, where `lifecycle.state` was read directly and leaked
    // the plan TIER / ADR status / audit severity into this facet).
    use engine_model::{
        CanonicalKey, Facet, Lifecycle, NodeKind, Presence, Progress, ScopeRef, node_id,
    };
    // A plan whose lifecycle.state is the TIER, with a given progress.
    fn plan(stem: &str, tier: &str, done: u32, total: u32) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.to_string(),
            title: None,
            doc_type: Some("plan".into()),
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: Some(tier.to_string()),
            size: None,
            facets: vec![Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: Some(Lifecycle {
                    state: tier.to_string(),
                    progress: Some(Progress { done, total }),
                }),
            }],
        }
    }
    // A non-plan node carrying a lifecycle.state (ADR status / audit severity)
    // that must NEVER leak into plan_states.
    fn other(stem: &str, doc_type: &str, state: &str) -> Node {
        Node {
            id: node_id(&CanonicalKey::Document { stem }),
            kind: NodeKind::Document,
            key: stem.to_string(),
            title: None,
            doc_type: Some(doc_type.to_string()),
            dates: None,
            feature_tags: vec![],
            status: None,
            tier: None,
            size: None,
            facets: vec![Facet {
                scope: ScopeRef::Ref {
                    name: "main".into(),
                },
                presence: Presence::Exists,
                content_hash: None,
                lifecycle: Some(Lifecycle {
                    state: state.to_string(),
                    progress: None,
                }),
            }],
        }
    }

    let mut graph = LinkageGraph::new();
    // Two finished plans (proves dedup; tiers L2/L4 differ but completion is
    // the same), one in-progress, one not-started.
    graph.upsert_node(plan("p1", "L2", 5, 5));
    graph.upsert_node(plan("p2", "L4", 3, 3));
    graph.upsert_node(plan("p3", "L3", 2, 5));
    graph.upsert_node(plan("p4", "L1", 0, 4));
    // An ADR ("accepted") and an audit ("high") in the same graph: their
    // lifecycle.state must NOT appear in plan_states.
    graph.upsert_node(other("a1", "adr", "accepted"));
    graph.upsert_node(other("au1", "audit", "high"));

    let vocab = vocabulary(&graph);
    assert_eq!(
        vocab.plan_states,
        vec!["not-started", "in-progress", "finished"],
        "distinct plan completions in lifecycle order, deduped, from PLAN progress only"
    );
    // Hard guarantee: plan_states is a subset of the completion enum — never a
    // tier (L1-L4), an ADR status (accepted), or an audit severity (high).
    let allowed = ["not-started", "in-progress", "finished"];
    assert!(
        vocab
            .plan_states
            .iter()
            .all(|s| allowed.contains(&s.as_str())),
        "plan_states must contain only completion classes, never a tier/status/severity: {:?}",
        vocab.plan_states
    );

    // An empty graph carries an empty plan-state facet, never a hardcoded enum.
    let empty = vocabulary(&LinkageGraph::new());
    assert!(empty.plan_states.is_empty());
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
