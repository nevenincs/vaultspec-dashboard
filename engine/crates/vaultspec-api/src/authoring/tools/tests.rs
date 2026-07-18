use super::*;
use serde_json::json;

use crate::authoring::api::{
    ChangesetChildOperationDraft, ChangesetOperationKind, DraftMode, DraftMutation,
    TargetRevisionFence,
};
use crate::authoring::model::{
    ApprovalId, DocumentRef, ProvisionalCollisionStatus, SessionId, ToolCallId,
};

fn tool_call(name: &str, idempotency_key: Option<&str>, input: Value) -> AgentToolCall {
    AgentToolCall {
        tool_call_id: ToolCallId::new("tool_call_1").unwrap(),
        name: name.to_string(),
        idempotency_key: idempotency_key.map(|value| IdempotencyKey::new(value).unwrap()),
        input,
    }
}

fn changeset_id() -> ChangesetId {
    ChangesetId::new("changeset_1").unwrap()
}

fn revision() -> RevisionToken {
    RevisionToken::new("rev_1").unwrap()
}

fn session_id() -> SessionId {
    SessionId::new("session_1").unwrap()
}

fn approval_id() -> ApprovalId {
    ApprovalId::new("approval_1").unwrap()
}

fn create_payload() -> Value {
    json!({
        "operation": "create",
        "session_id": "session_1",
        "changeset_id": "changeset_1",
        "summary": "Draft proposal",
        "operations": [operation()]
    })
}

fn operation() -> Value {
    json!({
        "child_key": "child_1",
        "operation": "replace_body",
        "target": {
            "document": existing_doc_ref(),
            "base_revision": "rev_1"
        },
        "draft": {
            "mode": "whole_document",
            "body": "# Updated\n"
        }
    })
}

fn existing_doc_ref() -> Value {
    json!({
        "kind": "existing",
        "scope": "scope_1",
        "node_id": "doc:one",
        "stem": "one",
        "path": ".vault/adr/one.md",
        "doc_type": "adr",
        "base_revision": "rev_1"
    })
}

#[test]
fn catalog_lists_only_the_seven_semantic_agent_tools() {
    let catalog = catalog();
    let names: Vec<_> = catalog.tools.iter().map(|tool| tool.name).collect();

    assert_eq!(
        names,
        vec![
            "read_context",
            "search_graph",
            "propose_changeset",
            "validate_proposal",
            "request_approval",
            "cancel",
            "request_apply"
        ]
    );
    assert!(
        names
            .iter()
            .all(|name| !name.contains("core") && !name.contains("vault"))
    );
    let propose = catalog
        .tools
        .iter()
        .find(|tool| tool.name == "propose_changeset")
        .unwrap();
    assert_eq!(
        propose.commands,
        vec![
            CommandKind::CreateProposal,
            CommandKind::AppendDraft,
            CommandKind::ReplaceDraft
        ],
        "the catalog advertises every proposal dispatch alias"
    );
    let cancel = catalog
        .tools
        .iter()
        .find(|tool| tool.name == "cancel")
        .unwrap();
    assert_eq!(
        cancel.commands,
        vec![CommandKind::CancelProposal, CommandKind::CancelRun],
        "the catalog advertises both cancel targets"
    );
}

#[test]
fn core_shaped_and_unknown_tool_names_are_rejected_before_dispatch() {
    let direct = prepare_tool_call(tool_call("direct_write", Some("idem:direct"), json!({})));
    assert_eq!(
        direct.unwrap_err(),
        ToolError::CoreShapedTool("direct_write".to_string())
    );

    let core = prepare_tool_call(tool_call(
        "/ops/core/vault-set-body",
        Some("idem:core"),
        json!({}),
    ));
    assert_eq!(
        core.unwrap_err(),
        ToolError::CoreShapedTool("/ops/core/vault-set-body".to_string())
    );

    let unknown = prepare_tool_call(tool_call("rewrite_everything", None, json!({})));
    assert_eq!(
        unknown.unwrap_err(),
        ToolError::UnknownTool("rewrite_everything".to_string())
    );
}

