//! Shared fixtures + helpers for the apply test groups (module-decomposition), part 1.
//! Every group file does `use super::helpers::*` (+ `use super::helpers2::*`).

pub(super) use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
pub(super) use crate::authoring::api::{
    ApiVersion, ChangesetChildOperationDraft, ChangesetOperationKind, CreateSessionRequest,
    DirectWriteRequest, DraftMode, DraftMutation, EndpointFamily, RollbackChildSource,
    TargetRevisionFence, request_fixture,
};
pub(super) use crate::authoring::api::{
    ApplyRequest as ApplyRequestDto, CommentUpdateRequest, CreateCommentRequest,
    CreateProposalRequest, DeleteCommentRequest, IssueActorTokenRequest, LeaseAcquireRequest,
    LeaseReleaseRequest, ReviewClaimRequest, ReviewDecisionRequest, ReviewReleaseRequest,
    ReviewRespondRequest, RollbackRequest as RollbackRequestDto, SetOperationModeRequest,
    SubmitForReviewRequest,
};
pub(super) use crate::authoring::apply::ApplyOutcome;
pub(super) use crate::authoring::documents::{DocumentResolver, ExistingDocumentLookup};
pub(super) use crate::authoring::http::*;
pub(super) use crate::authoring::ledger::ChangesetAggregateRecord;
pub(super) use crate::authoring::ledger::{ChangesetChildOperationInput, ChangesetRevisionInput};
pub(super) use crate::authoring::model::{
    ActorId, ActorKind, ActorRef, DocumentRef, IdempotencyKey, SessionId,
};
pub(super) use crate::authoring::model::{
    ApprovalId, ChangesetId, ChangesetStatus, InterruptId, ProposalId, ReviewDecisionKind,
    RevisionToken, RunId, ToolCallId,
};
pub(super) use crate::authoring::modes::{scope_id_for_worktree, system_actor};
pub(super) use crate::authoring::policy::OperationMode;
pub(super) use crate::authoring::proposal::{
    ProposalCommandContext, ProposalCommandResult, SubmitProposalRequest, ValidateProposalRequest,
    validation_evidence,
};
pub(super) use crate::authoring::rebase::{
    CreateReplacementProposalRequest, RebaseProposalRequest,
};
pub(super) use crate::authoring::rollback::RollbackOutcome;
pub(super) use crate::authoring::snapshots::SnapshotReader;
pub(super) use crate::authoring::store::Store;
pub(super) use axum::body::{Body, to_bytes};
pub(super) use axum::routing::post;
pub(super) use axum::{Extension, Router};
pub(super) use ingest_struct::reader::blob_oid;
pub(super) use serde_json::{Value, json};
pub(super) use std::path::Path;
pub(super) use std::process::Command;
pub(super) use tower::ServiceExt;
// --- section-anchored comment routes (authoring-surface ADR D2) --------------

pub(super) use crate::authoring::sections::SectionSelector;

pub(super) fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::write(
        dir.path()
            .join(".vault/plan/2026-06-30-authoring-http-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#authoring'\n---\n\nbody\n",
    )
    .unwrap();
    let state = crate::app::build_state(dir.path().to_path_buf());
    (dir, state)
}

pub(super) fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .current_dir(root)
        .args(args)
        .env("GIT_AUTHOR_NAME", "authoring-http")
        .env("GIT_AUTHOR_EMAIL", "authoring-http@example.invalid")
        .env("GIT_COMMITTER_NAME", "authoring-http")
        .env("GIT_COMMITTER_EMAIL", "authoring-http@example.invalid")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

