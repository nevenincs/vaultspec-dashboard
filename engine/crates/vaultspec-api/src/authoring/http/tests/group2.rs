//! Apply test group (module-decomposition). See ./helpers.rs.

use super::helpers::*;
use super::helpers2::*;

#[tokio::test]
async fn request_changes_edit_flips_needs_review_to_draft_no_longer_reserved() {
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_edit_1").await;
    let proposal_id = submitted["data"]["proposal_id"]
        .as_str()
        .unwrap()
        .to_string();
    let approval_id = submitted["data"]["approval"]["approval_id"]
        .as_str()
        .unwrap()
        .to_string();
    let reviewed = submitted["data"]["reviewed_revision"]
        .as_str()
        .unwrap()
        .to_string();

    // A distinct human reviewer requests changes (the Edit flip).
    register_actor(&state, &human_reviewer());
    let (_d, reviewer) = resolved_principal(&human_reviewer());
    let response = submit_review_decision(
        State(state.clone()),
        axum::extract::Path(approval_id.clone()),
        decision_command(
            reviewer,
            &approval_id,
            &proposal_id,
            &reviewed,
            ReviewDecisionKind::Edit,
        ),
    )
    .await;

    assert_eq!(
        response.status(),
        StatusCode::OK,
        "Edit is no longer the reserved denial"
    );
    // The EditProposal arc returned the changeset to Draft (staling the prior approval).
    assert_eq!(
        changeset_status_for_test(&state, &ChangesetId::new("changeset_edit_1").unwrap()),
        ChangesetStatus::Draft,
        "request-changes flips NeedsReview -> Draft"
    );
}

