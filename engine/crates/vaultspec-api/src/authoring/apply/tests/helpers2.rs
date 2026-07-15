//! Shared fixtures + helpers for the apply test groups (module-decomposition), part 2.

use super::helpers::*;

/// A REAL `vaultspec-core` `rename` invocation, wrapped to LAND the write and
/// THEN hang past the deadline — mirrors `landing_frontmatter_timeout_adapter`
/// for `Rename`'s own core-authoritative post-verify.
pub(super) fn landing_rename_timeout_adapter(doc_ref: &str, new_stem: &str) -> CoreAdapter {
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ uv run --no-sync vaultspec-core vault rename '{doc_ref}' --to \
                 '{new_stem}' --json | Out-Null; Start-Sleep -Seconds 30 }}"
            ),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!(
                "uv run --no-sync vaultspec-core vault rename '{doc_ref}' --to '{new_stem}' \
                 --json >/dev/null 2>&1; sleep 30"
            ),
        ]
    };
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(10))
}

// --- section-scoped-operations: SectionEdit against the REAL core -------

pub(super) const LIVE_SECTION_EDIT_OLD_STEM: &str = "apply-section-edit-live-demo";

pub(super) const LIVE_SECTION_EDIT_DOC_PATH: &str = ".vault/plan/apply-section-edit-live-demo.md";

pub(super) const LIVE_SECTION_EDIT_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-01-01'\n---\n\n# apply live section edit demo\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n";

pub(super) const LIVE_SECTION_EDIT_BETA_SECTION: &str = "## Beta\n\nbeta body\n";

pub(super) const LIVE_SECTION_EDIT_NEW_BETA: &str = "## Beta\n\nBETA REWRITTEN LIVE\n";