pub(super) fn scaffold_vaultspec_workspace(root: &Path) {
    let output = Command::new("uv")
        .current_dir(root)
        .args([
            "run",
            "--no-sync",
            "vaultspec-core",
            "install",
            "--target",
            ".",
        ])
        .output()
        .expect("vaultspec-core install command runs");
    assert!(
        output.status.success() && root.join(".vaultspec").is_dir(),
        "real vaultspec-core install must succeed for authoring HTTP acceptance tests: {}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

pub(super) fn fixture_state_with_core() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    git(dir.path(), &["init", "-b", "main", "."]);
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::write(
        dir.path().join(".vault/plan/operation-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n",
    )
    .unwrap();
    scaffold_vaultspec_workspace(dir.path());
    git(dir.path(), &["add", "."]);
    git(dir.path(), &["commit", "-m", "authoring http fixture"]);
    let state = crate::app::build_state(dir.path().to_path_buf());
    (dir, state)
}

pub(super) fn agent() -> ActorRef {
    ActorRef {
        id: ActorId::new("agent:writer").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: None,
    }
}

/// Mint a live token in a temporary authoring store and resolve it to an
/// `AuthenticatedPrincipal` — the same path the middleware takes, so the test
/// never fabricates a principal (there is no public constructor).
pub(super) fn resolved_principal(actor: &ActorRef) -> (tempfile::TempDir, AuthenticatedPrincipal) {
    let dir = tempfile::tempdir().unwrap();
    let mut store = Store::open(&dir.path().join(".vault")).unwrap();
    let raw = store
        .with_unit_of_work(CommandKind::CreateSession, |uow| {
            Ok(uow.actor_tokens().issue(
                actor,
                &ActorId::new("system:bootstrap").unwrap(),
                100,
                3_600_000,
            ))
        })
        .unwrap()
        .unwrap()
        .raw_token;
    let principal = store
        .with_unit_of_work(CommandKind::CreateSession, |uow| {
            Ok(resolve_principal(&uow.actor_tokens(), Some(raw.as_str()), 200).unwrap())
        })
        .unwrap();
    (dir, principal)
}

pub(super) fn request(resolution: Option<PrincipalResolution>, body: &Value) -> Request {
    let mut req = Request::builder()
        .method("POST")
        .uri("/authoring/v1/sessions")
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap();
    if let Some(resolution) = resolution {
        req.extensions_mut().insert(resolution);
    }
    req
}

pub(super) async fn extract(
    state: &Arc<AppState>,
    resolution: Option<PrincipalResolution>,
    body: &Value,
) -> Result<ResolvedCommand<CreateSessionRequest>, (StatusCode, Value)> {
    match ResolvedCommand::<CreateSessionRequest>::from_request(request(resolution, body), state)
        .await
    {
        Ok(command) => Ok(command),
        Err(rejection) => {
            let response = rejection.into_response();
            let status = response.status();
            let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
            Err((status, serde_json::from_slice(&bytes).unwrap()))
        }
    }
}

pub(super) fn direct_write_envelope_for(payload: DirectWriteRequest, idem: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::DirectWrite,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload,
    })
    .unwrap()
}

pub(super) fn direct_write_envelope(
    doc_ref: &str,
    body: &str,
    expected: &str,
    idem: &str,
) -> Value {
    direct_write_envelope_for(
        DirectWriteRequest {
            doc_ref: Some(doc_ref.to_string()),
            operation: ChangesetOperationKind::ReplaceBody,
            body: body.to_string(),
            frontmatter: None,
            new_stem: None,
            create: None,
            plan_step: None,
            expected_blob_hash: Some(expected.to_string()),
            summary: Some("route editor save".to_string()),
            scope: None,
        },
        idem,
    )
}

pub(super) fn direct_write_frontmatter_envelope(
    doc_ref: &str,
    date: &str,
    expected: &str,
    idem: &str,
) -> Value {
    direct_write_envelope_for(
        DirectWriteRequest {
            doc_ref: Some(doc_ref.to_string()),
            operation: ChangesetOperationKind::EditFrontmatter,
            body: String::new(),
            frontmatter: Some(crate::authoring::api::FrontmatterEditFields {
                date: Some(date.to_string()),
                tags: None,
                related: None,
            }),
            new_stem: None,
            create: None,
            plan_step: None,
            expected_blob_hash: Some(expected.to_string()),
            summary: Some("route editor frontmatter save".to_string()),
            scope: None,
        },
        idem,
    )
}

pub(super) fn direct_write_rename_envelope(
    doc_ref: &str,
    new_stem: &str,
    expected: &str,
    idem: &str,
) -> Value {
    direct_write_envelope_for(
        DirectWriteRequest {
            doc_ref: Some(doc_ref.to_string()),
            operation: ChangesetOperationKind::Rename,
            body: String::new(),
            frontmatter: None,
            new_stem: Some(new_stem.to_string()),
            create: None,
            plan_step: None,
            expected_blob_hash: Some(expected.to_string()),
            summary: Some("route editor rename save".to_string()),
            scope: None,
        },
        idem,
    )
}

