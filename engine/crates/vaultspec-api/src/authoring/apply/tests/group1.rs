//! Apply test group (module-decomposition). See ./helpers.rs.

use super::helpers::*;
use super::helpers2::*;

#[test]
fn edit_frontmatter_tags_order_is_preserved_by_the_real_core_write() {
    // P03-review follow-on: `frontmatter_fields_match` compares list fields
    // as ORDERED `Vec` equality. Source inspection of vaultspec-core's
    // `_serialise_block_list`/`resolve_related_inputs` confirmed order is
    // preserved (never sorted/deduped-out-of-order), but that was never
    // exercised against the REAL binary — this falsifier closes the gap.
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    let doc_path = ".vault/plan/apply-tags-order-live-demo.md";
    let doc_file = root.join(doc_path);
    std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
    // A conformant vault frontmatter (one directory tag, one feature tag, a
    // date) — core refuses a non-conformant write outright, so the fixture
    // must already satisfy its own hygiene checks. `date` is untouched by
    // this `--tags`-only edit, so it must already be valid.
    std::fs::write(
        &doc_file,
        "---\ntags:\n  - '#plan'\n  - '#zz-test-feature'\ndate: '2026-01-01'\n---\n\nbody\n",
    )
    .unwrap();
    scaffold_vaultspec_workspace(&root);
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "tags order fixture"]);

    // Reversed from the directory-then-feature convention above, so a real
    // reorder (e.g. a canonicalizing sort) would be caught.
    let ordered_tags = vec!["#zz-test-feature".to_string(), "#plan".to_string()];
    let invocation = CoreInvocation::write(
        CoreCapability::SetFrontmatter,
        doc_path,
        WriteArgs {
            tags: ordered_tags.clone(),
            ..Default::default()
        },
    )
    .unwrap();
    let adapter = CoreAdapter::detect();
    let envelope = adapter.invoke(&root, &invocation).unwrap();
    assert!(envelope.is_success(), "{:?}", envelope.raw);

    let saved = std::fs::read_to_string(&doc_file).unwrap();
    // The real core write must preserve the REQUESTED order, never sort or
    // otherwise reorder it.
    let positions: Vec<usize> = ordered_tags
        .iter()
        .map(|tag| {
            saved
                .find(tag.as_str())
                .unwrap_or_else(|| panic!("tag `{tag}` missing from: {saved}"))
        })
        .collect();
    assert!(
        positions.windows(2).all(|pair| pair[0] < pair[1]),
        "tags must appear in the REQUESTED order in the real written file: {saved}"
    );

    // The kind-gated post-verify's ordered-Vec-equality comparison must
    // recognize the exact ordering the real core wrote.
    let fields = crate::authoring::api::FrontmatterEditFields {
        date: None,
        tags: Some(ordered_tags),
        related: None,
    };
    assert!(
        crate::authoring::operations::frontmatter_fields_match(&saved, &fields),
        "post-verify must recognize the real core's tags ordering: {saved}"
    );
}

#[test]
fn edit_frontmatter_a_mismatched_or_not_landed_write_fails_closed() {
    // P03-review follow-on: the `false → Failed` direction of the semantic
    // post-verify was structurally guaranteed but never directly exercised
    // for frontmatter. Pin it at the `frontmatter_fields_match` unit level
    // (mismatch → false) alongside the tolerant-quoting positive case
    // (→ true), so the fail-closed property is locked independent of any
    // subprocess timing.
    let matching = "---\ntags:\n  - '#plan'\ndate: \"2026-02-06\"\n---\n\nbody\n";
    let mismatched = "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nbody\n";
    let not_landed_at_all = "---\ntags:\n  - '#plan'\n---\n\nbody\n";
    let fields = crate::authoring::api::FrontmatterEditFields {
        date: Some("2026-02-06".to_string()),
        tags: None,
        related: None,
    };

    assert!(
        crate::authoring::operations::frontmatter_fields_match(matching, &fields),
        "a double-quoted value core might write must still compare equal (tolerant quoting)"
    );
    assert!(
        !crate::authoring::operations::frontmatter_fields_match(mismatched, &fields),
        "a stale/unrelated value must NOT be recognized as landed (fail-closed)"
    );
    assert!(
        !crate::authoring::operations::frontmatter_fields_match(not_landed_at_all, &fields),
        "an absent field must NOT be recognized as landed (fail-closed)"
    );
}

