//! Shared fixtures + helpers for the apply test groups (module-decomposition), part 2.

use super::helpers::*;

/// The out-of-band base a rebase / replacement is regenerated against.
pub(super) const EDITED_PLAN_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#agentic-spec-authoring-backend'\ndate: '2026-07-06'\n---\n\n# Plan\n\nedited out of band\n";

pub(super) fn rebase_command(
    principal: AuthenticatedPrincipal,
    changeset: &str,
    expected: &RevisionToken,
    idem: &str,
) -> ResolvedCommand<RebaseProposalRequest> {
    ResolvedCommand::from_principal(
        principal,
        CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::Rebase,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: RebaseProposalRequest {
                changeset_id: ChangesetId::new(changeset).unwrap(),
                expected_revision: expected.clone(),
                summary: "rebase onto the current base".to_string(),
            },
        },
    )
}

pub(super) fn replacement_command(
    principal: AuthenticatedPrincipal,
    source: &str,
    source_expected: &RevisionToken,
    replacement: &str,
    idem: &str,
) -> ResolvedCommand<CreateReplacementProposalRequest> {
    ResolvedCommand::from_principal(
        principal,
        CommandEnvelope {
            api_version: ApiVersion::V1,
            command: CommandKind::Supersede,
            idempotency_key: IdempotencyKey::new(idem).unwrap(),
            payload: CreateReplacementProposalRequest {
                source_changeset_id: ChangesetId::new(source).unwrap(),
                source_expected_revision: source_expected.clone(),
                replacement_changeset_id: ChangesetId::new(replacement).unwrap(),
                summary: "regenerate against the current base".to_string(),
            },
        },
    )
}

/// Create a Draft changeset (via the create handler) and drive it through the real arcs
/// to a `Conflicted` head (a failed apply attempt), returning the conflicted revision.
pub(super) async fn create_and_drive_to_conflicted(
    state: &Arc<AppState>,
    root: &std::path::Path,
    changeset: &str,
) -> RevisionToken {
    register_actor(state, &agent());
    let (_d, principal) = resolved_principal(&agent());
    let created = create_proposal(
        State(state.clone()),
        create_command(
            principal,
            root,
            changeset,
            &format!("idem:create:{changeset}"),
        ),
    )
    .await;
    assert_eq!(created.status(), StatusCode::OK);
    let changeset_id = ChangesetId::new(changeset).unwrap();
    for (offset, status) in [
        ChangesetStatus::Proposed,
        ChangesetStatus::NeedsReview,
        ChangesetStatus::Approved,
        ChangesetStatus::Applying,
        ChangesetStatus::Conflicted,
    ]
    .into_iter()
    .enumerate()
    {
        append_status_revision_for_test(state, &changeset_id, status, 200 + offset as i64);
    }
    latest_changeset_revision_for_test(state, &changeset_id)
}

// ---- W14.P42a S261: review-station routes + Edit/Respond flip -------------------

pub(super) fn human_reviewer_b() -> ActorRef {
    ActorRef {
        id: ActorId::new("human:reviewer-b").unwrap(),
        kind: ActorKind::Human,
        delegated_by: None,
    }
}

pub(super) fn review_claim_body(changeset: &str, idem: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::ClaimReview,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: ReviewClaimRequest {
            changeset_id: ChangesetId::new(changeset).unwrap(),
            ttl_ms: None,
        },
    })
    .unwrap()
}

pub(super) fn review_release_body(changeset: &str, idem: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::ReleaseReview,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: ReviewReleaseRequest {
            changeset_id: ChangesetId::new(changeset).unwrap(),
        },
    })
    .unwrap()
}

pub(super) fn review_respond_body(changeset: &str, comment: &str, idem: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::Respond,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: ReviewRespondRequest {
            changeset_id: ChangesetId::new(changeset).unwrap(),
            comment: comment.to_string(),
        },
    })
    .unwrap()
}

pub(super) fn child_input_from_latest(
    child: &crate::authoring::ledger::ChangesetChildOperationRecord,
) -> ChangesetChildOperationInput {
    ChangesetChildOperationInput {
        child_key: child.child_key.clone(),
        operation: child.operation,
        target: child.target.clone(),
        materialized_operation: child.materialized_operation.clone(),
        material_digest: child.material_digest.clone(),
        validation_digest: child.validation_digest.clone(),
    }
}