#[tokio::test]
async fn a_respond_decision_routes_to_the_clarification_engine_not_the_reserved_denial() {
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_respond_1").await;
    let proposal_id = submitted["data"]["proposal_id"]
        .as_str()
        .unwrap()
        .to_string();
    let approval_id = submitted["data"]["approval"]["approval_id"]
        .as_str()
        .unwrap()
        .to_string();
    let reviewed = submitted["data"]["reviewed_revision"]
        .as_str()
        .unwrap()
        .to_string();

    register_actor(&state, &human_reviewer());
    let (_d, reviewer) = resolved_principal(&human_reviewer());
    // No claim is held, so the clarification engine denies with its OWN reason — proving
    // the flip reaches review_station.respond, not the retired "reserved for W05.P24".
    let response = submit_review_decision(
        State(state.clone()),
        axum::extract::Path(approval_id.clone()),
        decision_command(
            reviewer,
            &approval_id,
            &proposal_id,
            &reviewed,
            ReviewDecisionKind::Respond,
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["status"], "denied");
    assert!(
        body["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("clarification")),
        "Respond reaches the clarification engine: {body}"
    );
}

#[tokio::test]
async fn submit_route_composes_validation_and_opens_the_approval() {
    let (dir, state) = fixture_state();
    let body = create_then_submit(&state, dir.path(), "changeset_submit_1").await;

    assert_eq!(body["data"]["status"], "submitted");
    assert_eq!(body["data"]["changeset_id"], "changeset_submit_1");
    assert!(
        body["data"]["proposal_id"]
            .as_str()
            .unwrap()
            .starts_with("proposal:"),
        "proposal id is derived from the changeset: {body}"
    );
    assert!(
        body["data"]["validation_digest"].as_str().is_some(),
        "the composed validation pass recorded a digest: {body}"
    );
    // The approval request was opened SERVER-SIDE, queued for a reviewer.
    assert_eq!(body["data"]["approval"]["queue_state"], "queued");
    assert!(body["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn submit_route_replays_after_auto_apply_advanced_the_head() {
    let (dir, state) = fixture_state();
    register_actor(&state, &agent());
    let changeset = "changeset_submit_auto_replay";
    let changeset_id = ChangesetId::new(changeset).unwrap();

    let (_d1, p1) = resolved_principal(&agent());
    let created = create_proposal(
        State(state.clone()),
        create_command(p1, dir.path(), changeset, "idem:create:auto-replay"),
    )
    .await;
    assert_eq!(created.status(), StatusCode::OK);
    let created_body = json_body(created).await;
    let draft_revision = created_body["data"]["changeset_revision"]
        .as_str()
        .unwrap()
        .to_string();

    let (_d2, p2) = resolved_principal(&agent());
    let first = submit_for_review(
        State(state.clone()),
        axum::extract::Path(changeset.to_string()),
        submit_command(p2, &draft_revision, "idem:submit:auto-replay"),
    )
    .await;
    let first_status = first.status();
    let first_body = json_body(first).await;
    assert_eq!(first_status, StatusCode::OK, "first submit: {first_body}");
    assert_eq!(first_body["data"]["status"], "submitted");

    append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Approved, 1000);
    append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Applying, 1001);
    append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Applied, 1002);

    let (_d3, p3) = resolved_principal(&agent());
    let replay = submit_for_review(
        State(state.clone()),
        axum::extract::Path(changeset.to_string()),
        submit_command(p3, &draft_revision, "idem:submit:auto-replay"),
    )
    .await;
    let replay_status = replay.status();
    let replay_body = json_body(replay).await;

    assert_eq!(
        replay_status,
        StatusCode::OK,
        "retry after applied head must replay, not conflict or deny: {replay_body}"
    );
    assert_eq!(replay_body["data"]["status"], "replayed");
    assert_eq!(
        replay_body["data"]["approval"]["approval_id"],
        first_body["data"]["approval"]["approval_id"]
    );
}

#[tokio::test]
async fn proposal_routes_serve_backend_policy_decision() {
    let (dir, state) = fixture_state();
    create_then_submit(&state, dir.path(), "changeset_policy_route").await;

    let list = json_body(list_proposals(State(state.clone())).await).await;
    let list_policy = &list["data"]["items"][0]["policy"];
    assert_eq!(list_policy["effective_mode"], "manual");
    assert_eq!(list_policy["risk"], "non_destructive");
    assert_eq!(list_policy["requirement"], "human_approval_required");
    assert!(
        list_policy["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("manual mode")),
        "list route serves backend-authored policy reason: {list}"
    );

    let detail = json_body(
        project_proposal(
            State(state.clone()),
            Path("changeset_policy_route".to_string()),
        )
        .await,
    )
    .await;
    let detail_policy = &detail["data"]["proposal"]["policy"];
    assert_eq!(
        detail_policy, list_policy,
        "detail route reuses the backend projection policy block"
    );
}

#[tokio::test]
async fn increment2_demo_contract_auto_applies_rolls_back_and_requeues_on_downgrade() {
    let (dir, state) = fixture_state_with_core();
    register_actor(&state, &agent());
    register_actor(&state, &human_reviewer());
    let changeset = "changeset_increment2_demo_auto";

    let (_admin_dir, admin) = resolved_principal(&human_reviewer());
    let mode_response = set_operation_mode(
        State(state.clone()),
        mode_command(
            admin,
            OperationMode::Autonomous,
            "idem:mode:increment2:auto",
        ),
    )
    .await;
    let mode_status = mode_response.status();
    let mode_body = json_body(mode_response).await;
    assert_eq!(mode_status, StatusCode::OK, "set auto mode: {mode_body}");
    assert_eq!(mode_body["data"]["mode"], "autonomous");

    let (_create_dir, creator) = resolved_principal(&agent());
    let created = create_proposal(
        State(state.clone()),
        create_body_command(
            creator,
            dir.path(),
            changeset,
            "idem:create:increment2:auto",
            "# Plan\n\nnew body\n",
        ),
    )
    .await;
    let created_status = created.status();
    let created_body = json_body(created).await;
    assert_eq!(created_status, StatusCode::OK, "create: {created_body}");
    let draft_revision = created_body["data"]["changeset_revision"]
        .as_str()
        .expect("create returns draft revision")
        .to_string();

    let (_submit_dir, submitter) = resolved_principal(&agent());
    let submitted = submit_for_review(
        State(state.clone()),
        axum::extract::Path(changeset.to_string()),
        submit_command(submitter, &draft_revision, "idem:submit:increment2:auto"),
    )
    .await;
    let submitted_status = submitted.status();
    let submitted_body = json_body(submitted).await;
    assert_eq!(
        submitted_status,
        StatusCode::OK,
        "autonomous submit: {submitted_body}"
    );
    assert_eq!(submitted_body["data"]["status"], "submitted");
    assert_eq!(
        submitted_body["data"]["mode"]["auto_approval"]["status"],
        "approved"
    );
    assert_eq!(
        submitted_body["data"]["mode"]["auto_approval"]["approval"]["decision"]["reviewer"]["kind"],
        "system"
    );
    assert_eq!(
        submitted_body["data"]["mode"]["auto_apply"]["receipt"]["state"], "applied",
        "auto-apply receipt should be applied: {submitted_body}"
    );

    let document_body =
        std::fs::read_to_string(dir.path().join(".vault/plan/operation-plan.md")).unwrap();
    assert!(
        document_body.contains("new body"),
        "auto-apply materializes the body edit: {document_body}"
    );

    let list = json_body(list_proposals(State(state.clone())).await).await;
    let after_fact = &list["data"]["applied_under_policy"]["items"][0];
    assert_eq!(
        after_fact["proposal"]["changeset_id"],
        "changeset_increment2_demo_auto"
    );
    assert_eq!(after_fact["proposal"]["status"], "applied");
    assert_eq!(after_fact["mode"], "autonomous");
    assert_eq!(after_fact["system_actor"]["kind"], "system");
    assert_eq!(after_fact["proposal"]["rollback"]["available"], true);

    let (_rollback_dir, rollback_actor) = resolved_principal(&human_reviewer());
    let rollback = create_rollback(
        State(state.clone()),
        rollback_command(rollback_actor, changeset, "idem:rollback:increment2:auto"),
    )
    .await;
    let rollback_status = rollback.status();
    let rollback_body = json_body(rollback).await;
    assert_eq!(
        rollback_status,
        StatusCode::OK,
        "rollback generation: {rollback_body}"
    );
    assert_eq!(
        rollback_body["data"]["status"], "generated",
        "rollback should be generated for the applied after-the-fact row: {rollback_body}"
    );
    assert!(
        rollback_body["data"]["rollback_changeset_id"]
            .as_str()
            .is_some_and(|id| id.starts_with("rollback:")),
        "rollback id is served for the after-the-fact lane: {rollback_body}"
    );

    // The public autonomous submit route immediately applies eligible work. To
    // prove the kill-switch contract for an approval that has not reached
    // Applying, return to manual for a second route-served review item, move
    // the scope back to autonomous, then use the mode repository to create
    // only the system approval marker before downgrading through the route and
    // reading the normal projection.
    let (_manual_prep_dir, manual_prep_admin) = resolved_principal(&human_reviewer());
    let manual_prep = set_operation_mode(
        State(state.clone()),
        mode_command(
            manual_prep_admin,
            OperationMode::Manual,
            "idem:mode:increment2:manual-prep",
        ),
    )
    .await;
    let manual_prep_body = json_body(manual_prep).await;
    assert_eq!(manual_prep_body["data"]["mode"], "manual");

    let pending_changeset = "changeset_increment2_demo_pending";
    let (_pcreate_dir, pcreator) = resolved_principal(&agent());
    let pending_created = create_proposal(
        State(state.clone()),
        create_body_command(
            pcreator,
            dir.path(),
            pending_changeset,
            "idem:create:increment2:pending",
            "# Plan\n\npending body\n",
        ),
    )
    .await;
    let pending_created_body = json_body(pending_created).await;
    let pending_revision = pending_created_body["data"]["changeset_revision"]
        .as_str()
        .expect("pending create returns revision")
        .to_string();
    let (_psubmit_dir, psubmitter) = resolved_principal(&agent());
    let pending_submitted = submit_for_review(
        State(state.clone()),
        axum::extract::Path(pending_changeset.to_string()),
        submit_command(
            psubmitter,
            &pending_revision,
            "idem:submit:increment2:pending",
        ),
    )
    .await;
    let pending_body = json_body(pending_submitted).await;
    assert_eq!(
        pending_body["data"]["mode"]["auto_approval"]["status"],
        "not_applicable"
    );
    let pending_changeset_id = ChangesetId::new(pending_changeset).unwrap();
    let pending_proposal_id = derive_proposal_id(&pending_changeset_id).unwrap();
    let pending_approval = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::Approve, |uow| {
                uow.approvals()
                    .latest_for_proposal(&pending_proposal_id)?
                    .ok_or_else(|| StoreError::Approval("approval missing".to_string()))
            })
        })
        .unwrap();
    let (_auto_pending_dir, auto_pending_admin) = resolved_principal(&human_reviewer());
    let auto_pending = set_operation_mode(
        State(state.clone()),
        mode_command(
            auto_pending_admin,
            OperationMode::Autonomous,
            "idem:mode:increment2:auto-pending",
        ),
    )
    .await;
    let auto_pending_body = json_body(auto_pending).await;
    assert_eq!(auto_pending_body["data"]["mode"], "autonomous");
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::Approve, |uow| {
                uow.modes()
                    .maybe_auto_approve(
                        &scope_id_for_worktree(&state.active_workspace_root()),
                        &pending_approval,
                        now_ms(),
                    )
                    .map(|outcome| {
                        assert!(
                            outcome.approved(),
                            "pending approval should be system-approved: {pending_body}"
                        );
                    })
            })
        })
        .unwrap();

    let (_manual_dir, manual_admin) = resolved_principal(&human_reviewer());
    let downgrade = set_operation_mode(
        State(state.clone()),
        mode_command(
            manual_admin,
            OperationMode::Manual,
            "idem:mode:increment2:manual",
        ),
    )
    .await;
    let downgrade_status = downgrade.status();
    let downgrade_body = json_body(downgrade).await;
    assert_eq!(
        downgrade_status,
        StatusCode::OK,
        "downgrade mode: {downgrade_body}"
    );
    assert_eq!(downgrade_body["data"]["mode"], "manual");
    assert_eq!(downgrade_body["data"]["requeued_approvals"], 1);

    let pending_projection = json_body(
        project_proposal(State(state.clone()), Path(pending_changeset.to_string())).await,
    )
    .await;
    assert_eq!(
        pending_projection["data"]["proposal"]["approval"]["queue_state"],
        "queued"
    );
    assert_eq!(
        pending_projection["data"]["proposal"]["approval"]["stale_reason"],
        "policy_version_changed"
    );
}