#[test]
fn rename_apply_against_the_real_core_is_recognized_applied() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_rename();
    let applier = fx.applier.clone();
    let adapter = CoreAdapter::detect();
    let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:rn:live:1", 100);
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied rename changeset yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert!(
        !receipt.child.resolved_via_post_verify,
        "a clean success completes via the envelope, never the recovery path"
    );
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    assert!(
        !fx.doc_file.exists(),
        "the REAL vaultspec-core rename moved the document away from the old path"
    );
    assert!(
        fx.root.join(LIVE_RENAME_RENAMED_DOC_PATH).exists(),
        "the REAL vaultspec-core rename landed the document at the new path"
    );
}

#[test]
fn rename_indeterminate_kill_after_a_real_landed_rename_is_recognized_applied() {
    // THE R1 pattern applied to Rename: core is core-authoritative over BOTH
    // the write and the path move — the recorded `DocumentRef` the OLD
    // preview-hash-shaped verify would check carries the OLD (now-stale)
    // path. Semantic post-verify (re-resolve by stem) must recognize a REAL,
    // landed rename regardless.
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_rename();
    let applier = fx.applier.clone();
    let adapter = landing_rename_timeout_adapter(LIVE_RENAME_DOC_PATH, LIVE_RENAME_NEW_STEM);
    let outcome = apply(
        &mut fx,
        &adapter,
        &applier,
        "idem:apply:rn:live:kill:1",
        100,
    );
    let receipt = outcome
        .receipt
        .expect("an indeterminate kill still resolves to a terminal receipt");
    assert_eq!(
        receipt.state,
        ApplyState::Applied,
        "the REAL landed rename must be recognized Applied via semantic post-verify: \
         {receipt:?}"
    );
    assert!(receipt.child.resolved_via_post_verify);
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    assert!(!fx.doc_file.exists());
    assert!(fx.root.join(LIVE_RENAME_RENAMED_DOC_PATH).exists());
}

#[test]
fn section_edit_apply_against_the_real_core_is_recognized_applied() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_section_edit();
    let applier = fx.applier.clone();
    let adapter = CoreAdapter::detect();
    let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:se:live:1", 100);
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied section-edit changeset yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert!(
        !receipt.child.resolved_via_post_verify,
        "a clean success completes via the envelope, never the recovery path"
    );
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
    assert!(
        saved.contains("BETA REWRITTEN LIVE"),
        "the REAL vaultspec-core set-body write landed the spliced section: {saved}"
    );
    assert!(
        saved.contains("## Alpha") && saved.contains("alpha body"),
        "the untouched Alpha section survives the splice unchanged: {saved}"
    );
    assert!(
        !saved.contains("beta body"),
        "the OLD Beta content is gone: {saved}"
    );
}

#[test]
fn section_edit_indeterminate_kill_after_a_real_landed_write_is_recognized_applied() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_section_edit();
    let applier = fx.applier.clone();
    let spliced_body = LIVE_SECTION_EDIT_BASE_BODY
        .replace(LIVE_SECTION_EDIT_BETA_SECTION, LIVE_SECTION_EDIT_NEW_BETA);
    let adapter = landing_section_edit_timeout_adapter(&fx.root, &spliced_body);
    let outcome = apply(
        &mut fx,
        &adapter,
        &applier,
        "idem:apply:se:live:kill:1",
        100,
    );
    let receipt = outcome
        .receipt
        .expect("an indeterminate kill still resolves to a terminal receipt");
    assert_eq!(
        receipt.state,
        ApplyState::Applied,
        "the REAL landed section-edit write must be recognized Applied via \
         ExactBlobHash post-verify, exactly like ReplaceBody: {receipt:?}"
    );
    assert!(receipt.child.resolved_via_post_verify);
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
    assert!(saved.contains("BETA REWRITTEN LIVE"));
}