pub(super) fn append_status_revision_for_test(
    state: &AppState,
    changeset_id: &ChangesetId,
    status: ChangesetStatus,
    created_at_ms: i64,
) {
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::RequestApply, |uow| {
                let system = system_actor();
                uow.actors().put_record(ActorRecordInput::active(
                    system.clone(),
                    ActorDisplayMetadata::new("System", Some("Operation mode policy".to_string())),
                    created_at_ms,
                ))?;
                let latest = uow.ledger().latest(changeset_id)?.unwrap();
                let next = ChangesetAggregateRecord::new(ChangesetRevisionInput {
                    changeset_id: changeset_id.clone(),
                    previous_revision: Some(latest.changeset_revision.clone()),
                    kind: latest.kind,
                    status,
                    session_id: latest.session_id.clone(),
                    actor: system,
                    summary: latest.summary.clone(),
                    children: latest
                        .children
                        .iter()
                        .map(child_input_from_latest)
                        .collect(),
                    created_at_ms,
                })
                .map_err(|err| StoreError::Ledger(err.to_string()))?;
                uow.ledger().append_revision(&next)
            })
        })
        .unwrap();
}

// --- mutating command handlers: apply + rollback -------------------------

pub(super) fn apply_command(
    principal: AuthenticatedPrincipal,
    changeset: &str,
    approval: &str,
    idem: &str,
) -> ResolvedCommand<ApplyRequestDto> {
    let envelope = CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::RequestApply,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: ApplyRequestDto {
            changeset_id: ChangesetId::new(changeset).unwrap(),
            approval_id: ApprovalId::new(approval).unwrap(),
            fencing_token: None,
        },
    };
    ResolvedCommand::from_principal(principal, envelope)
}

pub(super) fn rollback_command(
    principal: AuthenticatedPrincipal,
    source: &str,
    idem: &str,
) -> ResolvedCommand<RollbackRequestDto> {
    let envelope = CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::CreateRollback,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: RollbackRequestDto {
            source_changeset_id: ChangesetId::new(source).unwrap(),
            source_children: vec![RollbackChildSource {
                source_child_key: "child_1".to_string(),
            }],
            reason: "restore reviewed preimage".to_string(),
        },
    };
    ResolvedCommand::from_principal(principal, envelope)
}

// --- the middleware, exercised through a real router (oneshot) -------------

pub(super) async fn probe(Extension(resolution): Extension<PrincipalResolution>) -> String {
    match resolution {
        PrincipalResolution::Resolved(principal) => {
            format!("resolved:{}", principal.actor().id.as_str())
        }
        PrincipalResolution::Denied(PrincipalDenial::MissingToken) => "denied:missing".into(),
        PrincipalResolution::Denied(PrincipalDenial::UnknownPrincipal) => "denied:unknown".into(),
        PrincipalResolution::Unavailable => "unavailable".into(),
    }
}

pub(super) fn probe_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/probe", post(probe))
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            resolve_principal_layer,
        ))
        .with_state(state)
}

/// Issue a live token into the STATE's own authoring store (the one the
/// middleware resolves against), timestamped at real wall-clock now so it is
/// live when the middleware resolves it.
pub(super) fn issue_token_in_state(state: &AppState, actor: &ActorRef) -> String {
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                Ok(uow.actor_tokens().issue(
                    actor,
                    &ActorId::new("system:bootstrap").unwrap(),
                    now_ms(),
                    3_600_000,
                ))
            })
        })
        .unwrap()
        .unwrap()
        .raw_token
}

pub(super) async fn probe_body(router: Router, header: Option<&str>) -> String {
    let mut builder = Request::builder().method("POST").uri("/probe");
    if let Some(token) = header {
        builder = builder.header(AUTHORING_ACTOR_TOKEN_HEADER, token);
    }
    let response = router
        .oneshot(builder.body(Body::empty()).unwrap())
        .await
        .unwrap();
    let bytes = to_bytes(response.into_body(), 1 << 20).await.unwrap();
    String::from_utf8_lossy(&bytes).into_owned()
}