#[tokio::test]
async fn review_decision_route_approves_under_a_distinct_reviewer() {
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_review_1").await;
    let proposal_id = submitted["data"]["proposal_id"]
        .as_str()
        .unwrap()
        .to_string();
    let approval_id = submitted["data"]["approval"]["approval_id"]
        .as_str()
        .unwrap()
        .to_string();
    let reviewed = submitted["data"]["reviewed_revision"]
        .as_str()
        .unwrap()
        .to_string();

    register_actor(&state, &human_reviewer());
    let (_d, reviewer) = resolved_principal(&human_reviewer());
    let response = submit_review_decision(
        State(state.clone()),
        axum::extract::Path(approval_id.clone()),
        decision_command(
            reviewer,
            &approval_id,
            &proposal_id,
            &reviewed,
            ReviewDecisionKind::Approve,
        ),
    )
    .await;

    let status = response.status();
    let body = json_body(response).await;
    assert_eq!(status, StatusCode::OK, "decision failed: {body}");
    assert_eq!(body["data"]["status"], "decided");
    assert_eq!(body["data"]["approval"]["queue_state"], "closed");
    assert_eq!(body["data"]["approval"]["decision"]["decision"], "approve");
}

#[tokio::test]
async fn agent_self_approval_is_denied_over_the_wire() {
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_selfapprove_1").await;
    let proposal_id = submitted["data"]["proposal_id"]
        .as_str()
        .unwrap()
        .to_string();
    let approval_id = submitted["data"]["approval"]["approval_id"]
        .as_str()
        .unwrap()
        .to_string();
    let reviewed = submitted["data"]["reviewed_revision"]
        .as_str()
        .unwrap()
        .to_string();

    // The PROPOSING agent (registered by create_then_submit) tries to approve
    // its OWN proposal — the self-approval ban denies it as a 200 VALUE.
    let (_d, self_principal) = resolved_principal(&agent());
    let response = submit_review_decision(
        State(state.clone()),
        axum::extract::Path(approval_id.clone()),
        decision_command(
            self_principal,
            &approval_id,
            &proposal_id,
            &reviewed,
            ReviewDecisionKind::Approve,
        ),
    )
    .await;

    let status = response.status();
    let body = json_body(response).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "self-approval must be a 200 denial: {body}"
    );
    assert_eq!(body["data"]["status"], "denied");
    assert!(
        body["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("its own proposal")),
        "the ban names the self-approval: {body}"
    );
}