#[test]
fn create_document_apply_against_the_real_core_is_recognized_applied() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_create();
    let applier = fx.applier.clone();
    let adapter = CoreAdapter::detect();
    let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:cr:live:1", 100);
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied create changeset yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert!(
        !receipt.child.resolved_via_post_verify,
        "a clean success completes via the envelope, never the recovery path"
    );
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    assert!(
        fx.doc_file.exists(),
        "the REAL vaultspec-core `vault add` scaffolded the document"
    );
    // W03.P09a: the receipt echoes the created document's REAL identity
    // (previously always empty/None for a create) — never re-derived
    // client-side, no client-predictable filename guess needed.
    assert_eq!(receipt.child.document_path, LIVE_CREATE_DOC_PATH);
    assert_eq!(receipt.child.result_stem.as_deref(), Some(LIVE_CREATE_STEM));
    assert_eq!(
        receipt.child.result_node_id.as_deref(),
        Some(format!("doc:{LIVE_CREATE_STEM}").as_str())
    );
}

#[test]
fn create_document_indeterminate_kill_after_a_real_landed_create_is_recognized_applied() {
    // THE R1 pattern applied to CreateDocument: core is core-authoritative
    // over the ENTIRE scaffold (a doc-type template this engine cannot
    // predict) — there is no preview hash to compare, and a bare
    // "something now exists at the target stem" check would be exactly
    // the stem-identity-aliasing bug class the Rename rollback lineage
    // guard closes. The identity-bearing `CreatedAt` verify (a
    // DETERMINISTIC predicted path fixed at materialize time, plus a
    // frontmatter feature-tag re-read) must recognize a REAL, landed
    // `vault add` regardless of the reclaim recomputing everything from
    // the SAME durable `materialized_operation`.
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_create();
    let applier = fx.applier.clone();
    let adapter = landing_create_timeout_adapter(
        LIVE_CREATE_DOC_TYPE,
        LIVE_CREATE_FEATURE,
        "Apply Live Create Demo",
        LIVE_CREATE_DATE,
    );
    let outcome = apply(
        &mut fx,
        &adapter,
        &applier,
        "idem:apply:cr:live:kill:1",
        100,
    );
    let receipt = outcome
        .receipt
        .expect("an indeterminate kill still resolves to a terminal receipt");
    assert_eq!(
        receipt.state,
        ApplyState::Applied,
        "the REAL landed create must be recognized Applied via the identity-bearing \
         post-verify: {receipt:?}"
    );
    assert!(receipt.child.resolved_via_post_verify);
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    assert!(fx.doc_file.exists());
    // W03.P09a: the crash-recovery/reclaim path resolves the SAME real
    // identity `resolve_outcome`'s happy path does (via the SAME
    // `resolve_created_document` helper) — not just "recognized
    // Applied" but the receipt actually echoes it.
    assert_eq!(receipt.child.document_path, LIVE_CREATE_DOC_PATH);
    assert_eq!(receipt.child.result_stem.as_deref(), Some(LIVE_CREATE_STEM));
    assert_eq!(
        receipt.child.result_node_id.as_deref(),
        Some(format!("doc:{LIVE_CREATE_STEM}").as_str())
    );
}

#[test]
fn edit_frontmatter_apply_against_the_real_core_is_recognized_applied() {
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_frontmatter();
    let applier = fx.applier.clone();
    let adapter = CoreAdapter::detect();
    let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:fm:live:1", 100);
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied frontmatter changeset yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied, "{receipt:?}");
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert!(
        !receipt.child.resolved_via_post_verify,
        "a clean success completes via the envelope, never the recovery path"
    );
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
    assert!(
        saved.contains(LIVE_FRONTMATTER_NEW_DATE),
        "the REAL vaultspec-core set-frontmatter write landed the requested date: {saved}"
    );
}

#[test]
fn edit_frontmatter_indeterminate_kill_after_a_real_landed_write_is_recognized_applied() {
    // THE R1 falsifier: core is AUTHORITATIVE over an EditFrontmatter write's
    // exact bytes (it computes its own serialization from typed flags, never
    // receiving the Rust-side preview text). A preview-hash post-verify would
    // spuriously report this REAL, landed write as "did NOT land" because
    // core's real bytes need not match the preview's byte-for-byte guess.
    // The semantic post-verify (`operations::frontmatter_fields_match`) must
    // recognize it Applied regardless.
    let _guard = REAL_CORE_TEST_LOCK.lock().unwrap();
    let mut fx = setup_live_frontmatter();
    let applier = fx.applier.clone();
    let adapter =
        landing_frontmatter_timeout_adapter(LIVE_FRONTMATTER_DOC_PATH, LIVE_FRONTMATTER_NEW_DATE);
    let outcome = apply(
        &mut fx,
        &adapter,
        &applier,
        "idem:apply:fm:live:kill:1",
        100,
    );
    let receipt = outcome
        .receipt
        .expect("an indeterminate kill still resolves to a terminal receipt");
    assert_eq!(
        receipt.state,
        ApplyState::Applied,
        "the REAL landed frontmatter write must be recognized Applied via semantic \
         post-verify, not a preview-hash mismatch: {receipt:?}"
    );
    assert!(receipt.child.resolved_via_post_verify);
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    let saved = std::fs::read_to_string(&fx.doc_file).unwrap();
    assert!(
        saved.contains(LIVE_FRONTMATTER_NEW_DATE),
        "the real core write is actually on disk: {saved}"
    );
}