#[test]
fn unknown_fields_and_body_actor_identity_are_rejected_by_tool_schemas() {
    let result = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({
            "query": "approval gate",
            "actor": {"id": "agent_1", "kind": "agent"}
        }),
    ));

    let err = result.unwrap_err();
    assert!(
        matches!(
            err,
            ToolError::InvalidInput {
                tool: "search_graph",
                ..
            }
        ),
        "unexpected error: {err}"
    );
    assert!(
        err.to_string().contains("unknown field `actor`"),
        "actor must be rejected at schema parse: {err}"
    );
}

#[test]
fn search_graph_enforces_ops_route_bounds_and_target_vocabulary() {
    let accepted = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({"query": " approval gate ", "type": "code", "max_results": 50}),
    ))
    .unwrap();
    assert_eq!(accepted.command, CommandKind::SearchGraph);

    let empty = prepare_tool_call(tool_call("search_graph", None, json!({"query": "   "})));
    assert!(empty.unwrap_err().to_string().contains("must not be empty"));

    let too_long = "x".repeat(MAX_SEARCH_QUERY_CHARS + 1);
    let long = prepare_tool_call(tool_call("search_graph", None, json!({"query": too_long})));
    assert!(long.unwrap_err().to_string().contains("512"));

    let too_many = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({"query": "approval", "max_results": 51}),
    ));
    assert!(too_many.unwrap_err().to_string().contains("50"));

    let zero = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({"query": "approval", "max_results": 0}),
    ));
    assert!(zero.unwrap_err().to_string().contains("between 1"));

    let oversized_scope = "s".repeat(MAX_SEARCH_SCOPE_CHARS + 1);
    let long_scope = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({"query": "approval", "scope": oversized_scope}),
    ));
    assert!(long_scope.unwrap_err().to_string().contains("scope"));

    let bad_target = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({"query": "approval", "type": "docs"}),
    ));
    assert!(
        bad_target
            .unwrap_err()
            .to_string()
            .contains("unknown variant `docs`")
    );
}

#[test]
fn read_context_bounds_document_list_and_document_bytes() {
    let document = prepare_tool_call(tool_call(
        "read_context",
        None,
        json!({
            "target": "document",
            "document": existing_doc_ref()
        }),
    ))
    .unwrap();
    assert_eq!(document.command, CommandKind::ReadContext);
    match document.dispatch {
        PreparedToolDispatch::ReadContext {
            input: ReadContextInput::Document { max_bytes, .. },
        } => assert_eq!(max_bytes, DEFAULT_CONTEXT_BYTES),
        other => panic!("unexpected document context dispatch: {other:?}"),
    }

    let proposal = prepare_tool_call(tool_call(
        "read_context",
        None,
        json!({"target": "proposal", "changeset_id": "changeset_1"}),
    ))
    .unwrap();
    match proposal.dispatch {
        PreparedToolDispatch::ReadContext {
            input:
                ReadContextInput::Proposal {
                    changeset_id: prepared_changeset,
                    max_bytes,
                },
        } => {
            assert_eq!(prepared_changeset, changeset_id());
            assert_eq!(max_bytes, DEFAULT_CONTEXT_BYTES);
        }
        other => panic!("unexpected proposal context dispatch: {other:?}"),
    }

    let session = prepare_tool_call(tool_call(
        "read_context",
        None,
        json!({"target": "session", "session_id": "session_1"}),
    ))
    .unwrap();
    match session.dispatch {
        PreparedToolDispatch::ReadContext {
            input:
                ReadContextInput::Session {
                    session_id: prepared_session,
                    max_bytes,
                },
        } => {
            assert_eq!(prepared_session, session_id());
            assert_eq!(max_bytes, DEFAULT_CONTEXT_BYTES);
        }
        other => panic!("unexpected session context dispatch: {other:?}"),
    }

    let list = prepare_tool_call(tool_call(
        "read_context",
        None,
        json!({"target": "document_list", "cap": 50}),
    ))
    .unwrap();
    assert_eq!(list.command, CommandKind::ReadContext);

    let oversized_list = prepare_tool_call(tool_call(
        "read_context",
        None,
        json!({"target": "document_list", "cap": 51}),
    ));
    assert!(oversized_list.unwrap_err().to_string().contains("50"));

    let oversized_doc = prepare_tool_call(tool_call(
        "read_context",
        None,
        json!({
            "target": "document",
            "document": existing_doc_ref(),
            "max_bytes": MAX_CONTEXT_BYTES + 1
        }),
    ));
    assert!(oversized_doc.unwrap_err().to_string().contains("max_bytes"));

    for target in ["proposal", "session"] {
        let key = if target == "proposal" {
            json!({"changeset_id": "changeset_1"})
        } else {
            json!({"session_id": "session_1"})
        };
        let mut input = json!({"target": target, "max_bytes": MAX_CONTEXT_BYTES + 1});
        input.as_object_mut().unwrap().extend(
            key.as_object()
                .unwrap()
                .iter()
                .map(|(key, value)| (key.clone(), value.clone())),
        );
        let result = prepare_tool_call(tool_call("read_context", None, input));
        assert!(
            result.unwrap_err().to_string().contains("max_bytes"),
            "{target} context must be bounded"
        );
    }
}