#[tokio::test]
async fn a_stale_reviewed_revision_is_a_409() {
    // R1: reviewed_revision is load-bearing — a reviewer attesting a SUPERSEDED
    // revision is a typed conflict (409 authoring_stale_review), never ignored.
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_stalereview").await;
    let proposal_id = submitted["data"]["proposal_id"]
        .as_str()
        .unwrap()
        .to_string();
    let approval_id = submitted["data"]["approval"]["approval_id"]
        .as_str()
        .unwrap()
        .to_string();

    register_actor(&state, &human_reviewer());
    let (_d, reviewer) = resolved_principal(&human_reviewer());
    let response = submit_review_decision(
        State(state.clone()),
        axum::extract::Path(approval_id.clone()),
        decision_command(
            reviewer,
            &approval_id,
            &proposal_id,
            "blob:0000000000000000000000000000000000000000",
            ReviewDecisionKind::Approve,
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
    let body = json_body(response).await;
    assert_eq!(body["error_kind"], "authoring_stale_review");
}

#[tokio::test]
async fn a_wedged_submit_needsreview_without_approval_heals_on_resubmit() {
    // R1 partial-submit wedge: a crash between submit and approval-open leaves
    // NeedsReview with NO approval. A fresh-key re-submit must RESUME forward
    // (open the approval), not deny at validate.
    let (dir, state) = fixture_state();
    register_actor(&state, &agent());
    let changeset = "changeset_wedge";
    let changeset_id = ChangesetId::new(changeset).unwrap();

    let (_d0, p0) = resolved_principal(&agent());
    let created = create_proposal(
        State(state.clone()),
        create_command(p0, dir.path(), changeset, "idem:create"),
    )
    .await;
    assert_eq!(created.status(), StatusCode::OK);

    // Simulate the crash: drive validate + submit at the DOMAIN to reach
    // NeedsReview WITHOUT opening the approval (the route's step 3).
    let reader = SnapshotReader::for_worktree(state.active_workspace_root());
    let now = now_ms();
    let ctx = |key: &str| ProposalCommandContext {
        actor: agent(),
        idempotency_key: IdempotencyKey::new(key).unwrap(),
        now_ms: now,
        in_flight_expires_at_ms: Some(now + 60_000),
        outcome_expires_at_ms: Some(now + 60_000),
    };
    state
        .with_authoring_store(|store| {
            let latest = store
                .with_unit_of_work(CommandKind::ValidateProposal, |uow| {
                    uow.ledger().latest(&changeset_id)
                })?
                .expect("draft exists");
            let (current_revisions, chunk_evidence) = validation_evidence(&reader, &latest)?;
            let validated = crate::authoring::proposal::validate_proposal(
                store,
                ctx("idem:wedge:validate"),
                ValidateProposalRequest {
                    changeset_id: changeset_id.clone(),
                    expected_revision: latest.changeset_revision.clone(),
                    summary: "v".to_string(),
                    current_revisions,
                    chunk_evidence,
                },
            )?;
            let (vrev, vdigest) = match validated {
                ProposalCommandResult::Accepted { outcome, .. } => (
                    outcome.changeset_revision,
                    outcome.validation_digest.unwrap(),
                ),
                other => panic!("expected validate accepted, got {other:?}"),
            };
            crate::authoring::proposal::submit_for_review(
                store,
                ctx("idem:wedge:submit"),
                SubmitProposalRequest {
                    changeset_id: changeset_id.clone(),
                    expected_revision: vrev,
                    validation_digest: vdigest,
                    summary: "s".to_string(),
                },
            )?;
            Ok(())
        })
        .unwrap();

    // Confirm the wedge: NeedsReview + no approval for the derived proposal id.
    let proposal_id = derive_proposal_id(&changeset_id).unwrap();
    let wedged = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                uow.approvals().latest_for_proposal(&proposal_id)
            })
        })
        .unwrap();
    assert!(
        wedged.is_none(),
        "the wedge: submitted but no approval opened"
    );

    // Re-submit via the ROUTE with a FRESH key → the heal opens the approval.
    let (_d1, p1) = resolved_principal(&agent());
    let healed = submit_for_review(
        State(state.clone()),
        axum::extract::Path(changeset.to_string()),
        submit_command(
            p1,
            "blob:0000000000000000000000000000000000000000",
            "idem:wedge:resubmit",
        ),
    )
    .await;
    let hstatus = healed.status();
    let hbody = json_body(healed).await;
    assert_eq!(hstatus, StatusCode::OK, "heal: {hbody}");
    assert_eq!(
        hbody["data"]["status"], "replayed",
        "resume replays: {hbody}"
    );
    assert_eq!(hbody["data"]["approval"]["queue_state"], "queued");

    let healed_exists = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::SubmitForReview, |uow| {
                uow.approvals().latest_for_proposal(&proposal_id)
            })
        })
        .unwrap();
    assert!(
        healed_exists.is_some(),
        "the wedge is healed — approval opened"
    );
}

