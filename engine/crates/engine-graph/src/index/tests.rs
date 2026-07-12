use super::*;

fn scope() -> ScopeRef {
    ScopeRef::Ref {
        name: "main".into(),
    }
}

#[test]
fn worktree_corpus_fingerprint_changes_on_edit_and_is_stable_otherwise() {
    // graph-worktree-edge-consistency ADR (the cache-key trap): the present-view
    // declared cache keys on this corpus fingerprint, NOT the HEAD sha — so a
    // `.vault/` edit (a doc's new content hash, e.g. an uncommitted `related:`
    // change) MUST change the fingerprint so the fold misses the cache and
    // re-reads the working tree; an unchanged corpus MUST yield the same
    // fingerprint (cache hit, stable across restarts). A HEAD-sha key fails the
    // first property — an uncommitted edit leaves HEAD unchanged — which is the
    // bug this fingerprint exists to fix.
    let mk = |stem: &str, hash: &str| Node {
        id: node_id(&CanonicalKey::Document { stem }),
        kind: NodeKind::Document,
        key: stem.into(),
        title: None,
        doc_type: Some("adr".into()),
        dates: None,
        feature_tags: vec![],
        status: None,
        tier: None,
        size: None,
        facets: vec![Facet {
            scope: scope(),
            presence: Presence::Exists,
            content_hash: Some(hash.into()),
            lifecycle: None,
        }],
    };
    let build = |docs: &[(&str, &str)]| {
        let mut g = LinkageGraph::new();
        for (stem, hash) in docs {
            g.upsert_node(mk(stem, hash));
        }
        worktree_corpus_fingerprint(&g, &scope())
    };
    let base = build(&[("a-adr", "h1"), ("b-adr", "h2")]);
    assert_eq!(
        base,
        build(&[("a-adr", "h1"), ("b-adr", "h2")]),
        "an unchanged corpus yields a stable fingerprint (cache hit, restart-stable)"
    );
    assert_ne!(
        base,
        build(&[("a-adr", "h1"), ("b-adr", "h2-edited")]),
        "a content edit (e.g. a `related:` change) must change the fingerprint"
    );
    assert_ne!(
        base,
        build(&[("a-adr", "h1"), ("b-adr", "h2"), ("c-adr", "h3")]),
        "a new (uncommitted) document must change the fingerprint"
    );
}

#[test]
fn frontmatter_stamped_reads_the_modified_key_distinct_from_date() {
    // #14: `dates.stamped` is the frontmatter `modified:` CLI stamp, read like
    // `date:` → `created`. A doc with both keys yields both, distinctly; a doc
    // with only `date:` has no stamp (truthful absence), and the `modified:`
    // key must not be confused with `date:`.
    let both = "---\ntags:\n  - '#adr'\ndate: '2026-06-13'\nmodified: '2026-06-20'\n---\n\n# x\n";
    assert_eq!(frontmatter_date(both).as_deref(), Some("2026-06-13"));
    assert_eq!(frontmatter_stamped(both).as_deref(), Some("2026-06-20"));
    let date_only = "---\ntags:\n  - '#adr'\ndate: '2026-06-13'\n---\n\n# x\n";
    assert_eq!(frontmatter_date(date_only).as_deref(), Some("2026-06-13"));
    assert!(
        frontmatter_stamped(date_only).is_none(),
        "no `modified:` key → no stamp (truthful absence)"
    );
}

#[test]
fn adr_status_parser_extracts_each_status_and_none_when_absent() {
    // W01.P01.S03: the H1 status marker the ADR template emits carries one
    // of the four enum values; the parser reads each, and a status-less
    // document (or an out-of-enum value) is truthful absence, not a guess.
    for status in ["proposed", "accepted", "rejected", "deprecated"] {
        let h1 = format!(
            "---\ntags:\n  - '#adr'\n---\n\n# `x` adr: `topic` | (**status:** `{status}`)\n\nbody\n"
        );
        assert_eq!(
            frontmatter_adr_status(&h1).as_deref(),
            Some(status),
            "extracts the `{status}` H1 status"
        );
    }
    // Case-insensitive on the enum token (templates are lowercase but a
    // hand-authored `Accepted` must still resolve to the canonical token).
    let mixed = "# `x` adr: `t` | (**status:** `Accepted`)\n";
    assert_eq!(frontmatter_adr_status(mixed).as_deref(), Some("accepted"));
    // No status marker at all → None.
    let no_status = "---\ntags:\n  - '#adr'\n---\n\n# `x` adr: `topic`\n\nbody\n";
    assert_eq!(frontmatter_adr_status(no_status), None);
    // An out-of-enum status token → None (rejected, never carried).
    let bad = "# `x` adr: `t` | (**status:** `superseded`)\n";
    assert_eq!(frontmatter_adr_status(bad), None);
}