#[test]
fn a_live_lease_fences_a_stale_presented_token_but_admits_the_current_one() {
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    // A DIFFERENT active actor holds a live lease on the target document's scope.
    let holder = actor("human:reviewer", ActorKind::Human);
    let token = seed_lease(&mut fx, &holder, 90).fencing_token;
    assert!(token >= 1, "a fresh lease issues a monotonic token");

    // A PRESENTED token that is not the scope's current one is fenced out (P26
    // monotonicity), and the ledger does not advance.
    let stale = apply_with_token(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:stale",
        100,
        Some(token + 5),
    );
    assert!(
        !stale.eligibility.allowed,
        "a stale presented token is fenced out"
    );
    assert!(stale.receipt.is_none());
    assert!(
        stale
            .eligibility
            .reason
            .as_ref()
            .is_some_and(|reason| reason.contains("fencing token")),
        "the denial names the fencing token: {:?}",
        stale.eligibility.reason
    );
    assert_eq!(
        ledger_status(&mut fx),
        ChangesetStatus::Approved,
        "the fenced apply left the ledger untouched"
    );

    // Presenting the CURRENT token proceeds — a holder's current token finalizes.
    let ok = apply_with_token(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:token",
        101,
        Some(token),
    );
    assert!(ok.eligibility.allowed, "{:?}", ok.eligibility.reason);
    assert_eq!(
        ok.receipt
            .expect("the fenced-through apply records a receipt")
            .state,
        ApplyState::Applied
    );
}

#[test]
fn an_absent_token_under_a_live_lease_proceeds() {
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    // A different active actor holds a live lease, but the applier presents NO token.
    let holder = actor("human:reviewer", ActorKind::Human);
    let _token = seed_lease(&mut fx, &holder, 90).fencing_token;

    // ADVISORY: an absent token is a non-participant — the apply PROCEEDS. Leases never
    // gate correctness; the revision check is the anti-stale-write floor. Denying it
    // would strand every approved apply (system / direct-write / execute present none).
    let outcome = apply_with_token(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:absent",
        100,
        None,
    );
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    assert_eq!(
        outcome
            .receipt
            .expect("the unfenced apply records a receipt")
            .state,
        ApplyState::Applied
    );
}

#[test]
fn an_apply_with_no_live_lease_proceeds_unfenced() {
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    // No lease on the scope: advisory fencing requires none, so a tokenless apply lands.
    let outcome = apply_with_token(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:nolease",
        100,
        None,
    );
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    assert_eq!(
        outcome
            .receipt
            .expect("an unfenced apply records a receipt")
            .state,
        ApplyState::Applied
    );
}

#[test]
fn an_out_of_band_edit_conflicts_and_refuses_the_apply_as_a_value() {
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    // An out-of-band edit changes the target document since the proposal was drafted:
    // its base is now stale (and the new content is NOT the proposal's result). The
    // apply preflight consults the conflict detector and REFUSES as a denial VALUE (no
    // receipt), never clobbering the out-of-band change. No lease bypasses this — the
    // revision check is the correctness floor.
    std::fs::write(
        &fx.doc_file,
        "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\n---\n\n# apply demo\n\nsomeone else edited this\n",
    )
    .unwrap();

    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:conflict",
        100,
    );
    assert!(
        !outcome.eligibility.allowed,
        "a stale base refuses the apply as a value"
    );
    assert!(
        outcome.receipt.is_none(),
        "a preflight conflict denial carries no receipt (the core never ran)"
    );
    assert!(
        outcome.eligibility.reason.is_some(),
        "the denial carries the conflict reason"
    );
    assert_eq!(
        ledger_status(&mut fx),
        ChangesetStatus::Approved,
        "the refused apply left the ledger untouched"
    );
}