#[test]
fn apply_outcome_value_maps_a_preflight_denial_to_a_200_value() {
    let outcome = ApplyOutcome {
        eligibility: ActionEligibility::denied(
            CommandKind::RequestApply,
            "changeset is not approved",
        ),
        receipt: None,
        replayed: false,
        in_flight: false,
        denial_kind: None,
    };
    let (status, value) = apply_outcome_value(&outcome);

    assert_eq!(status, StatusCode::OK, "a denial is a 200 value");
    assert_eq!(value["status"], "denied");
    assert_eq!(value["command"], "request_apply");
    assert!(
        value["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("not approved"))
    );
}

#[test]
fn apply_outcome_value_reports_an_in_flight_attempt_as_202() {
    let outcome = ApplyOutcome {
        eligibility: ActionEligibility::allowed(CommandKind::RequestApply),
        receipt: None,
        replayed: false,
        in_flight: true,
        denial_kind: None,
    };
    let (status, value) = apply_outcome_value(&outcome);

    assert_eq!(status, StatusCode::ACCEPTED);
    assert_eq!(value["status"], "in_flight");
}

#[tokio::test]
async fn apply_route_rejects_a_mismatched_approval_id() {
    let (_dir, state) = fixture_state();
    let (_d, principal) = resolved_principal(&agent());
    // A wrong approval id (not the one derived 1:1 from the changeset) is a 400
    // BEFORE any store or core work.
    let response = apply_changeset(
        State(state.clone()),
        apply_command(
            principal,
            "changeset_apply_1",
            "approval_wrong",
            "idem:apply:1",
        ),
    )
    .await;

    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = json_body(response).await;
    assert_eq!(body["error_kind"], REQUEST_INVALID_KIND);
}

#[tokio::test]
async fn rollback_route_over_an_unknown_source_is_unavailable() {
    let (_dir, state) = fixture_state();
    let (_d, principal) = resolved_principal(&agent());
    let response = create_rollback(
        State(state.clone()),
        rollback_command(principal, "changeset_absent_source", "idem:rollback:1"),
    )
    .await;

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["status"], "unavailable");
    assert!(
        body["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("does not exist")),
        "an unknown source is honestly unavailable: {body}"
    );
}

#[tokio::test]
async fn rollback_outcome_response_offers_a_manual_repair_when_unavailable() {
    let (_dir, state) = fixture_state();
    let outcome = RollbackOutcome {
        eligibility: ActionEligibility::denied(
            CommandKind::CreateRollback,
            "rollback_unavailable: no V1 inverse",
        ),
        changeset_id: None,
        changeset_revision: None,
        replayed: false,
        manual_repair: Some(crate::authoring::rollback::ManualRepairProposal {
            source_changeset_id: ChangesetId::new("changeset_1").unwrap(),
            source_children: vec!["child_1".to_string()],
            reason: "restore".to_string(),
        }),
    };
    let response = rollback_outcome_response(&state, outcome);

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["status"], "unavailable");
    assert_eq!(
        body["data"]["manual_repair"]["source_children"][0],
        "child_1"
    );
}

#[tokio::test]
async fn rollback_outcome_response_serves_the_generated_changeset() {
    let (_dir, state) = fixture_state();
    let outcome = RollbackOutcome {
        eligibility: ActionEligibility::allowed(CommandKind::CreateRollback),
        changeset_id: Some(ChangesetId::new("rollback:abc123").unwrap()),
        changeset_revision: Some(RevisionToken::new("blob:abc123").unwrap()),
        replayed: false,
        manual_repair: None,
    };
    let response = rollback_outcome_response(&state, outcome);

    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    assert_eq!(body["data"]["status"], "generated");
    assert_eq!(body["data"]["rollback_changeset_id"], "rollback:abc123");
}

// --- actor-token issuance (the bootstrap seam) ---------------------------

#[tokio::test]
async fn issue_actor_token_mints_registers_and_returns_the_raw_token_once() {
    let (_dir, state) = fixture_state();
    let response = issue_actor_token(
        State(state.clone()),
        Json(IssueActorTokenRequest {
            actor: agent(),
            lifetime_ms: Some(3_600_000),
        }),
    )
    .await;

    assert_eq!(response.status(), StatusCode::CREATED);
    let body = json_body(response).await;
    let raw = body["data"]["raw_token"]
        .as_str()
        .expect("the raw token is returned once")
        .to_string();
    // Hash-only persistence: the record carries a token_hash, never the raw token.
    assert_ne!(body["data"]["record"]["token_hash"], json!(raw));
    assert_eq!(body["data"]["record"]["actor"]["id"], "agent:writer");
    assert_eq!(body["data"]["record"]["issued_by"], "system:bootstrap");

    // The actor was REGISTERED active AND the token resolves — so a subsequent
    // command would not 403 on ensure_active (P39 finding #1).
    let resolved = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actor_tokens().resolve(&raw, now_ms())
            })
        })
        .unwrap();
    assert_eq!(resolved, Some(agent()));
}