#[test]
fn body_metadata_parsers_are_fence_aware_and_word_bounded() {
    // #42 metadata-parser correctness pass: the body parsers must not read a
    // fenced EXAMPLE as the document's own metadata, and severity/status
    // matching is whole-word, not substring. Each assertion FAILS against the
    // pre-fix parsers (whole-body substring / fence-blind line scans).

    // doc_title: a fenced `# Example` must not become the title; the real H1
    // below it wins.
    let titled = "```md\n# Fenced Example Title\n```\n\n# Real Title\n\nbody\n";
    assert_eq!(
        doc_title(titled).as_deref(),
        Some("Real Title"),
        "a fenced `# heading` is not the document title",
    );

    // checkbox_lifecycle: a fenced example task list must not inflate
    // progress; only the two real boxes (one done) count.
    let plan =
        "## Steps\n\n- [x] real done\n- [ ] real open\n\n```\n- [x] ex\n- [x] ex\n- [ ] ex\n```\n";
    let life = checkbox_lifecycle(plan).expect("real checkboxes present");
    let progress = life.progress.expect("progress reported");
    assert_eq!(
        (progress.done, progress.total),
        (1, 2),
        "fenced example checkboxes do not inflate done/total",
    );

    // audit_max_severity: prose "below"/"highlight" must NOT match
    // low/high; only the labelled heading's real severity (medium) wins.
    let audit = "# Audit\n\nThe risk is below the threshold; we highlight nothing.\n\n### Finding F1 (Medium)\n\nDetails.\n";
    assert_eq!(
        audit_max_severity(audit).as_deref(),
        Some("medium"),
        "`below`/`highlight` prose does not elevate to low/high; the heading's medium wins",
    );
    // And a genuine `low` on a label line still resolves (word match works).
    let low = "# Audit\n\n**Severity:** low\n\nNothing follows below.\n";
    assert_eq!(audit_max_severity(low).as_deref(), Some("low"));
    // A fenced `Critical` example must not elevate the severity.
    let fenced_sev = "# Audit\n\n```\n### Finding (Critical)\n```\n\n### Finding F1 (Low)\n";
    assert_eq!(
        audit_max_severity(fenced_sev).as_deref(),
        Some("low"),
        "a fenced `Critical` example does not drive the lifecycle",
    );

    // rule_status: a rule whose `## Status` says it SUPERSEDES another is the
    // ACTIVE successor, not retired; only "superseded by" retires it; and
    // prose "supersedes" outside `## Status` never flips a live rule.
    let successor = "# rule\n\n## Status\n\nActive. Supersedes `old-rule`.\n\n## Source\n";
    assert_eq!(
        rule_status(successor),
        "active",
        "a rule that supersedes another is the active successor",
    );
    let retired = "# rule\n\n## Status\n\nSuperseded by `new-rule`.\n\n## Source\n";
    assert_eq!(rule_status(retired), "superseded");
    let prose_only =
        "# rule\n\n## Rule\n\nThis supersedes the prior framing.\n\n## Status\n\nActive.\n";
    assert_eq!(
        rule_status(prose_only),
        "active",
        "`supersedes` in prose outside `## Status` does not retire a live rule",
    );
    let no_status = "# rule\n\n## Rule\n\nbody, no status section\n";
    assert_eq!(rule_status(no_status), "active");
}

#[test]
fn feature_tag_parser_accepts_single_double_and_bare_quote_styles() {
    // The CLI emits single-quoted tag sequence entries canonically, but a
    // re-serialization can produce double quotes; both (and a bare `#tag`)
    // must yield the same feature tag, and the directory tag is never one.
    let single = "---\ntags:\n  - '#adr'\n  - '#alpha'\n---\n\nbody\n";
    let double = "---\ntags:\n  - \"#adr\"\n  - \"#alpha\"\n---\n\nbody\n";
    let bare = "---\ntags:\n  - #adr\n  - #alpha\n---\n\nbody\n";
    for (label, text) in [("single", single), ("double", double), ("bare", bare)] {
        assert_eq!(
            frontmatter_feature_tags(text),
            vec!["alpha".to_string()],
            "{label}-quoted feature tag parses to the feature tag only",
        );
    }
    // Multiple feature tags survive, directory tags are dropped, and an
    // empty `#` is not a tag.
    let multi = "---\ntags:\n  - \"#research\"\n  - \"#alpha\"\n  - '#beta'\n---\n";
    assert_eq!(
        frontmatter_feature_tags(multi),
        vec!["alpha".to_string(), "beta".to_string()],
    );
}