#[test]
fn mutating_tools_require_idempotency_keys() {
    let cases = [
        ("propose_changeset", create_payload()),
        (
            "validate_proposal",
            json!({
                "changeset_id": "changeset_1",
                "expected_revision": "rev_1",
                "summary": "Validate before review"
            }),
        ),
        (
            "request_approval",
            json!({
                "changeset_id": "changeset_1",
                "expected_revision": "rev_1",
                "summary": "Ready for review"
            }),
        ),
        (
            "cancel",
            json!({
                "target": "proposal",
                "changeset_id": "changeset_1",
                "expected_revision": "rev_1",
                "summary": "Stop this proposal"
            }),
        ),
        (
            "request_apply",
            json!({
                "changeset_id": "changeset_1",
                "approval_id": "approval_1"
            }),
        ),
    ];

    for (name, input) in cases {
        let result = prepare_tool_call(tool_call(name, None, input));
        assert_eq!(
            result.unwrap_err(),
            ToolError::MissingIdempotency { tool: name },
            "{name} must require an idempotency key"
        );
    }
}

#[test]
fn propose_changeset_prepares_create_append_and_replace_aliases() {
    let create = prepare_tool_call(tool_call(
        "propose_changeset",
        Some("idem:proposal:create"),
        create_payload(),
    ))
    .unwrap();
    match create.dispatch {
        PreparedToolDispatch::ProposeChangeset {
            dispatch:
                ProposeChangesetDispatch::Create {
                    command:
                        CommandEnvelope {
                            command, payload, ..
                        },
                },
        } => {
            assert_eq!(command, CommandKind::CreateProposal);
            assert_eq!(payload.session_id, session_id());
            assert_eq!(payload.changeset_id, changeset_id());
        }
        other => panic!("unexpected dispatch: {other:?}"),
    }

    for (operation_name, expected) in [
        ("append", CommandKind::AppendDraft),
        ("replace", CommandKind::ReplaceDraft),
    ] {
        let prepared = prepare_tool_call(tool_call(
            "propose_changeset",
            Some("idem:proposal:mutate"),
            json!({
                "operation": operation_name,
                "changeset_id": "changeset_1",
                "expected_revision": "rev_1",
                "summary": "Mutate draft",
                "operations": [operation()]
            }),
        ))
        .unwrap();
        assert_eq!(prepared.command, expected);
    }
}