#[tokio::test]
async fn middleware_resolves_a_live_token_to_the_server_actor() {
    let (_state_dir, state) = fixture_state();
    let raw = issue_token_in_state(&state, &agent());

    let body = probe_body(probe_router(state), Some(&raw)).await;
    assert_eq!(body, "resolved:agent:writer");
}

#[tokio::test]
async fn middleware_denies_missing_and_unknown_tokens_distinctly() {
    let (_state_dir, state) = fixture_state();
    // Force the authoring store open so an unknown-token lookup resolves
    // against a real (empty) store rather than degrading to unavailable.
    let _ = issue_token_in_state(&state, &agent());

    let missing = probe_body(probe_router(state.clone()), None).await;
    assert_eq!(missing, "denied:missing");

    let unknown = probe_body(probe_router(state), Some("deadbeef")).await;
    assert_eq!(unknown, "denied:unknown");
}

#[tokio::test]
async fn permission_decision_route_grants_a_queued_request_and_is_tiered() {
    let (_dir, state) = fixture_state();
    let requester = agent();
    let reviewer = human_reviewer();
    register_actor(&state, &requester);
    register_actor(&state, &reviewer);
    let reviewer_token = issue_token_in_state(&state, &reviewer);
    seed_pending_permission(&state, &requester, "call_route_grant");

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/agent-tools/call_route_grant/permission-decision",
        &reviewer_token,
        request_fixture(EndpointFamily::ToolPermission),
    )
    .await;

    assert_eq!(status, StatusCode::OK);
    assert_eq!(envelope["data"]["status"], "granted");
    assert_eq!(envelope["data"]["allowed"], true);
    assert!(envelope["tiers"]["semantic"]["available"].is_boolean());
}

#[tokio::test]
async fn permission_decision_route_refuses_a_requester_self_decision_as_a_value() {
    // The requester (an agent) cannot decide its own request (P22-R1). The denial
    // rides the 200 envelope as a value, never a fault.
    let (_dir, state) = fixture_state();
    let requester = agent();
    register_actor(&state, &requester);
    let requester_token = issue_token_in_state(&state, &requester);
    seed_pending_permission(&state, &requester, "call_route_self");

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/agent-tools/call_route_self/permission-decision",
        &requester_token,
        request_fixture(EndpointFamily::ToolPermission),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "a denial is a value, not a fault");
    assert_eq!(envelope["data"]["status"], "denied");
    assert_eq!(envelope["data"]["allowed"], false);
    assert!(
        envelope["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("human")),
        "reviewer-authority denial: {envelope}"
    );
}

#[tokio::test]
async fn interrupt_resume_route_resolves_by_id_and_replays() {
    let (_dir, state) = fixture_state();
    let reviewer = human_reviewer();
    register_actor(&state, &reviewer);
    let token = issue_token_in_state(&state, &reviewer);

    // Seed a paused run's interrupt to resolve by id (the sole V1 kind).
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::ResumeRun, |uow| {
                uow.interrupts().record_interrupt(
                    crate::authoring::interrupts::RecordInterruptInput {
                        interrupt_id: InterruptId::new("interrupt_route_1").unwrap(),
                        run_id: RunId::new("run_route_1").unwrap(),
                        kind: crate::authoring::interrupts::InterruptKind::ToolPermission,
                        tool_call_id: Some(ToolCallId::new("call_route_seed").unwrap()),
                        proposal_id: None,
                        idempotency_key: "idem:seed:interrupt".to_string(),
                        created_at_ms: now_ms(),
                    },
                )?;
                Ok(())
            })
        })
        .unwrap();

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/interrupts/interrupt_route_1/resume",
        &token,
        request_fixture(EndpointFamily::Interrupt),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(envelope["data"]["status"], "resumed");
    assert_eq!(envelope["data"]["replayed"], false);
    assert_eq!(envelope["data"]["interrupt"]["resume_state"], "resolved");

    // A second resume of the same id replays the recorded decision (never re-decides).
    let router = authoring_router(state.clone()).with_state(state);
    let (status, envelope) = post_authoring(
        router,
        "/v1/interrupts/interrupt_route_1/resume",
        &token,
        request_fixture(EndpointFamily::Interrupt),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(envelope["data"]["replayed"], true);
}

#[tokio::test]
async fn execute_route_suspends_an_ungranted_mutating_tool_as_a_200_value() {
    // Denials-are-values (and suspensions ride the same contract): a mutating
    // tool call without a granted permission opens a Pending request and
    // suspends — never a 4xx fault.
    let (_dir, state) = fixture_state();
    let requester = agent();
    register_actor(&state, &requester);
    let token = issue_token_in_state(&state, &requester);
    let run_id = seed_run(&state, &token).await;

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        &format!("/v1/runs/{run_id}/agent-tools/execute"),
        &token,
        execute_cancel_run_body("call_execute_suspend", "idem:execute:suspend", &run_id),
    )
    .await;

    assert_eq!(
        status,
        StatusCode::OK,
        "a suspension is a 200 value: {envelope}"
    );
    assert_eq!(envelope["data"]["disposition"], "awaiting_permission");
    assert_eq!(envelope["data"]["eligibility"]["allowed"], false);
    assert_eq!(
        envelope["data"]["result"],
        Value::Null,
        "nothing dispatched"
    );
    assert!(
        envelope["data"]["tool_call_record"].is_null(),
        "an awaiting call is not yet a terminal tool-call record: {envelope}"
    );
}