// --- S177 matrix -------------------------------------------------------

#[test]
fn approved_changeset_materializes_once_and_records_an_applied_receipt() {
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100,
    );
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied changeset yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied);
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert_eq!(receipt.child.core_status.as_deref(), Some("updated"));
    assert_eq!(
        receipt.child.core_schema.as_deref(),
        Some("vaultspec.vault.write.v1"),
        "the envelope schema string is recorded for drift forensics"
    );
    assert_eq!(receipt.child.base_blob_hash.len(), 40, "git blob oid");
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);
    let events = outbox_events(&mut fx);
    // The apply stage publishes its two transitions in order. (The review setup that
    // reached Approved first published `approval.requested` + `approval.resolved`;
    // this assertion scopes to the apply-domain kinds so it stays focused on the apply
    // ordering rather than the full upstream lifecycle.)
    assert_eq!(
        events
            .iter()
            .map(|event| event.event_kind.as_str())
            .filter(|kind| kind.starts_with("apply."))
            .collect::<Vec<_>>(),
        vec!["apply.started".to_string(), "apply.recorded".to_string()]
    );
    for event in events {
        let payload = serde_json::to_string(&event.payload).unwrap();
        assert!(
            !payload.contains("token")
                && !payload.contains("debug")
                && !payload.contains("chunk")
                && !payload.contains("generation"),
            "durable lifecycle payload must not carry transient stream data: {payload}"
        );
    }
}

#[test]
fn unapproved_changeset_is_denied_with_no_receipt() {
    let mut fx = setup(false); // stops at NeedsReview
    let applier = fx.applier.clone();
    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100,
    );
    assert!(!outcome.eligibility.allowed);
    assert!(
        outcome.receipt.is_none(),
        "a denied apply records no receipt"
    );
    assert_ne!(ledger_status(&mut fx), ChangesetStatus::Applied);
}

#[test]
fn an_agent_cannot_apply_the_proposal_it_originated() {
    let mut fx = setup(true);
    let origin = fx.origin.clone(); // the proposing agent
    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &origin,
        "idem:apply:1",
        100,
    );
    assert!(!outcome.eligibility.allowed, "self-apply must be denied");
    assert!(
        outcome
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("its own proposal")),
        "reason: {:?}",
        outcome.eligibility.reason
    );
    assert!(outcome.receipt.is_none());
    assert_ne!(ledger_status(&mut fx), ChangesetStatus::Applied);
}

#[test]
fn a_multi_child_changeset_is_refused_with_a_capability_limit() {
    // A 2-child changeset (schema stays multi-doc) is refused before any
    // materialization — V1 apply is single-child.
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let mut store = Store::open(&root.join(".vault")).unwrap();
    let changeset_id = ChangesetId::new("changeset_multi").unwrap();
    let proposal_id = ProposalId::new("proposal_multi").unwrap();
    let author = actor("agent:author", ActorKind::Agent);
    let applier = actor("human:applier", ActorKind::Human);
    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:applier", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            let record = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: None,
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::Draft,
                session_id: None,
                actor: author.clone(),
                summary: "multi".to_string(),
                children: vec![
                    plain_child("child_a", ".vault/plan/a.md"),
                    plain_child("child_b", ".vault/plan/b.md"),
                ],
                created_at_ms: 10,
            })
            .unwrap();
            uow.ledger().append_revision(&record)?;
            Ok(())
        })
        .unwrap();

    let key = IdempotencyKey::new("idem:apply:multi").unwrap();
    let outcome = apply_changeset(
        &mut store,
        &envelope_adapter("updated"),
        &root,
        ApplyRequest {
            changeset_id: &changeset_id,
            proposal_id: &proposal_id,
            actor: &applier,
            idempotency_key: &key,
            fencing_token: None,
            now_ms: 100,
        },
    )
    .unwrap();
    assert!(!outcome.eligibility.allowed);
    assert!(
        outcome
            .eligibility
            .reason
            .as_deref()
            .is_some_and(|reason| reason.contains("exactly one child")),
        "reason: {:?}",
        outcome.eligibility.reason
    );
    assert!(outcome.receipt.is_none());
}