#[test]
fn validate_proposal_prepares_backend_evidence_alias_and_rejects_smuggled_evidence() {
    let prepared = prepare_tool_call(tool_call(
        "validate_proposal",
        Some("idem:validate"),
        json!({
            "changeset_id": "changeset_1",
            "expected_revision": "rev_1",
            "summary": "Validate before review"
        }),
    ))
    .unwrap();
    assert_eq!(prepared.command, CommandKind::ValidateProposal);
    assert_eq!(
        prepared.permission_requirement,
        ToolPermissionRequirement::HumanApprovalRequired
    );
    match prepared.dispatch {
        PreparedToolDispatch::ValidateProposal {
            command,
            idempotency_key,
            input,
        } => {
            assert_eq!(command, CommandKind::ValidateProposal);
            assert_eq!(idempotency_key.as_str(), "idem:validate");
            assert_eq!(input.changeset_id, changeset_id());
            assert_eq!(input.expected_revision, revision());
            assert_eq!(input.summary, "Validate before review");
        }
        other => panic!("unexpected validate dispatch: {other:?}"),
    }

    let smuggled = prepare_tool_call(tool_call(
        "validate_proposal",
        Some("idem:validate"),
        json!({
            "changeset_id": "changeset_1",
            "expected_revision": "rev_1",
            "summary": "Validate before review",
            "current_revisions": []
        }),
    ));
    assert!(
        smuggled
            .unwrap_err()
            .to_string()
            .contains("current_revisions"),
        "agents must not supply backend-derived validation evidence"
    );
}

#[test]
fn request_approval_cancel_and_apply_prepare_semantic_command_aliases() {
    let approval = prepare_tool_call(tool_call(
        "request_approval",
        Some("idem:approval"),
        json!({
            "changeset_id": "changeset_1",
            "expected_revision": "rev_1",
            "summary": "Ready for review"
        }),
    ))
    .unwrap();
    assert_eq!(approval.command, CommandKind::SubmitForReview);
    match approval.dispatch {
        PreparedToolDispatch::RequestApproval {
            changeset_id: prepared_changeset,
            ..
        } => {
            assert_eq!(prepared_changeset, changeset_id())
        }
        other => panic!("unexpected dispatch: {other:?}"),
    }

    let cancel_proposal = prepare_tool_call(tool_call(
        "cancel",
        Some("idem:cancel:proposal"),
        json!({
            "target": "proposal",
            "changeset_id": "changeset_1",
            "expected_revision": "rev_1",
            "summary": "Stop this proposal"
        }),
    ))
    .unwrap();
    assert_eq!(cancel_proposal.command, CommandKind::CancelProposal);
    match cancel_proposal.dispatch {
        PreparedToolDispatch::CancelProposal {
            command,
            idempotency_key,
            input,
        } => {
            assert_eq!(command, CommandKind::CancelProposal);
            assert_eq!(idempotency_key.as_str(), "idem:cancel:proposal");
            assert_eq!(input.changeset_id, changeset_id());
            assert_eq!(input.expected_revision, revision());
            assert_eq!(input.summary, "Stop this proposal");
        }
        other => panic!("unexpected proposal cancel dispatch: {other:?}"),
    }

    let cancel_run = prepare_tool_call(tool_call(
        "cancel",
        Some("idem:cancel:run"),
        json!({
            "target": "run",
            "run_id": "run_1",
            "reason": "User requested cancellation"
        }),
    ))
    .unwrap();
    assert_eq!(cancel_run.command, CommandKind::CancelRun);
    match cancel_run.dispatch {
        PreparedToolDispatch::CancelRun {
            run_id,
            command:
                CommandEnvelope {
                    command,
                    idempotency_key,
                    payload,
                    ..
                },
        } => {
            assert_eq!(run_id, RunId::new("run_1").unwrap());
            assert_eq!(command, CommandKind::CancelRun);
            assert_eq!(idempotency_key.as_str(), "idem:cancel:run");
            assert_eq!(payload.reason, "User requested cancellation");
        }
        other => panic!("unexpected run cancel dispatch: {other:?}"),
    }

    let apply = prepare_tool_call(tool_call(
        "request_apply",
        Some("idem:apply"),
        json!({
            "changeset_id": "changeset_1",
            "approval_id": "approval_1"
        }),
    ))
    .unwrap();
    assert_eq!(apply.command, CommandKind::RequestApply);
    assert_eq!(apply.risk_tier, ToolRiskTier::Dangerous);
    assert_eq!(
        apply.permission_requirement,
        ToolPermissionRequirement::HumanApprovalRequired
    );
    match apply.dispatch {
        PreparedToolDispatch::RequestApply {
            command:
                CommandEnvelope {
                    command,
                    idempotency_key,
                    payload,
                    ..
                },
        } => {
            assert_eq!(command, CommandKind::RequestApply);
            assert_eq!(idempotency_key.as_str(), "idem:apply");
            assert_eq!(payload.changeset_id, changeset_id());
            assert_eq!(payload.approval_id, approval_id());
        }
        other => panic!("unexpected apply dispatch: {other:?}"),
    }
}