/// The `setup_live_rename` sibling for `SectionEdit`: a REAL git +
/// vaultspec workspace, an APPROVED single-child `SectionEdit` changeset
/// (targeting the `Beta` heading) ready to apply against the genuine
/// `vaultspec-core` binary. `SectionEdit`'s write is whole-document under
/// the hood — the SAME `SetBody` capability and `ExactBlobHash`
/// post-verify `ReplaceBody` uses — so this proves the splice
/// materialization survives a REAL core round trip.
pub(super) fn setup_live_section_edit() -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    let doc_file = root.join(LIVE_SECTION_EDIT_DOC_PATH);
    std::fs::create_dir_all(doc_file.parent().unwrap()).unwrap();
    std::fs::write(&doc_file, LIVE_SECTION_EDIT_BASE_BODY).unwrap();
    scaffold_vaultspec_workspace(&root);
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "apply live section edit fixture"]);

    let mut store = Store::open(&root.join(".vault")).unwrap();
    let changeset_id = ChangesetId::new("changeset_apply_se_live_1").unwrap();
    let proposal_id = ProposalId::new("proposal_apply_se_live_1").unwrap();
    let origin = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let applier = actor("human:applier", ActorKind::Human);

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:reviewer", ActorKind::Human),
                ("human:applier", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            Ok(())
        })
        .unwrap();

    let reader = SnapshotReader::for_worktree(root.clone());
    let seed_doc = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{LIVE_SECTION_EDIT_OLD_STEM}"),
        stem: LIVE_SECTION_EDIT_OLD_STEM.to_string(),
        path: LIVE_SECTION_EDIT_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:seed").unwrap(),
    };
    let base_probe = reader.capture_existing(&seed_doc).unwrap();
    let document = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{LIVE_SECTION_EDIT_OLD_STEM}"),
        stem: LIVE_SECTION_EDIT_OLD_STEM.to_string(),
        path: LIVE_SECTION_EDIT_DOC_PATH.to_string(),
        doc_type: "plan".to_string(),
        base_revision: base_probe.revision.clone(),
    };
    let base_snapshot = reader.capture_existing(&document).unwrap();
    let preimage = reader
        .capture_preimage(PreimageCaptureRequest {
            preimage_id: "preimage_se_live_1".to_string(),
            changeset_id: changeset_id.as_str().to_string(),
            operation_id: "child_1".to_string(),
            document: document.clone(),
            captured_at_ms: 5,
        })
        .unwrap();
    let selector = crate::authoring::sections::SectionSelector {
        heading_path: vec!["Beta".to_string()],
        range_hint: None,
        expected_content_hash: blob_oid(LIVE_SECTION_EDIT_BETA_SECTION.as_bytes()),
    };
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::SectionEdit,
        target: TargetRevisionFence {
            document: document.clone(),
            base_revision: Some(base_probe.revision.clone()),
            current_revision: Some(base_probe.revision.clone()),
        },
        draft: DraftMutation {
            mode: DraftMode::SectionScoped,
            body: LIVE_SECTION_EDIT_NEW_BETA.to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: Some(selector),
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_section_edit(
        &changeset_id,
        draft,
        &base_snapshot,
        &preimage,
    )
    .unwrap();
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

    let current_observation = CurrentRevisionObservation::from_snapshot("child_1", &base_snapshot);
    let validation_record = validate_changeset_material(
        std::slice::from_ref(&materialized),
        &[current_observation],
        &[],
        6,
    )
    .unwrap();
    assert!(
        validation_record.approval_ready,
        "fixture validation must be approval-ready: {:?}",
        validation_record.status
    );
    let validation_digest = validation_record.validation_digest.clone();

    let child_input = ChangesetChildOperationInput::from_materialized(
        materialized,
        validation_record.material_digest.clone(),
        validation_digest.clone(),
    );

    let reviewed_revision = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: None,
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::Draft,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live section edit demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 10,
            })
            .unwrap();
            uow.ledger().append_revision(&draft_rev)?;
            let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: Some(draft_rev.changeset_revision.clone()),
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::NeedsReview,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live section edit demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 20,
            })
            .unwrap();
            uow.ledger().append_revision(&needs_review)?;
            uow.validations().store_record(&validation_record)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap();

    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_apply_se_live_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:se:live:1".to_string(),
                created_at_ms: 30,
            }))
        })
        .unwrap()
        .unwrap();

    store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                proposal_id: &proposal_id,
                decision: ApprovalDecision::Approve,
                reviewer: &reviewer,
                validation: ValidationFreshness::fresh(),
                current_validation_digest: &validation_digest,
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: None,
                decided_at_ms: 40,
            }))
        })
        .unwrap()
        .unwrap();

    Fx {
        _dir: dir,
        store,
        root,
        doc_file,
        changeset_id,
        proposal_id,
        origin,
        applier,
        expected_result_blob_hash,
    }
}

/// A core that lands the SAME spliced whole-document body a `SectionEdit`
/// apply invocation would (staged in Rust, no shell escaping — mirrors
/// `landing_timeout_adapter`'s synthetic-mutation pattern) and THEN hangs
/// past the deadline — the outcome-indeterminate-kill falsifier for
/// `SectionEdit`'s `ExactBlobHash` post-verify, exactly like `ReplaceBody`.
pub(super) fn landing_section_edit_timeout_adapter(
    worktree_root: &Path,
    spliced_body: &str,
) -> CoreAdapter {
    std::fs::write(worktree_root.join(".landing-source-se"), spliced_body).unwrap();
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ Copy-Item '.landing-source-se' '{LIVE_SECTION_EDIT_DOC_PATH}' -Force; \
                 Start-Sleep -Seconds 30 }}"
            ),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!("cp .landing-source-se '{LIVE_SECTION_EDIT_DOC_PATH}'; sleep 30"),
        ]
    };
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(2500))
}

// --- W02.P05: CreateDocument against the REAL core ----------------------

pub(super) const LIVE_CREATE_DOC_TYPE: &str = "plan";

pub(super) const LIVE_CREATE_FEATURE: &str = "apply-create-live-demo";