#[test]
fn a_stale_approval_is_denied() {
    let mut fx = setup(true);
    // Mark the closed approval stale (a later edit invalidated it). Apply must
    // refuse a stale approval even while the head is still Approved.
    let proposal_id = fx.proposal_id.clone();
    fx.store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let mut approval = uow.approvals().latest_for_proposal(&proposal_id)?.unwrap();
            approval.stale = true;
            uow.approvals().store_record(&approval)?;
            Ok(())
        })
        .unwrap();
    let applier = fx.applier.clone();
    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100,
    );
    assert!(
        !outcome.eligibility.allowed,
        "stale approval must be denied"
    );
    assert!(outcome.receipt.is_none());
    assert_ne!(ledger_status(&mut fx), ChangesetStatus::Applied);
}

#[test]
fn a_business_refusal_records_a_failed_receipt() {
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    // The core returns a status:"failed" refusal (e.g. a base-revision conflict).
    let outcome = apply(
        &mut fx,
        &envelope_adapter("failed"),
        &applier,
        "idem:apply:1",
        100,
    );
    assert!(
        outcome.eligibility.allowed,
        "the command ran; the core refused"
    );
    let receipt = outcome.receipt.unwrap();
    assert_eq!(receipt.state, ApplyState::Failed);
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Failed);
    assert_eq!(receipt.child.core_status.as_deref(), Some("failed"));
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Failed);
}

#[test]
fn an_indeterminate_kill_whose_write_landed_is_recorded_applied() {
    let mut fx = setup(true);
    // Simulate "the killed core (or its surviving grandchild) DID finish the write":
    // the adapter lands the materialized content DURING the invoke, then is killed —
    // so the preflight (which runs first) sees the intact base, not a stale one.
    let applier = fx.applier.clone();
    let adapter = landing_timeout_adapter(&fx.root);
    let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:1", 100);
    let receipt = outcome.receipt.unwrap();
    assert_eq!(
        receipt.state,
        ApplyState::Applied,
        "post-state re-verify must confirm the landed write"
    );
    assert!(receipt.child.resolved_via_post_verify);
    assert_eq!(
        receipt.child.observed_result_blob_hash.as_deref(),
        Some(fx.expected_result_blob_hash.as_str())
    );
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);
}

#[test]
fn an_indeterminate_kill_whose_write_did_not_land_is_recorded_failed() {
    let mut fx = setup(true);
    // The file still holds the BASE content — the write did not land.
    let applier = fx.applier.clone();
    let outcome = apply(&mut fx, &timeout_adapter(), &applier, "idem:apply:1", 100);
    let receipt = outcome.receipt.unwrap();
    assert_eq!(receipt.state, ApplyState::Failed);
    assert!(receipt.child.resolved_via_post_verify);
    assert_ne!(
        receipt.child.observed_result_blob_hash.as_deref(),
        Some(fx.expected_result_blob_hash.as_str())
    );
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Failed);
}

#[test]
fn an_indeterminate_kill_with_unreadable_post_state_fails_closed() {
    let mut fx = setup(true);
    // The document is removed DURING the invoke (then the core is killed), so the
    // post-state cannot be read: never forge Applied. The preflight ran first against
    // the intact base, so this is a genuine fail-closed, not a pre-apply anchor drift.
    let applier = fx.applier.clone();
    let adapter = removing_timeout_adapter();
    let outcome = apply(&mut fx, &adapter, &applier, "idem:apply:1", 100);
    let receipt = outcome.receipt.unwrap();
    assert_eq!(
        receipt.state,
        ApplyState::Failed,
        "unverifiable post-state must fail closed, never Applied"
    );
    assert!(receipt.child.observed_result_blob_hash.is_none());
}

#[test]
fn a_retry_of_the_same_apply_replays_the_recorded_receipt() {
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    let first = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100,
    );
    assert!(!first.replayed);
    let first_receipt = first.receipt.unwrap();

    // A second call with the SAME key replays the recorded receipt verbatim —
    // never a second materialization (status is already Applied).
    let replay = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        101,
    );
    assert!(replay.replayed, "the retry replays");
    let replay_receipt = replay.receipt.unwrap();
    assert_eq!(
        replay_receipt.result_revision,
        first_receipt.result_revision
    );
    assert_eq!(replay_receipt.applied_at_ms, first_receipt.applied_at_ms);
}