// ---- W12.P41 A2: tool-permission decision + interrupt resume routes -------------

pub(super) fn seed_pending_permission(state: &AppState, requester: &ActorRef, tool_call_id: &str) {
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::RequestToolPermission, |uow| {
                uow.tool_permissions().request_permission(
                    crate::authoring::permissions::ToolPermissionRequestInput {
                        tool_call_id: ToolCallId::new(tool_call_id).unwrap(),
                        tool: crate::authoring::tools::SemanticToolName::ProposeChangeset,
                        scope_id: "worktree".to_string(),
                        requester: requester.clone(),
                        scope_mode: crate::authoring::policy::OperationMode::Manual,
                        session_override: None,
                        idempotency_key: format!("idem:seed:{tool_call_id}"),
                        created_at_ms: now_ms(),
                        ttl_ms: None,
                    },
                )?;
                Ok(())
            })
        })
        .unwrap();
}

// ---- W12.P41 A3b: the agent-tool executor `/execute` route ----------------

/// Start a real prompt turn over the `session_http_1` session `register_actor`
/// seeds, returning the fresh `run_id` — the executor's ONLY per-run dependency
/// (the gate itself never validates the run exists; only a dispatched mutating
/// command like `cancel_run` does).
pub(super) async fn seed_run(state: &Arc<AppState>, token: &str) -> RunId {
    let router = authoring_router(state.clone()).with_state(state.clone());
    let (status, envelope) = post_authoring(
        router,
        "/v1/sessions/session_http_1/turns",
        token,
        json!({
            "api_version": "v1",
            "command": "start_prompt_turn",
            "idempotency_key": "idem:execute-tests:seed-run",
            "payload": { "prompt": "draft a plan" }
        }),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "seed run: {envelope}");
    RunId::new(envelope["data"]["run_id"].as_str().expect("run_id")).unwrap()
}

pub(super) fn execute_cancel_run_body(tool_call_id: &str, idem: &str, run_id: &RunId) -> Value {
    json!({
        "api_version": "v1",
        "command": "cancel_run",
        "idempotency_key": idem,
        "payload": {
            "tool_call_id": tool_call_id,
            "name": "cancel",
            "idempotency_key": format!("idem:tool:{tool_call_id}"),
            "input": {
                "target": "run",
                "run_id": run_id.as_str(),
                "reason": "no longer needed"
            }
        }
    })
}

// ---- W14.P42a: route-layer authorization wiring --------------------------------

/// A resolvable actor whose delegation names an absent delegator — the delegation
/// standing guard (confused-deputy fence) must refuse it even though the actor itself
/// is registered and active.
pub(super) fn delegated_agent() -> ActorRef {
    ActorRef {
        id: ActorId::new("agent:delegate").unwrap(),
        kind: ActorKind::Agent,
        delegated_by: Some(ActorId::new("human:absent").unwrap()),
    }
}

/// A registered System actor: it passes the standing guard but is refused at the
/// tool-requester guard (a System actor's authority is the policy auto-approve lane,
/// never the semantic tool surface).
pub(super) fn system_requester() -> ActorRef {
    ActorRef {
        id: ActorId::new("system:runner").unwrap(),
        kind: ActorKind::System,
        delegated_by: None,
    }
}