pub(super) fn direct_write_create_envelope(
    doc_type: &str,
    feature: &str,
    title: &str,
    idem: &str,
) -> Value {
    direct_write_envelope_for(
        DirectWriteRequest {
            doc_ref: None,
            operation: ChangesetOperationKind::CreateDocument,
            body: String::new(),
            frontmatter: None,
            new_stem: None,
            create: Some(crate::authoring::api::DirectWriteCreateParams {
                doc_type: doc_type.to_string(),
                feature: feature.to_string(),
                title: title.to_string(),
                related: Vec::new(),
            }),
            plan_step: None,
            expected_blob_hash: None,
            summary: Some("route editor new document".to_string()),
            scope: None,
        },
        idem,
    )
}

pub(super) async fn post_authoring(
    router: Router,
    uri: &str,
    token: &str,
    body: Value,
) -> (StatusCode, Value) {
    let response = router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(uri)
                .header("content-type", "application/json")
                .header(AUTHORING_ACTOR_TOKEN_HEADER, token)
                .body(Body::from(body.to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let body = json_body(response).await;
    (status, body)
}

// --- mutating command handler: create proposal ----------------------------

/// Register `actor` in the authoring actor registry (P19) of the state's own
/// store — an authoring command requires a registered, active actor.
pub(super) fn register_actor(state: &AppState, actor: &ActorRef) {
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                uow.actors().put_record(ActorRecordInput::active(
                    actor.clone(),
                    ActorDisplayMetadata {
                        display_name: "Test Actor".to_string(),
                        display_summary: None,
                    },
                    now_ms(),
                ))?;
                uow.sessions().create_session(
                    SessionId::new("session_http_1").unwrap(),
                    CreateSessionRequest {
                        scope: "http-tests".to_string(),
                        title: "HTTP test session".to_string(),
                    },
                    actor.clone(),
                    now_ms(),
                )?;
                Ok(())
            })
        })
        .unwrap();
}

/// A `create_proposal` command over a real seeded existing document with a
/// single `ReplaceBody` operation whose base/current revision matches the
/// worktree (the skeleton materializes ReplaceBody, not CreateDocument). The
/// same seed + request is reproducible, so a duplicate replays idempotently.
pub(super) fn create_command(
    principal: AuthenticatedPrincipal,
    root: &Path,
    changeset: &str,
    idem: &str,
) -> ResolvedCommand<CreateProposalRequest> {
    let doc_path = root.join(".vault/plan/operation-plan.md");
    std::fs::create_dir_all(doc_path.parent().unwrap()).unwrap();
    std::fs::write(
        &doc_path,
        "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n",
    )
    .unwrap();
    let document = DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem("operation-plan".to_string()))
        .unwrap();
    let DocumentRef::Existing { base_revision, .. } = &document else {
        unreachable!("resolved an existing document");
    };
    let revision = base_revision.clone();
    let envelope = CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::CreateProposal,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: CreateProposalRequest {
            session_id: SessionId::new("session_http_1").unwrap(),
            changeset_id: ChangesetId::new(changeset).unwrap(),
            summary: "create a plan".to_string(),
            operations: vec![ChangesetChildOperationDraft {
                child_key: "child_1".to_string(),
                operation: ChangesetOperationKind::ReplaceBody,
                target: TargetRevisionFence {
                    document: document.clone(),
                    base_revision: Some(revision.clone()),
                    current_revision: Some(revision),
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: "---\ntags:\n  - '#plan'\n---\n\n# Plan\n\nnew body\n".to_string(),
                    frontmatter: None,
                    new_stem: None,
                    section_selector: None,
                    plan_step: None,
                },
            }],
        },
    };
    ResolvedCommand::from_principal(principal, envelope)
}

pub(super) fn create_body_command(
    principal: AuthenticatedPrincipal,
    root: &Path,
    changeset: &str,
    idem: &str,
    body: &str,
) -> ResolvedCommand<CreateProposalRequest> {
    let doc_path = root.join(".vault/plan/operation-plan.md");
    std::fs::create_dir_all(doc_path.parent().unwrap()).unwrap();
    std::fs::write(
        &doc_path,
        "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nbase\n",
    )
    .unwrap();
    let document = DocumentResolver::for_worktree(root)
        .resolve_existing(ExistingDocumentLookup::Stem("operation-plan".to_string()))
        .unwrap();
    let DocumentRef::Existing { base_revision, .. } = &document else {
        unreachable!("resolved an existing document");
    };
    let revision = base_revision.clone();
    let envelope = CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::CreateProposal,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: CreateProposalRequest {
            session_id: SessionId::new("session_http_1").unwrap(),
            changeset_id: ChangesetId::new(changeset).unwrap(),
            summary: "create a plan".to_string(),
            operations: vec![ChangesetChildOperationDraft {
                child_key: "child_1".to_string(),
                operation: ChangesetOperationKind::ReplaceBody,
                target: TargetRevisionFence {
                    document: document.clone(),
                    base_revision: Some(revision.clone()),
                    current_revision: Some(revision),
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: body.to_string(),
                    frontmatter: None,
                    new_stem: None,
                    section_selector: None,
                    plan_step: None,
                },
            }],
        },
    };
    ResolvedCommand::from_principal(principal, envelope)
}