#[tokio::test]
async fn execute_route_dispatches_a_granted_mutating_tool_and_redrives_effectively_once() {
    let (_dir, state) = fixture_state();
    let requester = agent();
    let reviewer = human_reviewer();
    register_actor(&state, &requester);
    register_actor(&state, &reviewer);
    let requester_token = issue_token_in_state(&state, &requester);
    let reviewer_token = issue_token_in_state(&state, &reviewer);
    let run_id = seed_run(&state, &requester_token).await;
    let tool_call_id = "call_execute_redrive";
    let body = execute_cancel_run_body(tool_call_id, "idem:execute:redrive", &run_id);

    // First attempt opens the Pending permission and suspends.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, suspended) = post_authoring(
        router,
        &format!("/v1/runs/{run_id}/agent-tools/execute"),
        &requester_token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(suspended["data"]["disposition"], "awaiting_permission");

    // The reviewer grants the queued permission (P22-R1: never the requester).
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, decision) = post_authoring(
        router,
        &format!("/v1/agent-tools/{tool_call_id}/permission-decision"),
        &reviewer_token,
        request_fixture(EndpointFamily::ToolPermission),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(decision["data"]["status"], "granted");

    // Re-executing the SAME tool_call_id now dispatches: the run cancels.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, first) = post_authoring(
        router,
        &format!("/v1/runs/{run_id}/agent-tools/execute"),
        &requester_token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{first}");
    assert_eq!(first["data"]["disposition"], "dispatched");
    assert_eq!(first["data"]["replayed"], false);
    assert_eq!(first["data"]["result"]["status"], "cancelled");
    assert_eq!(first["data"]["tool_call_record"]["permitted"], true);

    // EFFECTIVELY-ONCE: a retry of the same tool_call_id RE-DRIVES the dispatch
    // (the executor's own `replayed` flag flips true) while the dispatched
    // command's OWN idempotency key — deterministically derived from
    // `tool_call_id` — dedups the completed dispatch, so the run is never
    // double-cancelled (no double-apply).
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, second) = post_authoring(
        router,
        &format!("/v1/runs/{run_id}/agent-tools/execute"),
        &requester_token,
        body,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{second}");
    assert_eq!(second["data"]["disposition"], "dispatched");
    assert_eq!(
        second["data"]["replayed"], true,
        "the executor re-drives: {second}"
    );
    assert_eq!(second["data"]["result"]["status"], "cancelled");

    // No double-apply: the run's cancellation receipt is unchanged (a single
    // terminal cancellation, not a second recorded event).
    let run = state
        .with_authoring_store(|store| {
            store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.sessions().run(&run_id)
            })
        })
        .unwrap()
        .expect("the run exists");
    assert_eq!(
        run.status,
        crate::authoring::session::RunStatus::Cancelled,
        "the run cancelled exactly once"
    );
}

#[tokio::test]
async fn execute_route_derives_the_actor_from_the_resolved_principal_never_the_body() {
    // ASA-010: `AgentToolCall` carries no actor field at all (deny_unknown_fields
    // would reject one) — the queued permission's requester can only have come
    // from the server-resolved principal.
    let (_dir, state) = fixture_state();
    let requester = agent();
    register_actor(&state, &requester);
    let token = issue_token_in_state(&state, &requester);
    let run_id = seed_run(&state, &token).await;

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        &format!("/v1/runs/{run_id}/agent-tools/execute"),
        &token,
        execute_cancel_run_body(
            "call_execute_principal_seam",
            "idem:execute:principal-seam",
            &run_id,
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{envelope}");
    assert_eq!(envelope["data"]["disposition"], "awaiting_permission");

    let permission = state
        .with_authoring_store(|store| {
            store.with_read_unit_of_work(CommandKind::RecoverEventStream, |uow| {
                uow.tool_permissions()
                    .latest_for_tool_call(&ToolCallId::new("call_execute_principal_seam").unwrap())
            })
        })
        .unwrap()
        .expect("a permission request was opened");
    assert_eq!(
        permission.requester, requester,
        "the requester is the server-resolved principal, never a body claim"
    );
}

#[tokio::test]
async fn execute_route_read_tool_records_the_call_and_serves_the_prepared_descriptor() {
    // A read tool never dispatches a command: the gate records its permitted
    // `ToolCallRecord` and the caller serves the prepared descriptor — the
    // read itself is pulled through the dedicated read routes.
    let (_dir, state) = fixture_state();
    let requester = agent();
    register_actor(&state, &requester);
    let token = issue_token_in_state(&state, &requester);
    let run_id = seed_run(&state, &token).await;

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        &format!("/v1/runs/{run_id}/agent-tools/execute"),
        &token,
        json!({
            "api_version": "v1",
            "command": "read_context",
            "idempotency_key": "idem:execute:read",
            "payload": {
                "tool_call_id": "call_execute_read_1",
                "name": "read_context",
                "input": { "target": "session", "session_id": "session_http_1" }
            }
        }),
    )
    .await;

    assert_eq!(status, StatusCode::OK, "{envelope}");
    assert_eq!(envelope["data"]["disposition"], "dispatched");
    assert_eq!(envelope["data"]["eligibility"]["allowed"], true);
    assert_eq!(envelope["data"]["result"]["kind"], "read_context");
    assert_eq!(
        envelope["data"]["result"]["input"]["target"], "session",
        "the prepared read descriptor is served, not a command outcome: {envelope}"
    );
    assert_eq!(
        envelope["data"]["tool_call_record"]["permitted"], true,
        "the read tool's permitted ToolCallRecord was recorded by the gate: {envelope}"
    );
}