#[test]
fn plan_tier_parser_extracts_each_tier_and_none_when_missing_or_invalid() {
    // W01.P01.S04: the plan `tier:` frontmatter key carries one of L1-L4;
    // the parser reads each, and a missing or out-of-enum tier is None.
    for tier in ["L1", "L2", "L3", "L4"] {
        let plan = format!("---\ntags:\n  - '#plan'\n  - '#x'\ntier: {tier}\n---\n\nbody\n");
        assert_eq!(
            frontmatter_plan_tier(&plan).as_deref(),
            Some(tier),
            "extracts the {tier} tier"
        );
    }
    // Quoted value still resolves.
    let quoted = "---\ntags:\n  - '#plan'\ntier: 'L3'\n---\n\nbody\n";
    assert_eq!(frontmatter_plan_tier(quoted).as_deref(), Some("L3"));
    // No tier key → None.
    let no_tier = "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nbody\n";
    assert_eq!(frontmatter_plan_tier(no_tier), None);
    // Out-of-enum tier → None (rejected).
    let bad = "---\ntags:\n  - '#plan'\ntier: L9\n---\n\nbody\n";
    assert_eq!(frontmatter_plan_tier(bad), None);
    // A tier marker outside the frontmatter fence is ignored.
    let outside = "---\ntags:\n  - '#plan'\n---\n\ntier: L2 mentioned in prose\n";
    assert_eq!(frontmatter_plan_tier(outside), None);
}

#[test]
fn rule_species_projects_from_the_rules_tree_with_promoted_from_edges() {
    // graph-node-semantics ADR: rules live OUTSIDE `.vault/` and project as
    // `rule` species nodes (authority law) with a `promoted-from` edge back
    // into the audit that bore them — never minted as vault documents.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    // An audit document the rule will point back to.
    std::fs::create_dir_all(root.join(".vault/audit")).unwrap();
    std::fs::write(
        root.join(".vault/audit/2026-06-14-x-audit.md"),
        "---\ntags:\n  - '#audit'\n  - '#x'\n---\n\n# x audit\n",
    )
    .unwrap();
    // A project rule whose `## Source` names that audit.
    std::fs::create_dir_all(root.join(".vaultspec/rules/rules")).unwrap();
    std::fs::write(
            root.join(".vaultspec/rules/rules/x-rule.md"),
            "---\nname: x-rule\n---\n\n# X rule\n\n## Status\n\nActive.\n\n## Source\n\nAudit `2026-06-14-x-audit`.\n",
        )
        .unwrap();

    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (graph, _) = index_worktree(root, &scope(), &store, 0).unwrap();

    // The rule node exists, is kind Rule, and is active.
    let rule_id = node_id(&CanonicalKey::Rule { slug: "x-rule" });
    let rule = graph.node(&rule_id).expect("rule node projected");
    assert_eq!(rule.kind, NodeKind::Rule);
    assert_eq!(rule.id.0, "rule:x-rule", "rule id is slug-keyed, not doc:");
    assert_eq!(rule.facets[0].lifecycle.as_ref().unwrap().state, "active");

    // A promoted-from edge bridges the rule to the audit document node.
    let audit_id = node_id(&CanonicalKey::Document {
        stem: "2026-06-14-x-audit",
    });
    let bridged = graph
        .edges_of(&rule_id)
        .any(|s| s.edge.src == rule_id && s.edge.dst == audit_id);
    assert!(bridged, "rule -> audit promoted-from edge minted");
}

#[test]
fn type_specific_lifecycle_parses_per_species_with_honest_degradation() {
    // ADR status from the H1 status line.
    let adr = "---\ntags: ['#adr']\n---\n\n# `x` adr: `y` | (**status:** `accepted`)\n";
    assert_eq!(
        doc_lifecycle(Some("adr"), adr).unwrap().state,
        "accepted",
        "ADR status drives the lifecycle"
    );
    let deprecated = "# `x` adr (**status:** `deprecated`)\n";
    assert_eq!(
        doc_lifecycle(Some("adr"), deprecated).unwrap().state,
        "deprecated"
    );

    // Plan tier rides as the state; checkbox progress stays on progress.
    let plan = "---\ntier: L2\n---\n\n- [x] done\n- [ ] todo\n";
    let plan_lc = doc_lifecycle(Some("plan"), plan).unwrap();
    assert_eq!(plan_lc.state, "L2", "plan tier is the lifecycle state");
    assert_eq!(plan_lc.progress.unwrap().done, 1);
    assert_eq!(plan_lc.progress.unwrap().total, 2);

    // Audit worst-finding severity.
    let audit = "# audit\n\n### Finding A (high)\n### Finding B (low)\n";
    assert_eq!(
        doc_lifecycle(Some("audit"), audit).unwrap().state,
        "high",
        "the worst severity present wins"
    );

    // Rule active vs superseded.
    let active_rule = "# rule\n\n## Status\n\nActive.\n";
    assert_eq!(
        doc_lifecycle(Some("rule"), active_rule).unwrap().state,
        "active"
    );
    let superseded = "# rule\n\n## Status\n\nSuperseded by `new-rule`.\n";
    assert_eq!(
        doc_lifecycle(Some("rule"), superseded).unwrap().state,
        "superseded"
    );

    // Honest degradation: an ADR predating the status convention falls back
    // to the generic checkbox lifecycle (or None), never a fabricated state.
    let old_adr = "# an adr with no status line\n\n- [ ] a box\n";
    assert_eq!(
        doc_lifecycle(Some("adr"), old_adr).unwrap().state,
        "active",
        "no status line degrades to the checkbox lifecycle, not a lie"
    );
    let bare_adr = "# an adr with neither status nor checkboxes\n";
    assert!(
        doc_lifecycle(Some("adr"), bare_adr).is_none(),
        "no signal at all is honest absence"
    );
}