// A FIXED historical timestamp, never "now" — core's `vault add` accepts
// an explicit `--date` override (confirmed against the real binary), so
// pinning a stable date keeps this test's predicted path independent of
// the day it happens to run on, exactly like `materialize_create_document`
// fixes the date once at materialize time rather than reading a clock at
// verify time.
pub(super) const LIVE_CREATE_CREATED_AT_MS: i64 = 1_768_435_200_000; // 2026-01-15T00:00:00Z
pub(super) const LIVE_CREATE_DATE: &str = "2026-01-15";

pub(super) const LIVE_CREATE_STEM: &str = "2026-01-15-apply-create-live-demo-plan";

pub(super) const LIVE_CREATE_DOC_PATH: &str =
    ".vault/plan/2026-01-15-apply-create-live-demo-plan.md";

/// A distinctive line the authored body carries and the pristine template never
/// does — the "body landed" witness for the two-step create assertions.
pub(super) const LIVE_CREATE_BODY_MARKER: &str = "APPLY LIVE CREATE BODY MARKER";

/// The WHOLE authored document a real graph-submitter sends as a
/// `create_document` draft body — a complete document from its own opening
/// `---` frontmatter fence through the last section. The apply's body-write step
/// strips this leading frontmatter (core's `set-body` keeps the scaffold's own
/// frontmatter) and streams only the prose below, so the materialized document
/// carries core's conformant scaffold frontmatter plus this authored body — with
/// no template annotations, no unfilled placeholders, and no doubled frontmatter.
pub(super) const LIVE_CREATE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#apply-create-live-demo'\ndate: '2026-01-15'\nmodified: '2026-01-15'\nrelated: []\n---\n\n# `apply-create-live-demo` plan\n\nAPPLY LIVE CREATE BODY MARKER - the two-step create wrote this authored body.\n\n## Proposed Changes\n\nWire the two-step apply so a whole-document create materializes its authored content.\n\n## Tasks\n\n- Scaffold the document, then write the authored body under the scaffold frontmatter.\n\n## Verification\n\nThe materialized document exists and contains this authored body.\n";

/// The prose portion of [`LIVE_CREATE_BODY`] — everything below the closing
/// frontmatter fence — the exact text the apply's `set-body` step streams and
/// the two-step landing adapter re-supplies to replicate a real materialization.
pub(super) const LIVE_CREATE_BODY_PROSE: &str = "# `apply-create-live-demo` plan\n\nAPPLY LIVE CREATE BODY MARKER - the two-step create wrote this authored body.\n\n## Proposed Changes\n\nWire the two-step apply so a whole-document create materializes its authored content.\n\n## Tasks\n\n- Scaffold the document, then write the authored body under the scaffold frontmatter.\n\n## Verification\n\nThe materialized document exists and contains this authored body.\n";