#[test]
fn a_crashed_in_flight_attempt_is_reported_in_flight_on_retry() {
    // Restart recovery: an attempt reserved + appended Applying but never
    // recorded an outcome (process died mid-materialize). A retry with the same
    // key continues the SAME in-flight attempt — it does not re-apply.
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    let changeset_id = fx.changeset_id.clone();
    let key = IdempotencyKey::new("idem:apply:1").unwrap();

    fx.store
        .with_unit_of_work(CommandKind::RequestApply, |uow| {
            let latest = uow.ledger().latest(&changeset_id)?.unwrap();
            let source_revision = latest.changeset_revision.clone();
            let key_scope =
                IdempotencyKeyScope::new(applier.clone(), CommandKind::RequestApply, key.clone());
            let scope = apply_scope(&changeset_id);
            let request_digest = apply_request_digest(&changeset_id, &applier);
            let receipt_id = receipt_id_for(&changeset_id, &source_revision);
            uow.idempotency().reserve_in_flight(
                key_scope,
                scope,
                request_digest,
                receipt_id,
                50,
                Some(50 + IN_FLIGHT_TTL_MS),
            )?;
            Ok(())
        })
        .unwrap();

    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100,
    );
    assert!(
        outcome.in_flight,
        "a live prior attempt continues, not re-applies"
    );
    assert!(outcome.receipt.is_none());
    assert!(!outcome.replayed);
}

#[test]
fn an_expired_wedged_applying_reservation_is_reclaimed_to_a_terminal_receipt() {
    // P36-R1 falsifier: a crash between stage A (reservation + Applying) and
    // stage C wedges the changeset in Applying. Within the TTL a retry reports
    // in_flight; PAST the TTL the reclaim path must RESUME COMPLETION to an
    // honest terminal receipt (Applied here — the write had landed), never a
    // permanent wedge or a forever-ghost poll.
    let mut fx = setup(true);
    let applier = fx.applier.clone();
    let key = IdempotencyKey::new("idem:apply:1").unwrap();
    let changeset_id = fx.changeset_id.clone();
    let proposal_id = fx.proposal_id.clone();

    // Stage A ONLY (simulate a crash before completion): reserve + append
    // Applying, then drop the prep without running stage C.
    let pf = fx
        .store
        .with_unit_of_work(CommandKind::RequestApply, |uow| {
            preflight_in_uow(
                uow,
                &fx.root,
                &ApplyRequest {
                    changeset_id: &changeset_id,
                    proposal_id: &proposal_id,
                    actor: &applier,
                    idempotency_key: &key,
                    fencing_token: None,
                    now_ms: 100,
                },
            )
        })
        .unwrap()
        .unwrap();
    assert!(
        matches!(pf, Preflight::Proceed(_)),
        "stage A reserves + appends Applying"
    );
    drop(pf); // the process dies here — no stage C.
    assert_eq!(
        ledger_status(&mut fx),
        ChangesetStatus::Applying,
        "the changeset is wedged in Applying"
    );

    // Within the TTL a retry is a ghost poll (in_flight), not yet a heal.
    let within = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100 + 1_000,
    );
    assert!(
        within.in_flight,
        "within the TTL the attempt is presumed live"
    );
    assert!(within.receipt.is_none());
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applying);

    // The killed core HAD landed the write (post-state = materialized content).
    std::fs::write(&fx.doc_file, NEW_BODY).unwrap();

    // Past the TTL: reclaim RESUMES COMPLETION to a terminal receipt — the core
    // is NOT re-invoked (the passed adapter would fail; it must never be called).
    let reclaimed = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100 + IN_FLIGHT_TTL_MS + 1,
    );
    assert!(
        !reclaimed.in_flight,
        "past the TTL the wedge is healed, never a permanent ghost"
    );
    let receipt = reclaimed
        .receipt
        .expect("reclaim records a terminal receipt, not a wedge");
    assert_eq!(
        receipt.state,
        ApplyState::Applied,
        "the landed write is confirmed by post-state re-verify"
    );
    assert!(receipt.child.resolved_via_post_verify);
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);

    // A further retry now replays the recorded terminal receipt (idempotent).
    let replay = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:1",
        100 + IN_FLIGHT_TTL_MS + 2,
    );
    assert!(replay.replayed);
    assert_eq!(
        replay.receipt.unwrap().result_revision,
        receipt.result_revision
    );
}

// --- W02.P03: EditFrontmatter apply wiring ------------------------------