fn write_plan(root: &Path, name: &str, body: &str) {
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(root.join(format!(".vault/plan/{name}")), body).unwrap();
}

const PLAN_BODY_OPEN: &str = "\
---
tags:
  - '#plan'
  - '#pc'
tier: L3
---

# `pc` plan

## Wave `W01` - the wave

### Phase `W01.P01` - the phase

- [ ] `W01.P01.S01` - first step; `src/a.rs`.
- [ ] `W01.P01.S02` - second step; `src/b.rs`.
";

#[test]
fn reingesting_a_plan_re_keys_no_existing_step_node_or_edge() {
    // W03.P07.S38: identity survives re-index. Minting the same plan twice
    // (the watcher's partial re-ingest path) must converge to the same
    // node and edge ids — stable keys are plan stem + canonical ids only.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();

    let (g1, _) = index_worktree(root, &scope(), &store, 0).unwrap();
    // Re-ingest into the SAME graph (idempotent partial re-index path) and
    // into a FRESH graph; both must carry the identical container ids/edges.
    let (g2, _) = index_worktree(root, &scope(), &store, 99).unwrap();

    let step1 = node_id(&CanonicalKey::PlanContainer {
        plan_stem: "2026-06-14-pc-plan",
        container_id: "W01/P01/S01",
    });
    assert!(g1.node(&step1).is_some(), "step container minted");
    assert!(g2.node(&step1).is_some(), "same step id on re-index");

    // The wave, phase, and both steps exist with their canonical ids.
    for cid in ["W01", "W01/P01", "W01/P01/S01", "W01/P01/S02"] {
        let id = node_id(&CanonicalKey::PlanContainer {
            plan_stem: "2026-06-14-pc-plan",
            container_id: cid,
        });
        assert!(g1.node(&id).is_some(), "container {cid} minted");
    }

    // The full container node + Contains edge sets are byte-identical
    // across the two independent indexes — no re-keying, no churn.
    let containers = |g: &LinkageGraph| {
        let mut v: Vec<String> = g
            .nodes()
            .filter(|n| n.kind == NodeKind::PlanContainer)
            .map(|n| n.id.0.clone())
            .collect();
        v.sort();
        v
    };
    let contains = |g: &LinkageGraph| {
        let mut v: Vec<String> = g
            .edges()
            .filter(|s| s.edge.relation == RelationKind::Contains)
            .map(|s| s.edge.id.0.clone())
            .collect();
        v.sort();
        v
    };
    assert_eq!(
        containers(&g1),
        containers(&g2),
        "node ids stable across re-index"
    );
    assert_eq!(
        contains(&g1),
        contains(&g2),
        "Contains edge ids stable across re-index"
    );
    assert_eq!(
        contains(&g1).len(),
        4,
        "plan->wave, wave->phase, phase->step x2"
    );
}

#[test]
fn toggling_a_step_checkbox_updates_completion_without_changing_the_step_node_id() {
    // W03.P07.S39: a `- [ ]` -> `- [x]` toggle changes the step's
    // completion facet, never its node id (the id is identity-bearing, the
    // completion lives outside the key).
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let step_id = node_id(&CanonicalKey::PlanContainer {
        plan_stem: "2026-06-14-pc-plan",
        container_id: "W01/P01/S01",
    });

    // Open.
    write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
    let (g_open, _) = index_worktree(root, &scope(), &store, 0).unwrap();
    let open_node = g_open.node(&step_id).expect("step before toggle");
    let open_lc = open_node.facets[0].lifecycle.as_ref().unwrap();
    assert_eq!(open_lc.state, "active", "open step is active");
    assert_eq!(open_lc.progress.unwrap().done, 0);

    // Toggle S01 closed.
    let toggled = PLAN_BODY_OPEN.replace("- [ ] `W01.P01.S01`", "- [x] `W01.P01.S01`");
    write_plan(root, "2026-06-14-pc-plan.md", &toggled);
    let (g_closed, _) = index_worktree(root, &scope(), &store, 1).unwrap();
    let closed_node = g_closed.node(&step_id).expect("step after toggle");

    // Same node id (identity stable), changed completion (signal).
    assert_eq!(open_node.id, closed_node.id, "step node id is unchanged");
    let closed_lc = closed_node.facets[0].lifecycle.as_ref().unwrap();
    assert_eq!(closed_lc.state, "complete", "toggled step is complete");
    assert_eq!(closed_lc.progress.unwrap().done, 1);
}