/// COVERAGE GUARD: every MOUNTED mutating route refuses an unregistered actor at the
/// authorization floor — the no-bypass proof. A resolvable token whose actor was never
/// registered as active must be refused (403, `authoring_authorization_denied`) on one
/// representative route of every mutating family (all mutating routes share the single
/// `ResolvedCommand` extractor, so a per-family representative proves the floor). A
/// mutating family whose route is not yet mounted (leases, until its wiring point)
/// answers 404 and is skipped; when it mounts it falls under this assertion.
#[tokio::test]
async fn every_mounted_mutating_route_refuses_an_unregistered_actor() {
    use crate::authoring::api::ROUTE_FIXTURES;

    let (_dir, state) = fixture_state();
    let stranger = ActorRef {
        id: ActorId::new("agent:stranger").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };
    // A live, resolvable token — but the actor is NOT registered as an active actor.
    let token = issue_token_in_state(&state, &stranger);

    let mut seen_families = std::collections::HashSet::new();
    let mut refused_routes = 0;
    for fixture in ROUTE_FIXTURES.iter().filter(|fixture| fixture.mutating) {
        // One representative route per family (request_fixture is family-keyed).
        if !seen_families.insert(fixture.family) {
            continue;
        }
        let path = concrete_authoring_path(fixture.path_template);
        let router = authoring_router(state.clone()).with_state(state.clone());
        let (status, envelope) =
            post_authoring(router, &path, &token, request_fixture(fixture.family)).await;

        if status == StatusCode::NOT_FOUND {
            // The route is not yet mounted (a later W14.P42a wiring point).
            continue;
        }
        assert_eq!(
            status,
            StatusCode::FORBIDDEN,
            "mutating route {} {} must refuse an unregistered actor at the authorization floor: {envelope}",
            fixture.method,
            fixture.path_template,
        );
        assert_eq!(
            envelope["error_kind"], AUTHORIZATION_DENIED_KIND,
            "{}",
            fixture.path_template
        );
        assert!(
            envelope["tiers"]["semantic"]["available"].is_boolean(),
            "the refusal rides the shared tiers envelope: {}",
            fixture.path_template
        );
        refused_routes += 1;
    }
    assert!(
        refused_routes >= 8,
        "the guard must exercise the mounted mutating families (exercised {refused_routes})"
    );
}

/// The run-settle route drives a live run to `Completed`, renders the terminal
/// status straight from the wire, and leaves the session `Active`; a replay of the
/// same completion is idempotent and carries the same terminal snapshot.
#[tokio::test]
async fn complete_run_route_settles_the_run_and_replays_idempotently() {
    let (_dir, state) = fixture_state();
    let requester = agent();
    register_actor(&state, &requester);
    let token = issue_token_in_state(&state, &requester);
    let run_id = seed_run(&state, &token).await;

    let body = json!({
        "api_version": "v1",
        "command": "complete_run",
        "idempotency_key": "idem:complete-route:1",
        "payload": { "summary": "generation finished" }
    });

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        &format!("/v1/runs/{run_id}/complete"),
        &token,
        body.clone(),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{envelope}");
    assert_eq!(envelope["data"]["status"], "completed");
    assert_eq!(envelope["data"]["run_id"], run_id.as_str());
    assert_eq!(
        envelope["data"]["snapshot"]["runs"][0]["status"],
        "completed"
    );
    assert!(
        envelope["data"]["snapshot"]["active_run"].is_null(),
        "a completed run is no longer the session's active run: {envelope}"
    );
    assert_eq!(
        envelope["data"]["snapshot"]["session"]["status"], "active",
        "completing a run leaves the session active for further turns: {envelope}"
    );

    // Same idempotency key → the recorded terminal outcome replays verbatim.
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, replayed) =
        post_authoring(router, &format!("/v1/runs/{run_id}/complete"), &token, body).await;
    assert_eq!(status, StatusCode::OK, "{replayed}");
    assert_eq!(replayed["data"]["status"], "completed");
    assert_eq!(replayed["data"]["run_id"], run_id.as_str());
}

/// NEGATIVE: an unregistered actor is refused at the extractor floor with a redacted
/// 403 — never leaking the offending id, and never a store fault.
#[tokio::test]
async fn an_unregistered_actor_is_refused_before_the_handler() {
    let (_dir, state) = fixture_state();
    let stranger = ActorRef {
        id: ActorId::new("agent:ghost").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };
    let token = issue_token_in_state(&state, &stranger);
    let router = authoring_router(state.clone()).with_state(state.clone());

    let (status, envelope) = post_authoring(
        router,
        "/v1/proposals",
        &token,
        request_fixture(EndpointFamily::Proposal),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{envelope}");
    assert_eq!(envelope["error_kind"], AUTHORIZATION_DENIED_KIND);
    assert!(
        !envelope["error"]
            .as_str()
            .unwrap_or_default()
            .contains("agent:ghost"),
        "the refusal reason must not echo the actor id: {envelope}"
    );
}