/// The `setup_live_rename` sibling for `CreateDocument`: a REAL git +
/// vaultspec workspace, an APPROVED single-child `CreateDocument`
/// changeset ready to apply against the genuine `vaultspec-core` binary.
/// Unlike every other kind, there is NO base document to write first —
/// nothing exists yet.
pub(super) fn setup_live_create() -> Fx {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().to_path_buf();
    git(&root, &["init", "-b", "main", "."]);
    scaffold_vaultspec_workspace(&root);
    git(&root, &["add", "."]);
    git(&root, &["commit", "-m", "apply live create fixture"]);

    let mut store = Store::open(&root.join(".vault")).unwrap();
    let changeset_id = ChangesetId::new("changeset_apply_cr_live_1").unwrap();
    let proposal_id = ProposalId::new("proposal_apply_cr_live_1").unwrap();
    let origin = actor("agent:author", ActorKind::Agent);
    let reviewer = actor("human:reviewer", ActorKind::Human);
    let applier = actor("human:applier", ActorKind::Human);

    store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            for (id, kind) in [
                ("agent:author", ActorKind::Agent),
                ("human:reviewer", ActorKind::Human),
                ("human:applier", ActorKind::Human),
            ] {
                uow.actors().put_record(ActorRecordInput::active(
                    actor(id, kind),
                    ActorDisplayMetadata::new(id, None),
                    1,
                ))?;
            }
            Ok(())
        })
        .unwrap();

    let provisional_document = DocumentRef::ProvisionalCreate {
        provisional_doc_id: "provisional_apply_cr_live_1".to_string(),
        doc_type: LIVE_CREATE_DOC_TYPE.to_string(),
        feature: LIVE_CREATE_FEATURE.to_string(),
        title: "Apply Live Create Demo".to_string(),
        collision_status: ProvisionalCollisionStatus::Unknown,
        proposed_stem: None,
    };
    let draft = ChangesetChildOperationDraft {
        child_key: "child_1".to_string(),
        operation: ChangesetOperationKind::CreateDocument,
        target: TargetRevisionFence {
            document: provisional_document.clone(),
            base_revision: None,
            current_revision: None,
        },
        draft: DraftMutation {
            mode: DraftMode::WholeDocument,
            // A real graph-submitter sends the WHOLE authored document (its own
            // frontmatter through its last section). The apply strips this
            // leading frontmatter and writes the prose under the scaffold's
            // frontmatter via the two-step `vault add` → `vault set-body`.
            body: LIVE_CREATE_BODY.to_string(),
            frontmatter: None,
            new_stem: None,
            section_selector: None,
            plan_step: None,
        },
    };
    let materialized = MaterializedProposalOperation::materialize_create_document(
        &changeset_id,
        draft,
        LIVE_CREATE_CREATED_AT_MS,
    )
    .unwrap();
    assert_eq!(
        materialized.create_document_date.as_deref(),
        Some(LIVE_CREATE_DATE),
        "the fixed timestamp must format to the fixed date the test's expected path uses"
    );
    let expected_result_blob_hash = materialized.target_snapshot.payload_hash.clone();

    // A CurrentRevisionObservation matching the SAME phantom "diff from
    // nothing" values `materialize_create_document` used internally (empty
    // text, the git-style empty-blob hash) — required because
    // `validate_current_revision` BLOCKS approval-readiness on a missing
    // observation for ANY operation kind, create included.
    let empty_hash = blob_oid(b"");
    let phantom_revision = RevisionToken::new(format!("blob:{empty_hash}")).unwrap();
    let current_observation = CurrentRevisionObservation {
        child_key: "child_1".to_string(),
        document: provisional_document,
        revision: phantom_revision,
        blob_hash: empty_hash,
    };
    let validation_record = validate_changeset_material(
        std::slice::from_ref(&materialized),
        &[current_observation],
        &[],
        6,
    )
    .unwrap();
    assert!(
        validation_record.approval_ready,
        "fixture validation must be approval-ready: {:?}",
        validation_record.status
    );
    let validation_digest = validation_record.validation_digest.clone();

    let child_input = ChangesetChildOperationInput::from_materialized(
        materialized,
        validation_record.material_digest.clone(),
        validation_digest.clone(),
    );

    let reviewed_revision = store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            let draft_rev = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: None,
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::Draft,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live create demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 10,
            })
            .unwrap();
            uow.ledger().append_revision(&draft_rev)?;
            let needs_review = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                changeset_id: changeset_id.clone(),
                previous_revision: Some(draft_rev.changeset_revision.clone()),
                kind: ChangesetKind::Authoring,
                status: ChangesetStatus::NeedsReview,
                session_id: Some(SessionId::new("session_1").unwrap()),
                actor: origin.clone(),
                summary: "apply live create demo".to_string(),
                children: vec![child_input.clone()],
                created_at_ms: 20,
            })
            .unwrap();
            uow.ledger().append_revision(&needs_review)?;
            uow.validations().store_record(&validation_record)?;
            Ok(needs_review.changeset_revision)
        })
        .unwrap();

    store
        .with_unit_of_work(CommandKind::SubmitForReview, |uow| {
            Ok(uow.approvals().request_approval(ApprovalRequestInput {
                approval_id: ApprovalId::new("approval_apply_cr_live_1").unwrap(),
                proposal_id: proposal_id.clone(),
                changeset_id: changeset_id.clone(),
                reviewed: ReviewedTuple {
                    proposal_revision: reviewed_revision.clone(),
                    validation_digest: validation_digest.clone(),
                    policy_version: V1_POLICY_VERSION.to_string(),
                },
                idempotency_key: "idem:request:cr:live:1".to_string(),
                created_at_ms: 30,
            }))
        })
        .unwrap()
        .unwrap();

    store
        .with_unit_of_work(CommandKind::Approve, |uow| {
            Ok(uow.approvals().submit_decision(ReviewDecisionInput {
                proposal_id: &proposal_id,
                decision: ApprovalDecision::Approve,
                reviewer: &reviewer,
                validation: ValidationFreshness::fresh(),
                current_validation_digest: &validation_digest,
                current_policy_version: V1_POLICY_VERSION,
                run_cancelled: false,
                comment: None,
                decided_at_ms: 40,
            }))
        })
        .unwrap()
        .unwrap();

    Fx {
        _dir: dir,
        store,
        root: root.clone(),
        doc_file: root.join(LIVE_CREATE_DOC_PATH),
        changeset_id,
        proposal_id,
        origin,
        applier,
        expected_result_blob_hash,
    }
}

