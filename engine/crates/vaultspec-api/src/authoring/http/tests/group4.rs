//! Acknowledge test group (module-decomposition, W10 split). See ./helpers.rs.

use super::helpers::*;
use super::helpers2::*;

/// W10: a valid acknowledge over an applied changeset inserts a durable record and
/// increments the `AppliedUnderPolicyProjection`'s `acknowledgement_count`; a replay
/// with the SAME idempotency key serves the identical record rather than
/// double-counting.
#[tokio::test]
async fn acknowledge_route_inserts_a_durable_record_and_replays_idempotently() {
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_ack_1").await;
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
    let decision = submit_review_decision(
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
    assert_eq!(decision.status(), StatusCode::OK);

    let changeset_id = ChangesetId::new("changeset_ack_1").unwrap();
    append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Applying, 2000);
    append_status_revision_for_test(&state, &changeset_id, ChangesetStatus::Applied, 2001);

    let acknowledger = human_reviewer_b();
    register_actor(&state, &acknowledger);
    let (_d2, ack_principal) = resolved_principal(&acknowledger);
    let response = acknowledge_applied_change(
        State(state.clone()),
        axum::extract::Path("changeset_ack_1".to_string()),
        acknowledge_command(ack_principal, "changeset_ack_1", &approval_id, "idem:ack:1"),
    )
    .await;
    let status = response.status();
    let body = json_body(response).await;
    assert_eq!(status, StatusCode::OK, "acknowledge failed: {body}");
    assert_eq!(body["data"]["changeset_id"], "changeset_ack_1");
    assert_eq!(body["data"]["approval_id"], approval_id);
    assert_eq!(body["data"]["reviewer"]["id"], "human:reviewer-b");
    assert_eq!(body["data"]["comment"], "seen");

    let count_after_first = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.modes().acknowledgement_count(&changeset_id)
            })
        })
        .unwrap();
    assert_eq!(count_after_first, 1);

    // A replay with the SAME idempotency key serves the identical record — no
    // double count.
    let (_d3, replay_principal) = resolved_principal(&acknowledger);
    let replay = acknowledge_applied_change(
        State(state.clone()),
        axum::extract::Path("changeset_ack_1".to_string()),
        acknowledge_command(
            replay_principal,
            "changeset_ack_1",
            &approval_id,
            "idem:ack:1",
        ),
    )
    .await;
    let replay_status = replay.status();
    let replay_body = json_body(replay).await;
    assert_eq!(replay_status, StatusCode::OK, "{replay_body}");
    assert_eq!(
        replay_body["data"]["created_at_ms"],
        body["data"]["created_at_ms"]
    );

    let count_after_replay = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
                uow.modes().acknowledgement_count(&changeset_id)
            })
        })
        .unwrap();
    assert_eq!(
        count_after_replay, 1,
        "an idempotent replay never double-counts"
    );
}

/// A path/body changeset id mismatch is a typed 400, never a silently-ignored field.
#[tokio::test]
async fn acknowledge_route_rejects_a_path_body_changeset_mismatch() {
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_ack_mismatch").await;
    let approval_id = submitted["data"]["approval"]["approval_id"]
        .as_str()
        .unwrap()
        .to_string();

    register_actor(&state, &human_reviewer());
    let (_d, reviewer) = resolved_principal(&human_reviewer());
    let response = acknowledge_applied_change(
        State(state.clone()),
        axum::extract::Path("some_other_changeset".to_string()),
        acknowledge_command(
            reviewer,
            "changeset_ack_mismatch",
            &approval_id,
            "idem:ack:mismatch",
        ),
    )
    .await;
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

/// COVERAGE: the acknowledge route refuses an unregistered actor at the SAME
/// route-layer authorization floor as every other mutating command.
#[tokio::test]
async fn acknowledge_route_refuses_an_unregistered_actor() {
    let (dir, state) = fixture_state();
    let submitted = create_then_submit(&state, dir.path(), "changeset_ack_stranger").await;
    let approval_id = submitted["data"]["approval"]["approval_id"]
        .as_str()
        .unwrap()
        .to_string();

    let stranger = ActorRef {
        id: ActorId::new("agent:ack-stranger").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    };
    let token = issue_token_in_state(&state, &stranger);

    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/proposals/changeset_ack_stranger/acknowledge",
        &token,
        serde_json::to_value(CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::Acknowledge,
            idempotency_key: IdempotencyKey::new("idem:ack:stranger").unwrap(),
            payload: AcknowledgeAppliedRequest {
                changeset_id: ChangesetId::new("changeset_ack_stranger").unwrap(),
                approval_id: ApprovalId::new(&approval_id).unwrap(),
                comment: None,
            },
        })
        .unwrap(),
    )
    .await;

    assert_eq!(status, StatusCode::FORBIDDEN, "{envelope}");
    assert_eq!(envelope["error_kind"], AUTHORIZATION_DENIED_KIND);
}