#[test]
fn step_containers_bind_to_their_exec_records() {
    // W03.P07.S37: a step container binds to its exec-record doc node when
    // one exists, via an identity-only References edge.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
    std::fs::create_dir_all(root.join(".vault/exec/2026-06-14-pc")).unwrap();
    std::fs::write(
        root.join(".vault/exec/2026-06-14-pc/2026-06-14-pc-W01-P01-S01.md"),
        "---\ntags:\n  - '#exec'\n  - '#pc'\n---\n\nexec record body\n",
    )
    .unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (g, _) = index_worktree(root, &scope(), &store, 0).unwrap();

    let step_id = node_id(&CanonicalKey::PlanContainer {
        plan_stem: "2026-06-14-pc-plan",
        container_id: "W01/P01/S01",
    });
    let exec_id = node_id(&CanonicalKey::Document {
        stem: "2026-06-14-pc-W01-P01-S01",
    });
    let bound = g
        .edges_of(&step_id)
        .any(|s| s.edge.relation == RelationKind::References && s.edge.dst == exec_id);
    assert!(bound, "step S01 binds to its exec record");
    // S02 has no exec record — it binds to none.
    let step2 = node_id(&CanonicalKey::PlanContainer {
        plan_stem: "2026-06-14-pc-plan",
        container_id: "W01/P01/S02",
    });
    let unbound = g
        .edges_of(&step2)
        .all(|s| s.edge.relation != RelationKind::References);
    assert!(unbound, "S02 has no exec record, so no binding");
}