/// A REAL `vaultspec-core` `vault add` invocation, wrapped to LAND the
/// scaffold and THEN hang past the deadline — mirrors
/// `landing_rename_timeout_adapter` for `CreateDocument`'s own
/// core-authoritative post-verify. Carries the SAME `--date` override
/// `build_write_invocation` would send, so the real scaffold lands at the
/// exact predicted path the test asserts against.
pub(super) fn landing_create_timeout_adapter(
    doc_type: &str,
    feature: &str,
    title: &str,
    date: &str,
) -> CoreAdapter {
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ uv run --no-sync vaultspec-core vault add '{doc_type}' --feature \
                 '{feature}' --title '{title}' --date '{date}' --json | Out-Null; \
                 Start-Sleep -Seconds 30 }}"
            ),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!(
                "uv run --no-sync vaultspec-core vault add '{doc_type}' --feature \
                 '{feature}' --title '{title}' --date '{date}' --json >/dev/null 2>&1; \
                 sleep 30"
            ),
        ]
    };
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(10))
}

/// A REAL two-step `CreateDocument`-with-body materialization, wrapped to LAND
/// BOTH steps (`vault add` scaffold THEN `vault set-body` of the authored prose)
/// and THEN hang past the deadline — the outcome-indeterminate-kill falsifier
/// for the STRENGTHENED `CreatedAt` post-verify. Only when the authored body is
/// genuinely on disk (not merely the scaffold) must the reclaim recognize it
/// Applied. The prose is staged in the worktree and supplied via
/// `set-body --body-file`, exactly the body the apply's own follow-up streams.
pub(super) fn landing_create_two_step_timeout_adapter(
    worktree_root: &Path,
    doc_type: &str,
    feature: &str,
    title: &str,
    date: &str,
    stem: &str,
    body_prose: &str,
) -> CoreAdapter {
    let body_file = ".landing-source-create";
    std::fs::write(worktree_root.join(body_file), body_prose).unwrap();
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ uv run --no-sync vaultspec-core vault add '{doc_type}' --feature \
                 '{feature}' --title '{title}' --date '{date}' --json | Out-Null; \
                 uv run --no-sync vaultspec-core vault set-body '{stem}' --body-file \
                 '{body_file}' --json | Out-Null; Start-Sleep -Seconds 30 }}"
            ),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!(
                "uv run --no-sync vaultspec-core vault add '{doc_type}' --feature '{feature}' \
                 --title '{title}' --date '{date}' --json >/dev/null 2>&1; \
                 uv run --no-sync vaultspec-core vault set-body '{stem}' --body-file \
                 '{body_file}' --json >/dev/null 2>&1; sleep 30"
            ),
        ]
    };
    // A generous deadline: TWO real `uv run` core subprocesses must complete
    // before the kill, so the apply-level adapter still observes a Timeout.
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(20))
}