/// Turn a `ROUTE_FIXTURES` path template into a concrete path against the authoring
/// sub-router: drop the `/authoring` nest prefix and substitute each `{param}` with a
/// valid concrete id (the authorization floor refuses before the handler reads it).
pub(super) fn concrete_authoring_path(template: &str) -> String {
    let stripped = template.strip_prefix("/authoring").unwrap_or(template);
    stripped
        .split('/')
        .map(|segment| match segment {
            "{changeset_id}" => "changeset_1",
            "{approval_id}" => "approval_1",
            "{tool_call_id}" => "tool_call_1",
            "{interrupt_id}" => "interrupt_1",
            "{run_id}" => "run_1",
            "{session_id}" => "session_1",
            other if other.starts_with('{') => "placeholder",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// A create-proposal body whose single operation targets an EXISTING document claiming
/// `foreign_scope` — a spoofed cross-workspace target the document-scope guard refuses.
pub(super) fn create_proposal_targeting_scope(changeset_id: &str, foreign_scope: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::CreateProposal,
        idempotency_key: IdempotencyKey::new("idem:create:crossscope").unwrap(),
        payload: CreateProposalRequest {
            session_id: SessionId::new("session_cross_1").unwrap(),
            changeset_id: ChangesetId::new(changeset_id).unwrap(),
            summary: "targets a document by scope".to_string(),
            operations: vec![ChangesetChildOperationDraft {
                child_key: "child_1".to_string(),
                operation: ChangesetOperationKind::ReplaceBody,
                target: TargetRevisionFence {
                    document: DocumentRef::Existing {
                        scope: foreign_scope.to_string(),
                        node_id: "doc:adr-1".to_string(),
                        stem: "adr-1".to_string(),
                        path: ".vault/adr/adr-1.md".to_string(),
                        doc_type: "adr".to_string(),
                        base_revision: RevisionToken::new("blob:base").unwrap(),
                    },
                    base_revision: Some(RevisionToken::new("blob:base").unwrap()),
                    current_revision: None,
                },
                draft: DraftMutation {
                    mode: DraftMode::WholeDocument,
                    body: "rewritten body".to_string(),
                    frontmatter: None,
                    new_stem: None,
                    section_selector: None,
                    plan_step: None,
                },
            }],
        },
    })
    .unwrap()
}

// ---- W14.P42a S258: advisory lease routes --------------------------------------

pub(super) fn lease_target() -> DocumentRef {
    DocumentRef::Existing {
        scope: "scope_a".to_string(),
        node_id: "doc:adr-1".to_string(),
        stem: "adr-1".to_string(),
        path: ".vault/adr/adr-1.md".to_string(),
        doc_type: "adr".to_string(),
        base_revision: RevisionToken::new("blob:base").unwrap(),
    }
}

pub(super) fn lease_acquire_body(idem: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::AcquireLease,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: LeaseAcquireRequest {
            target: lease_target(),
            purpose: crate::authoring::leases::LeasePurpose::WholeDocument,
            ttl_ms: Some(60_000),
        },
    })
    .unwrap()
}

pub(super) fn lease_release_body(idem: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::ReleaseLease,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: LeaseReleaseRequest {
            target: lease_target(),
        },
    })
    .unwrap()
}

pub(super) const COMMENT_DOC_REL: &str = ".vault/plan/comment-fixture.md";

// The node id resolves through the confined resolver: `doc:` + the file stem, so it
// maps to `.vault/plan/comment-fixture.md` (never a client-supplied path).
pub(super) const COMMENT_NODE_ID: &str = "doc:comment-fixture";

pub(super) fn write_worktree_doc(state: &AppState, rel_path: &str, text: &str) {
    let path = state.active_workspace_root().join(rel_path);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, text).unwrap();
}

/// Build a section selector for `heading` in `body`, computing the exact expected
/// content hash the way the frontend would from the live section — the section is
/// the heading line through the next same-or-shallower heading (here, EOF).
pub(super) fn selector_for(section_bytes: &str, heading: &str) -> SectionSelector {
    SectionSelector {
        heading_path: vec![heading.to_string()],
        range_hint: None,
        expected_content_hash: ingest_struct::reader::blob_oid(section_bytes.as_bytes()),
    }
}

pub(super) fn create_comment_envelope(idem: &str, selector: SectionSelector, body: &str) -> Value {
    serde_json::to_value(CommandEnvelope {
        api_version: ApiVersion::V1,
        command: CommandKind::CreateComment,
        idempotency_key: IdempotencyKey::new(idem).unwrap(),
        payload: CreateCommentRequest {
            selector,
            body: body.to_string(),
        },
    })
    .unwrap()
}

pub(super) async fn send_authoring(
    router: Router,
    method: &str,
    uri: &str,
    token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    if let Some(token) = token {
        builder = builder.header(AUTHORING_ACTOR_TOKEN_HEADER, token);
    }
    let request = match body {
        Some(body) => builder
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    };
    let response = router.oneshot(request).await.unwrap();
    let status = response.status();
    (status, json_body(response).await)
}