#[test]
fn a_step_binds_only_to_its_own_plans_exec_record_not_a_sibling_plans() {
    // Review HIGH-1 regression: two plans share the identical container tail
    // `W01-P01-S01`. A step must bind ONLY to its own plan's exec record,
    // never to a sibling plan's exec record carrying the same tail.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_plan(root, "2026-06-14-pc-plan.md", PLAN_BODY_OPEN);
    write_plan(
        root,
        "2026-06-14-qc-plan.md",
        "---\ntags:\n  - '#plan'\n  - '#qc'\ntier: L3\n---\n\n# `qc` plan\n\n## Wave `W01` - w\n\n### Phase `W01.P01` - p\n\n- [ ] `W01.P01.S01` - first step; `src/a.rs`.\n",
    );
    // Each plan owns its exec record, both with the SAME container tail.
    std::fs::create_dir_all(root.join(".vault/exec/2026-06-14-pc")).unwrap();
    std::fs::write(
        root.join(".vault/exec/2026-06-14-pc/2026-06-14-pc-W01-P01-S01.md"),
        "---\ntags:\n  - '#exec'\n  - '#pc'\n---\n\npc exec\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".vault/exec/2026-06-14-qc")).unwrap();
    std::fs::write(
        root.join(".vault/exec/2026-06-14-qc/2026-06-14-qc-W01-P01-S01.md"),
        "---\ntags:\n  - '#exec'\n  - '#qc'\n---\n\nqc exec\n",
    )
    .unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (g, _) = index_worktree(root, &scope(), &store, 0).unwrap();

    let pc_step = node_id(&CanonicalKey::PlanContainer {
        plan_stem: "2026-06-14-pc-plan",
        container_id: "W01/P01/S01",
    });
    let pc_exec = node_id(&CanonicalKey::Document {
        stem: "2026-06-14-pc-W01-P01-S01",
    });
    let qc_exec = node_id(&CanonicalKey::Document {
        stem: "2026-06-14-qc-W01-P01-S01",
    });
    let refs: Vec<NodeId> = g
        .edges_of(&pc_step)
        .filter(|s| s.edge.relation == RelationKind::References)
        .map(|s| s.edge.dst.clone())
        .collect();
    assert!(
        refs.contains(&pc_exec),
        "pc step binds to its own exec record"
    );
    assert!(
        !refs.contains(&qc_exec),
        "pc step must NOT bind to the sibling qc plan's exec record with the same tail"
    );
}

#[test]
fn ingested_adr_and_plan_carry_honest_status_and_tier_facets() {
    // W01.P03.S15: an ingested ADR carries its real H1 status and a plan
    // carries its frontmatter tier through to the doc node — the exact
    // query-time facets the engine-query filter vocabulary enumerates
    // (statuses/plan_tiers, tested data-driven in engine-query::filter).
    // engine-graph cannot depend on engine-query (that would be circular),
    // so the end-to-end assertion lands on the node facets the vocabulary
    // reads, proving honest extraction from real files through ingest.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
            root.join(".vault/adr/2026-06-14-x-adr.md"),
            "---\ntags:\n  - '#adr'\n  - '#x'\n---\n\n# `x` adr: `topic` | (**status:** `accepted`)\n\nbody\n",
        )
        .unwrap();
    std::fs::write(
            root.join(".vault/plan/2026-06-14-x-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#x'\ntier: L3\n---\n\n- [ ] `S01` - do a thing; `src/a.rs`.\n",
        )
        .unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (graph, _) = index_worktree(root, &scope(), &store, 0).unwrap();

    let adr = graph
        .node(&node_id(&CanonicalKey::Document {
            stem: "2026-06-14-x-adr",
        }))
        .expect("adr node ingested");
    assert_eq!(
        adr.status.as_deref(),
        Some("accepted"),
        "ADR carries its real H1 status"
    );
    assert_eq!(adr.tier, None, "an ADR carries no plan tier");

    let plan = graph
        .node(&node_id(&CanonicalKey::Document {
            stem: "2026-06-14-x-plan",
        }))
        .expect("plan node ingested");
    assert_eq!(plan.tier.as_deref(), Some("L3"), "plan carries its tier");
    assert_eq!(plan.status, None, "a plan carries no ADR status");
}

#[test]
fn declared_tier_degrades_truthfully_while_structural_survives() {
    // A vault-only worktree (no `.vaultspec/`): core's `vault graph`
    // cannot run there, so the declared tier must degrade TRUTHFULLY
    // (`declared_unavailable` set, zero declared edges) while the
    // structural pass — git object DB + working tree, no core — still
    // produces NODES. Regression guard for the wiring that was missing
    // entirely (the graph was silently declared-empty-yet-claimed).
    //
    // STRICT reference-only graph (user ruling, 2026-06-28): in-body
    // `[[wiki-link]]` mentions are NOT graphed — only `related:` frontmatter
    // (declared) defines edges. So a core-less worktree carries doc NODES but
    // ZERO edges (the body mention below is deliberately not ingested), and
    // the only edge source is the now-unavailable declared tier.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-x-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions [[2026-06-12-x-adr]].\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::write(root.join(".vault/adr/2026-06-12-x-adr.md"), "# adr\n").unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (graph, stats) = index_worktree(root, &scope(), &store, 0).unwrap();

    // Structural pass mints document NODES without core; body-mention edges
    // are not graphed (strict reference-only), so the core-less graph is edgeless.
    assert!(
        graph.nodes().count() >= 1,
        "structural pass mints document nodes without core"
    );
    assert_eq!(
        stats.edges, 0,
        "body-mention edges are not graphed (strict reference-only)"
    );
    // Declared tier degrades truthfully — never silently empty-yet-claimed.
    // The `declared_edges == 0` arm is unconditional. The `is_some()` arm
    // depends on a cross-package contract: core's `vault graph` errors in a
    // `.vaultspec`-less dir. If a future core succeeds-empty there instead,
    // this arm needs revisiting (declared would be available-but-empty).
    assert_eq!(
        stats.declared_edges, 0,
        "no declared edges when core cannot graph"
    );
    assert!(
        stats.declared_unavailable.is_some(),
        "declared tier reports its own unavailability"
    );
}

#[test]
fn structural_index_carries_nodes_and_the_building_sentinel_without_a_subprocess() {
    // Perf ADR D1: the fast servable parse builds the structural tier ONLY,
    // never running the declared-tier core subprocess. It must carry the
    // same document NODES index_worktree produces, zero declared edges,
    // and the DECLARED_BUILDING sentinel (the async fold is pending — a
    // truthful "not yet" state, NOT a failure reason).
    //
    // STRICT reference-only graph (user ruling, 2026-06-28): the structural
    // pass no longer graphs in-body `[[wiki-link]]` mentions, so the fast
    // parse carries nodes but ZERO edges until the declared (frontmatter)
    // fold lands.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-x-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions [[2026-06-12-x-adr]].\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::write(root.join(".vault/adr/2026-06-12-x-adr.md"), "# adr\n").unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (graph, stats) = index_worktree_structural(root, &scope(), &store, 0).unwrap();

    assert!(
        graph.nodes().count() >= 1,
        "the structural-only parse mints document nodes"
    );
    assert_eq!(
        stats.edges, 0,
        "body-mention edges are not graphed (strict reference-only)"
    );
    assert_eq!(
        stats.declared_edges, 0,
        "no declared tier in the fast parse"
    );
    assert_eq!(
        stats.declared_unavailable.as_deref(),
        Some(DECLARED_BUILDING),
        "the structural parse reports declared as building, not failed"
    );
}

#[test]
fn cloned_structural_plus_declared_equals_a_combined_build() {
    // Perf ADR D1 convergence invariant: the async fold clones the
    // structural graph and ingests declared into the clone. That folded
    // clone(structural)+declared graph MUST equal a graph built structural
    // THEN declared from the same JSON in one pass — declared ingest is
    // replace-by-id idempotent over the structural graph (D8.2). Proven on
    // the canonical snapshot (no core subprocess: we feed a fixed JSON).
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-x-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions [[2026-06-12-x-adr]].\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::write(root.join(".vault/adr/2026-06-12-x-adr.md"), "# adr\n").unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();

    let declared_json = serde_json::json!({
        "nodes": [
            {"id": "2026-06-12-x-plan", "doc_type": "plan"},
            {"id": "2026-06-12-x-adr", "doc_type": "adr"}
        ],
        "edges": [
            {"source": "2026-06-12-x-plan", "target": "2026-06-12-x-adr", "kind": "related"}
        ]
    })
    .to_string();

    // Path A: structural, then clone and fold declared into the clone.
    let (structural, _) = index_worktree_structural(root, &scope(), &store, 0).unwrap();
    let mut folded = structural.clone();
    ingest_declared_from_json(&mut folded, &declared_json, &scope(), 0);

    // Path B: structural, then declared into the SAME graph in one pass.
    let (mut combined, _) = index_worktree_structural(root, &scope(), &store, 0).unwrap();
    ingest_declared_from_json(&mut combined, &declared_json, &scope(), 0);

    assert_eq!(
        canonical_snapshot(&folded),
        canonical_snapshot(&combined),
        "clone(structural)+declared converges to structural+declared (D8.2)"
    );
    assert!(
        folded.edge_count() > structural.edge_count(),
        "the declared edge actually folded in"
    );
}

#[test]
fn index_documents_are_never_nodes_and_leave_no_incident_edge() {
    // index-node-exclusion ADR D1: a `.vault/index` feature-index document is
    // a metanode. It must never become a graph node, and no edge — structural
    // or declared — incident to it may survive. Both the structural reader and
    // the declared-graph ingest are exercised.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/index")).unwrap();
    std::fs::write(
        root.join(".vault/index/x.index.md"),
        "---\ntags:\n  - '#index'\n  - '#x'\n---\n\nMentions [[2026-06-12-x-plan]].\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    // A real doc whose wiki-link resolves ONTO the index doc — the
    // resolved-but-dangling structural edge the prune must remove.
    std::fs::write(
        root.join(".vault/plan/2026-06-12-x-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nSee [[x.index]].\n",
    )
    .unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (mut graph, _) = index_worktree_structural(root, &scope(), &store, 0).unwrap();

    let index_id = node_id(&CanonicalKey::Document { stem: "x.index" });
    assert!(graph.node(&index_id).is_none(), "index doc is never a node");
    assert!(
        graph
            .nodes()
            .all(|n| n.doc_type.as_deref() != Some("index")),
        "no node carries the index doc_type"
    );
    assert!(
        graph
            .edges()
            .all(|e| e.edge.src != index_id && e.edge.dst != index_id),
        "no structural edge incident to the index doc survives"
    );

    // Declared path: core's authored graph references the index node; every
    // edge to/from it must be dropped at ingest, minting no node.
    let declared_json = serde_json::json!({
        "nodes": [
            {"id": "2026-06-12-x-plan", "doc_type": "plan"},
            {"id": "x.index", "doc_type": "index"}
        ],
        "edges": [
            {"source": "x.index", "target": "2026-06-12-x-plan", "kind": "related"}
        ]
    })
    .to_string();
    let (count, err) = ingest_declared_from_json(&mut graph, &declared_json, &scope(), 0);
    assert!(err.is_none(), "declared ingest parses");
    assert_eq!(
        count, 0,
        "the only declared edge is index-incident and dropped"
    );
    assert!(
        graph.node(&index_id).is_none(),
        "declared ingest mints no index node"
    );
    assert!(
        graph
            .edges()
            .all(|e| e.edge.src != index_id && e.edge.dst != index_id),
        "no declared edge incident to the index doc survives"
    );
}

#[test]
fn core_derived_similarity_edges_are_never_ingested_into_the_graph() {
    // Read-and-infer exclusion: core's `derived_edges` (computed co-citation /
    // similarity correlations) are NOT references and must NEVER enter the
    // served graph — only authored declared `edges` do. This guards the ingest
    // gate so a future change cannot silently re-admit the ~90% similarity
    // edge contamination the dashboard graph exists to exclude.
    let mut graph = LinkageGraph::new();
    let declared_json = serde_json::json!({
        "nodes": [
            {"id": "doc-a", "doc_type": "adr"},
            {"id": "doc-b", "doc_type": "plan"},
            {"id": "doc-c", "doc_type": "research"}
        ],
        // ONE authored reference (declared) — this MUST be ingested.
        "edges": [
            {"source": "doc-a", "target": "doc-b", "kind": "related"}
        ],
        // Computed similarity edges — these MUST be excluded.
        "derived_edges": [
            {"source": "doc-a", "target": "doc-c", "kind": "co_citation"},
            {"source": "doc-b", "target": "doc-c", "kind": "similarity"}
        ]
    })
    .to_string();

    let (count, err) = ingest_declared_from_json(&mut graph, &declared_json, &scope(), 0);
    assert!(err.is_none(), "payload parses");
    assert_eq!(
        count, 1,
        "only the one authored declared reference is ingested"
    );
    assert_eq!(
        graph.edge_count(),
        1,
        "the graph holds exactly the one reference edge"
    );
    assert!(
        graph
            .edges()
            .all(|e| e.edge.relation != RelationKind::CoreDerived),
        "no core-derived (computed similarity) edge enters the graph"
    );
    assert!(
        graph
            .edges()
            .any(|e| e.edge.relation == RelationKind::References),
        "the authored reference edge is present"
    );
}

#[test]
fn in_body_wikilink_mentions_are_never_graphed_strict_reference_only() {
    // STRICT reference-only graph (user ruling, 2026-06-28): in-body
    // `[[wiki-link]]` mentions are FORBIDDEN as graph fact — wiki-links live
    // only in `related:` frontmatter, which (via the declared tier) IS the
    // node graph. A document whose BODY mentions another document must NOT mint
    // a structural `mentions` edge. Guards the document-indexing drop so a
    // future change cannot silently re-admit body-mention edges.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    // The body carries a resolvable wiki-link to a real sibling document.
    std::fs::write(
        root.join(".vault/plan/2026-06-12-m-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#m'\n---\n\nBody mentions [[2026-06-12-m-adr]].\n",
    )
    .unwrap();
    std::fs::write(root.join(".vault/adr/2026-06-12-m-adr.md"), "# adr\n").unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();
    let (graph, stats) = index_worktree_structural(root, &scope(), &store, 0).unwrap();

    // Both documents become NODES, but the body mention mints NO edge.
    assert!(
        graph.nodes().count() >= 2,
        "both documents are nodes in the structural graph"
    );
    assert_eq!(
        stats.edges, 0,
        "the body wiki-link mints no structural edge"
    );
    assert!(
        graph
            .edges()
            .all(|e| e.edge.relation != RelationKind::Mentions),
        "no in-body `mentions` edge enters the graph"
    );
}

#[test]
fn full_index_equals_structural_plus_declared_from_json_d8_2() {
    // Review LOW (perf ADR D1, D8.2 lock): the async fold's serve path is
    // `index_worktree_structural` + `ingest_declared_from_json`. Tie it back
    // to the SYNCHRONOUS full `index_worktree` (the CLI / re-derivability
    // path): for the SAME declared input and observed_at, the full path's
    // graph must be byte-identical to structural + the same declared JSON.
    //
    // The full path's declared phase IS `ingest_core_graph` =
    // `fetch_core_graph_json` + `ingest_declared_from_json`. In this
    // `.vaultspec`-less dir core cannot graph, so the full path ingests an
    // EMPTY declared tier; feeding that SAME empty declared into the fold
    // path must therefore yield the identical graph. Ingesting a non-empty
    // fixed JSON into BOTH the full result and the structural base then
    // proves the seams stay identical past the empty case — locking that the
    // fold path and the full path share one declared-ingest function.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/plan")).unwrap();
    std::fs::write(
        root.join(".vault/plan/2026-06-12-x-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nMentions [[2026-06-12-x-adr]].\n",
    )
    .unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    std::fs::write(root.join(".vault/adr/2026-06-12-x-adr.md"), "# adr\n").unwrap();
    let store = engine_store::Store::open(&root.join(".vault")).unwrap();

    // The full synchronous path (structural + declared-from-core). Core is
    // unavailable here, so declared is empty and `full` == structural-only.
    let (full, full_stats) = index_worktree(root, &scope(), &store, 7).unwrap();
    assert_eq!(
        full_stats.declared_edges, 0,
        "core unavailable: the full path's declared tier is empty here"
    );
    // The fold's base: structural-only at the SAME observed_at.
    let (structural, _) = index_worktree_structural(root, &scope(), &store, 7).unwrap();
    assert_eq!(
        canonical_snapshot(&full),
        canonical_snapshot(&structural),
        "full(structural+empty-declared) == structural base of the fold path"
    );

    // Past the empty case: ingest the SAME fixed declared JSON into both the
    // full-path result and the structural base via the shared seam. The two
    // must stay byte-identical — the fold path and the full path converge.
    let declared_json = serde_json::json!({
        "nodes": [
            {"id": "2026-06-12-x-plan", "doc_type": "plan"},
            {"id": "2026-06-12-x-adr", "doc_type": "adr"}
        ],
        "edges": [
            {"source": "2026-06-12-x-plan", "target": "2026-06-12-x-adr", "kind": "related"}
        ]
    })
    .to_string();
    let mut full_plus = full;
    let mut fold_path = structural;
    let structural_edge_count = fold_path.edge_count();
    ingest_declared_from_json(&mut full_plus, &declared_json, &scope(), 7);
    ingest_declared_from_json(&mut fold_path, &declared_json, &scope(), 7);
    assert_eq!(
        canonical_snapshot(&full_plus),
        canonical_snapshot(&fold_path),
        "full + declared(JSON) == structural + declared(JSON): the fold path \
             converges to the synchronous full path (D8.2)"
    );
    assert!(
        fold_path.edge_count() > structural_edge_count,
        "the fixed declared edge actually ingested on both sides"
    );
}