#[test]
fn request_approval_schema_does_not_accept_client_validation_material() {
    let result = prepare_tool_call(tool_call(
        "request_approval",
        Some("idem:approval"),
        json!({
            "changeset_id": "changeset_1",
            "expected_revision": "rev_1",
            "summary": "Ready for review",
            "current_revisions": []
        }),
    ));

    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("current_revisions"),
        "validation evidence must not be accepted from agents: {err}"
    );
}

#[test]
fn core_shaped_payload_values_are_rejected_before_dto_dispatch() {
    let result = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({
            "query": "approval",
            "scope": "/ops/core/vault-set-body"
        }),
    ));

    let err = result.unwrap_err();
    assert!(
        err.to_string().contains("core-shaped payload"),
        "core-shaped payload strings must be rejected: {err}"
    );

    let keyed = prepare_tool_call(tool_call(
        "search_graph",
        None,
        json!({
            "query": "approval",
            "core_capability": "write_body"
        }),
    ));
    assert!(
        keyed
            .unwrap_err()
            .to_string()
            .contains("core-shaped payload"),
        "core-shaped payload keys must be rejected before DTO parsing"
    );
}

#[test]
fn typed_inputs_can_still_represent_the_backend_domain_without_core_capabilities() {
    let draft = DraftAlias {
        changeset_id: changeset_id(),
        expected_revision: revision(),
        summary: "Draft".to_string(),
        operations: vec![ChangesetChildOperationDraft {
            child_key: "child_1".to_string(),
            operation: ChangesetOperationKind::ReplaceBody,
            target: TargetRevisionFence {
                document: DocumentRef::ProvisionalCreate {
                    provisional_doc_id: "provisional_1".to_string(),
                    doc_type: "adr".to_string(),
                    feature: "agentic-spec-authoring-backend".to_string(),
                    title: "Tool alias".to_string(),
                    collision_status: ProvisionalCollisionStatus::Unknown,
                    proposed_stem: None,
                    related: Vec::new(),
                },
                base_revision: None,
                current_revision: None,
            },
            draft: DraftMutation {
                mode: DraftMode::WholeDocument,
                body: "# Tool alias\n".to_string(),
                frontmatter: None,
                new_stem: None,
                section_selector: None,
                plan_step: None,
            },
        }],
    };

    let value = serde_json::to_value(draft).unwrap();
    let rendered = value.to_string();
    assert!(!rendered.contains("core"));
    assert!(!rendered.contains("vaultspec-core"));
    assert!(!rendered.contains("/ops/core"));
}

#[test]
fn propose_changeset_create_inlines_model_owned_operation_content() {
    // The create branch inlines the model-owned content as JSON Schema so a
    // bridged agent can construct operations (the opaque `payload` type ref was
    // the S20 blocker); the a2a-injected ids are NOT advertised.
    let schema = input_schema(SemanticToolName::ProposeChangeset);
    let create = &schema["oneOf"][0];
    assert_eq!(create["operation"], "create");
    let item = &create["properties"]["operations"]["items"]["properties"];
    assert!(item.get("child_key").is_some());
    let op_enum = item["operation"]["enum"].as_array().unwrap();
    assert!(op_enum.contains(&json!("create_document")));
    assert_eq!(op_enum.len(), 10);
    let document = &item["target"]["properties"]["document"]["properties"];
    assert!(document.get("provisional_doc_id").is_some());
    let collision = document["collision_status"]["enum"].as_array().unwrap();
    assert!(collision.contains(&json!("available")));
    assert!(item["draft"]["properties"].get("body").is_some());

    // Dispatcher-injected ids never appear in the served schema.
    let rendered = schema.to_string();
    assert!(!rendered.contains("session_id"));
    assert!(!rendered.contains("changeset_id"));
    assert!(!rendered.contains("expected_revision"));
}