/// A REAL `vaultspec-core` `set-frontmatter` invocation, wrapped to LAND the
/// write and THEN hang past the deadline — the realistic "core is
/// core-authoritative AND was killed after actually finishing" sequence R1
/// fixes. Runs the genuine core subprocess to completion (a REAL frontmatter
/// write lands on disk, in `worktree_root`), then sleeps well past the
/// timeout so the apply-level `CoreAdapter` still observes a Timeout
/// (OUTCOME-INDETERMINATE). The trailing forwarded argv (the `CoreInvocation`
/// this test's `apply_changeset` call built) is intentionally unused here —
/// this wrapper hardcodes the SAME real command directly, mirroring
/// `landing_timeout_adapter`'s synthetic-mutation pattern but with a genuine
/// core subprocess instead of a file copy.
pub(super) fn landing_frontmatter_timeout_adapter(doc_ref: &str, date: &str) -> CoreAdapter {
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ uv run --no-sync vaultspec-core vault set-frontmatter '{doc_ref}' \
                 --date '{date}' --json | Out-Null; Start-Sleep -Seconds 30 }}"
            ),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!(
                "uv run --no-sync vaultspec-core vault set-frontmatter '{doc_ref}' \
                 --date '{date}' --json >/dev/null 2>&1; sleep 30"
            ),
        ]
    };
    // A generous deadline: the wrapped command is a REAL `uv run` subprocess
    // (venv resolution + Python startup), not a synthetic file mutation, so it
    // needs materially more slack than `landing_timeout_adapter`'s 2.5s.
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_secs(10))
}

pub(super) fn envelope_adapter(status: &str) -> CoreAdapter {
    let json = format!(
        "{{\"schema\":\"vaultspec.vault.write.v1\",\"status\":\"{status}\",\"data\":{{}}}}"
    );
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!("& {{ [Console]::Out.Write('{json}') }}"),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!("printf '%s' '{json}'"),
        ]
    };
    CoreAdapter::from_invocation(invocation)
}

/// A core that hangs past a short deadline — invoke returns an
/// OUTCOME-INDETERMINATE Timeout. The file effect (if any) is simulated by the
/// test itself, exactly the "killed but maybe-completed" case R1 codified.
pub(super) fn timeout_adapter() -> CoreAdapter {
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            "& { Start-Sleep -Seconds 30 }".into(),
        ]
    } else {
        vec!["sh".to_string(), "-c".into(), "sleep 30".into()]
    };
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(300))
}

/// A core that LANDS the materialized write (copies `NEW_BODY` into the target during
/// the invoke) and THEN hangs past the deadline — the realistic "killed but the write
/// already landed" sequence. The mutation happens DURING invoke (after the preflight
/// conflict gate, which sees the base), so it never masquerades as a pre-apply stale
/// base. The body is staged in Rust (no shell escaping); the core copies it in place.
pub(super) fn landing_timeout_adapter(worktree_root: &Path) -> CoreAdapter {
    std::fs::write(worktree_root.join(".landing-source"), NEW_BODY).unwrap();
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!(
                "& {{ Copy-Item '.landing-source' '{DOC_PATH}' -Force; Start-Sleep -Seconds 30 }}"
            ),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!("cp .landing-source '{DOC_PATH}'; sleep 30"),
        ]
    };
    // A longer deadline than the bare hang: the mutation must COMPLETE (past a cold
    // shell/PowerShell start) before the kill; the process is still sleeping at the
    // deadline, so the invoke is still an OUTCOME-INDETERMINATE Timeout.
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(2500))
}

/// A core that REMOVES the target during the invoke and then hangs — the "killed, and
/// the post-state is now unreadable" sequence. The removal happens DURING invoke (after
/// the preflight, which sees the intact base), so the fail-closed post-verify path is
/// exercised without an artificial pre-apply anchor drift.
pub(super) fn removing_timeout_adapter() -> CoreAdapter {
    let invocation = if cfg!(windows) {
        vec![
            "powershell".to_string(),
            "-NoProfile".into(),
            "-Command".into(),
            format!("& {{ Remove-Item '{DOC_PATH}' -Force; Start-Sleep -Seconds 30 }}"),
        ]
    } else {
        vec![
            "sh".to_string(),
            "-c".into(),
            format!("rm '{DOC_PATH}'; sleep 30"),
        ]
    };
    // A longer deadline than the bare hang so the removal COMPLETES before the kill.
    CoreAdapter::from_invocation(invocation).with_timeout(Duration::from_millis(2500))
}