#[test]
fn build_write_invocation_selects_set_frontmatter_capability_and_field_level_flags() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    let doc_file = root.join(".vault").join("plan").join("fm-invocation.md");
    std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
    std::fs::write(
        &doc_file,
        "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\nbody\n",
    )
    .unwrap();

    let reader = SnapshotReader::for_worktree(root.to_path_buf());
    let seed_doc = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:fm-invocation".to_string(),
        stem: "fm-invocation".to_string(),
        path: ".vault/plan/fm-invocation.md".to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:seed").unwrap(),
    };
    let base_probe = reader.capture_existing(&seed_doc).unwrap();
    let document = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: "doc:fm-invocation".to_string(),
        stem: "fm-invocation".to_string(),
        path: ".vault/plan/fm-invocation.md".to_string(),
        doc_type: "plan".to_string(),
        base_revision: base_probe.revision.clone(),
    };
    let base_snapshot = reader.capture_existing(&document).unwrap();
    let preimage = reader
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_fm_inv".to_string(),
            changeset_id: "changeset_fm_inv".to_string(),
            operation_id: "child_1".to_string(),
            document: document.clone(),
            captured_at_ms: 1,
        })
        .unwrap();
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::EditFrontmatter,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(base_snapshot.revision.clone()),
            current_revision: Some(base_snapshot.revision.clone()),
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            body: String::new(),
            frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                date: Some("2026-02-06".to_string()),
                tags: Some(vec!["#plan".to_string(), "#new-tag".to_string()]),
                related: None,
            }),
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_edit_frontmatter(
        &ChangesetId::new("changeset_fm_inv").unwrap(),
        draft,
        &base_snapshot,
        &preimage,
    )
    .unwrap();

    let invocation = build_write_invocation(
        ChangesetOperationKind::EditFrontmatter,
        &materialized,
        &existing_path(&document).unwrap(),
        "a".repeat(40),
    )
    .unwrap();

    assert_eq!(invocation.capability(), CoreCapability::SetFrontmatter);
    assert!(
        !invocation.has_body(),
        "a frontmatter edit never streams a body to core"
    );
    assert!(invocation.argv().contains(&"--date".to_string()));
    assert!(invocation.argv().contains(&"2026-02-06".to_string()));
    assert!(invocation.argv().contains(&"--tags".to_string()));
    assert!(invocation.argv().contains(&"#new-tag".to_string()));
}

#[test]
fn edit_frontmatter_apply_materializes_once_and_records_an_applied_receipt() {
    let mut fx = setup_frontmatter(true);
    let applier = fx.applier.clone();
    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:fm:1",
        100,
    );
    assert!(
        outcome.eligibility.allowed,
        "{:?}",
        outcome.eligibility.reason
    );
    let receipt = outcome
        .receipt
        .expect("an applied frontmatter changeset yields a receipt");
    assert_eq!(receipt.state, ApplyState::Applied);
    assert_eq!(receipt.child.outcome, ApplyChildOutcome::Applied);
    assert_eq!(ledger_status(&mut fx), ChangesetStatus::Applied);
}

#[test]
fn edit_frontmatter_out_of_band_edit_conflicts_and_refuses_the_apply_as_a_value() {
    let mut fx = setup_frontmatter(true);
    let applier = fx.applier.clone();
    // An out-of-band edit lands on the target after the frontmatter draft was
    // materialized: the base is now stale, so the base-revision conflict gate
    // (generalized to `EditFrontmatter` by the `is_whole_document_replace`
    // broadening in conflicts.rs) refuses the apply as a denial VALUE.
    std::fs::write(
        &fx.doc_file,
        "---\ntags:\n  - '#plan'\ndate: '2026-01-01'\n---\n\n# apply demo\n\nsomeone else edited this\n",
    )
    .unwrap();

    let outcome = apply(
        &mut fx,
        &envelope_adapter("updated"),
        &applier,
        "idem:apply:fm:conflict",
        100,
    );
    assert!(
        !outcome.eligibility.allowed,
        "a stale base refuses the frontmatter apply as a value"
    );
    assert!(
        outcome.receipt.is_none(),
        "a preflight conflict denial carries no receipt (the core never ran)"
    );
    assert_eq!(
        ledger_status(&mut fx),
        ChangesetStatus::Approved,
        "the refused apply left the ledger untouched"
    );
}