pub(super) fn mode_command(
    principal: AuthenticatedPrincipal,
    mode: OperationMode,
    idem: &str,
) -> ResolvedCommand<SetOperationModeRequest> {
    ResolvedCommand::from_principal(
        principal,
        CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::SetOperationMode,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: SetOperationModeRequest { mode },
        },
    )
}

// --- mutating command handlers: submit for review + review decision -------

pub(super) async fn json_body(response: Response) -> Value {
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    serde_json::from_slice(&bytes).unwrap()
}

pub(super) fn human_reviewer() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:reviewer").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

pub(super) fn submit_command(
    principal: AuthenticatedPrincipal,
    expected_revision: &str,
    idem: &str,
) -> ResolvedCommand<SubmitForReviewRequest> {
    let envelope = CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::SubmitForReview,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: SubmitForReviewRequest {
            expected_revision: RevisionToken::new(expected_revision).unwrap(),
            summary: "submit for review".to_string(),
        },
    };
    ResolvedCommand::from_principal(principal, envelope)
}

pub(super) fn decision_command(
    principal: AuthenticatedPrincipal,
    approval_id: &str,
    proposal_id: &str,
    reviewed_revision: &str,
    decision: ReviewDecisionKind,
) -> ResolvedCommand<ReviewDecisionRequest> {
    let command = match decision {
        ReviewDecisionKind::Reject => CommandKind::Reject,
        _ => CommandKind::Approve,
    };
    let envelope = CommandEnvelope {
        api_version: ApiVersion::V1,
        command,
        idempotency_key: IdempotencyKey::new(format!("idem:decision:{approval_id}")).unwrap(),
        payload: ReviewDecisionRequest {
            proposal_id: ProposalId::new(proposal_id).unwrap(),
            approval_id: ApprovalId::new(approval_id).unwrap(),
            decision,
            reviewed_revision: RevisionToken::new(reviewed_revision).unwrap(),
            comment: Some("decision".to_string()),
        },
    };
    ResolvedCommand::from_principal(principal, envelope)
}

/// Drive create → submit over the real handlers (the proposer is `agent()`,
/// registered here), returning the parsed submit response for the review tests.
pub(super) async fn create_then_submit(
    state: &Arc<AppState>,
    root: &std::path::Path,
    changeset: &str,
) -> Value {
    register_actor(state, &agent());
    let (_d1, p1) = resolved_principal(&agent());
    let created = create_proposal(
        State(state.clone()),
        create_command(p1, root, changeset, &format!("idem:create:{changeset}")),
    )
    .await;
    assert_eq!(created.status(), StatusCode::OK);
    let created_body = json_body(created).await;
    let revision = created_body["data"]["changeset_revision"]
        .as_str()
        .expect("create returns the draft revision")
        .to_string();

    let (_d2, p2) = resolved_principal(&agent());
    let response = submit_for_review(
        State(state.clone()),
        axum::extract::Path(changeset.to_string()),
        submit_command(p2, &revision, &format!("idem:submit:{changeset}")),
    )
    .await;
    let status = response.status();
    let body = json_body(response).await;
    assert_eq!(status, StatusCode::OK, "submit failed: {body}");
    body
}

// ---- W14.P42a S260: explicit rebase / replacement routes ------------------------

pub(super) fn latest_changeset_revision_for_test(
    state: &AppState,
    changeset_id: &ChangesetId,
) -> RevisionToken {
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow
                    .ledger()
                    .latest(changeset_id)?
                    .expect("changeset exists")
                    .changeset_revision)
            })
        })
        .unwrap()
}

pub(super) fn changeset_status_for_test(
    state: &AppState,
    changeset_id: &ChangesetId,
) -> ChangesetStatus {
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateProposal, |uow| {
                Ok(uow
                    .ledger()
                    .latest(changeset_id)?
                    .expect("changeset exists")
                    .status)
            })
        })
        .unwrap()
}