pub(super) fn apply(
    fx: &mut Fx,
    adapter: &CoreAdapter,
    actor: &ActorRef,
    key: &str,
    now: i64,
) -> ApplyOutcome {
    let key = IdempotencyKey::new(key).unwrap();
    let root = fx.root.clone();
    let changeset_id = fx.changeset_id.clone();
    let proposal_id = fx.proposal_id.clone();
    apply_changeset(
        &mut fx.store,
        adapter,
        &root,
        ApplyRequest {
            changeset_id: &changeset_id,
            proposal_id: &proposal_id,
            actor,
            idempotency_key: &key,
            fencing_token: None,
            now_ms: now,
        },
    )
    .unwrap()
}

pub(super) fn ledger_status(fx: &mut Fx) -> ChangesetStatus {
    let changeset_id = fx.changeset_id.clone();
    fx.store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            Ok(uow.ledger().latest(&changeset_id)?.unwrap().status)
        })
        .unwrap()
}

/// Apply presenting a specific advisory fencing token (or `None`), so the apply-side
/// fence (W14.P42a) can be exercised against a seeded lease.
pub(super) fn apply_with_token(
    fx: &mut Fx,
    adapter: &CoreAdapter,
    actor: &ActorRef,
    key: &str,
    now: i64,
    fencing_token: Option<i64>,
) -> ApplyOutcome {
    let key = IdempotencyKey::new(key).unwrap();
    let root = fx.root.clone();
    let changeset_id = fx.changeset_id.clone();
    let proposal_id = fx.proposal_id.clone();
    apply_changeset(
        &mut fx.store,
        adapter,
        &root,
        ApplyRequest {
            changeset_id: &changeset_id,
            proposal_id: &proposal_id,
            actor,
            idempotency_key: &key,
            fencing_token,
            now_ms: now,
        },
    )
    .unwrap()
}

/// Seed a live advisory lease on the apply target's per-document scope, held by
/// `holder`, returning the issued lease record (its `fencing_token` is the current one).
pub(super) fn seed_lease(fx: &mut Fx, holder: &ActorRef, now: i64) -> LeaseRecord {
    let scope = document_lease_scope(&fx.root, "doc:apply-demo");
    fx.store
        .with_unit_of_work(CommandKind::AcquireLease, |uow| {
            uow.leases().acquire_lease(AcquireLeaseInput {
                scope_id: scope,
                purpose: LeasePurpose::WholeDocument,
                holder: holder.clone(),
                idempotency_key: format!("idem:lease:{}", holder.id.as_str()),
                created_at_ms: now,
                ttl_ms: None,
            })
        })
        .unwrap()
        .record
        .expect("a fresh acquisition records a lease")
}

pub(super) fn outbox_events(fx: &mut Fx) -> Vec<OutboxEvent> {
    fx.store
        .with_unit_of_work(CommandKind::CreateProposal, |uow| {
            uow.outbox().events_after(0, 10)
        })
        .unwrap()
}

pub(super) fn plain_child(key: &str, path: &str) -> ChangesetChildOperationInput {
    let doc = DocumentRef::Existing {
        scope: "worktree".to_string(),
        node_id: format!("doc:{key}"),
        stem: key.to_string(),
        path: path.to_string(),
        doc_type: "plan".to_string(),
        base_revision: RevisionToken::new("blob:base").unwrap(),
    };
    ChangesetChildOperationInput {
        child_key: key.to_string(),
        operation: ChangesetOperationKind::ReplaceBody,
        target: TargetRevisionFence {
            document: doc,
            base_revision: Some(RevisionToken::new("blob:base").unwrap()),
            current_revision: Some(RevisionToken::new("blob:base").unwrap()),
        },
        materialized_operation: None,
        material_digest: None,
        validation_digest: None,
    }
}
