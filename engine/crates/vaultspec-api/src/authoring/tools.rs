//! Semantic agent tool catalog and dispatch aliases.
//!
//! Agents call product-domain tools, not core verbs. This module owns the fixed
//! tool vocabulary, input validation, risk metadata, and dispatch aliases that
//! later HTTP/LangGraph wiring can execute through existing authoring commands.
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::api::{
    ApiVersion, ApplyRequest, CancelRunRequest, CommandEnvelope, CreateProposalRequest,
    SubmitForReviewRequest,
};
use super::model::{ChangesetId, CommandKind, IdempotencyKey, RevisionToken, RunId, ToolCallId};
use super::policy::{ToolPermissionRequirement, ToolRiskTier, tool_permission_requirement};

pub const DEFAULT_SEARCH_RESULT_CAP: u32 = 8;
pub const MAX_SEARCH_RESULTS: u32 = 50;
pub const MAX_SEARCH_QUERY_CHARS: usize = 512;
pub const MAX_SEARCH_SCOPE_CHARS: usize = 256;
pub const DEFAULT_CONTEXT_BYTES: u64 = 16 * 1024;
pub const MAX_CONTEXT_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SemanticToolName {
    ReadContext,
    SearchGraph,
    ProposeChangeset,
    ValidateProposal,
    RequestApproval,
    Cancel,
    RequestApply,
}

impl SemanticToolName {
    pub const ALL: &'static [Self] = &[
        Self::ReadContext,
        Self::SearchGraph,
        Self::ProposeChangeset,
        Self::ValidateProposal,
        Self::RequestApproval,
        Self::Cancel,
        Self::RequestApply,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadContext => "read_context",
            Self::SearchGraph => "search_graph",
            Self::ProposeChangeset => "propose_changeset",
            Self::ValidateProposal => "validate_proposal",
            Self::RequestApproval => "request_approval",
            Self::Cancel => "cancel",
            Self::RequestApply => "request_apply",
        }
    }

    /// Resolve a semantic tool from its wire name (the inverse of [`Self::as_str`]).
    pub(crate) fn from_wire(name: &str) -> Option<Self> {
        Self::ALL.iter().copied().find(|tool| tool.as_str() == name)
    }

    pub fn command(self) -> CommandKind {
        match self {
            Self::ReadContext => CommandKind::ReadContext,
            Self::SearchGraph => CommandKind::SearchGraph,
            Self::ProposeChangeset => CommandKind::CreateProposal,
            Self::ValidateProposal => CommandKind::ValidateProposal,
            Self::RequestApproval => CommandKind::SubmitForReview,
            Self::Cancel => CommandKind::CancelProposal,
            Self::RequestApply => CommandKind::RequestApply,
        }
    }

    pub fn risk_tier(self) -> ToolRiskTier {
        match self {
            Self::ReadContext | Self::SearchGraph => ToolRiskTier::ReadOnly,
            Self::ProposeChangeset
            | Self::ValidateProposal
            | Self::RequestApproval
            | Self::Cancel => ToolRiskTier::Mutating,
            Self::RequestApply => ToolRiskTier::Dangerous,
        }
    }

    pub fn idempotency_required(self) -> bool {
        !matches!(self, Self::ReadContext | Self::SearchGraph)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SemanticToolDescriptor {
    pub name: &'static str,
    pub description: &'static str,
    pub commands: Vec<CommandKind>,
    pub risk_tier: ToolRiskTier,
    pub permission_requirement: ToolPermissionRequirement,
    pub idempotency_required: bool,
    pub input_schema: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SemanticToolCatalog {
    pub schema_version: &'static str,
    pub tools: Vec<SemanticToolDescriptor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentToolCall {
    pub tool_call_id: ToolCallId,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<IdempotencyKey>,
    pub input: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "target", rename_all = "snake_case", deny_unknown_fields)]
pub enum ReadContextInput {
    Document {
        document: super::model::DocumentRef,
        #[serde(skip_serializing_if = "Option::is_none")]
        revision: Option<RevisionToken>,
        #[serde(default = "default_context_bytes")]
        max_bytes: u64,
    },
    Proposal {
        changeset_id: ChangesetId,
        #[serde(default = "default_context_bytes")]
        max_bytes: u64,
    },
    Session {
        session_id: super::model::SessionId,
        #[serde(default = "default_context_bytes")]
        max_bytes: u64,
    },
    DocumentList {
        #[serde(skip_serializing_if = "Option::is_none")]
        cursor: Option<String>,
        #[serde(default = "default_search_result_cap")]
        cap: u32,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchGraphInput {
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub target: Option<SearchGraphTarget>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_results: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchGraphTarget {
    Vault,
    Code,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum ProposeChangesetInput {
    Create {
        #[serde(flatten)]
        payload: CreateProposalRequest,
    },
    Append {
        changeset_id: ChangesetId,
        expected_revision: RevisionToken,
        summary: String,
        operations: Vec<super::api::ChangesetChildOperationDraft>,
    },
    Replace {
        changeset_id: ChangesetId,
        expected_revision: RevisionToken,
        summary: String,
        operations: Vec<super::api::ChangesetChildOperationDraft>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidateProposalToolInput {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RequestApprovalToolInput {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "target", rename_all = "snake_case", deny_unknown_fields)]
pub enum CancelToolInput {
    Proposal {
        changeset_id: ChangesetId,
        expected_revision: RevisionToken,
        summary: String,
    },
    Run {
        run_id: RunId,
        reason: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PreparedToolDispatch {
    ReadContext {
        input: ReadContextInput,
    },
    SearchGraph {
        input: SearchGraphInput,
    },
    ProposeChangeset {
        dispatch: ProposeChangesetDispatch,
    },
    ValidateProposal {
        command: CommandKind,
        idempotency_key: IdempotencyKey,
        input: ValidateProposalToolInput,
    },
    RequestApproval {
        changeset_id: ChangesetId,
        command: CommandEnvelope<SubmitForReviewRequest>,
    },
    CancelProposal {
        command: CommandKind,
        idempotency_key: IdempotencyKey,
        input: CancelProposalAlias,
    },
    CancelRun {
        command: CommandEnvelope<CancelRunRequest>,
        run_id: RunId,
    },
    RequestApply {
        command: CommandEnvelope<ApplyRequest>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "operation", rename_all = "snake_case")]
pub enum ProposeChangesetDispatch {
    Create {
        command: CommandEnvelope<CreateProposalRequest>,
    },
    Append {
        command: CommandKind,
        idempotency_key: IdempotencyKey,
        input: DraftAlias,
    },
    Replace {
        command: CommandKind,
        idempotency_key: IdempotencyKey,
        input: DraftAlias,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DraftAlias {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
    pub operations: Vec<super::api::ChangesetChildOperationDraft>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CancelProposalAlias {
    pub changeset_id: ChangesetId,
    pub expected_revision: RevisionToken,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PreparedToolCall {
    pub tool_call_id: ToolCallId,
    pub name: SemanticToolName,
    pub command: CommandKind,
    pub risk_tier: ToolRiskTier,
    pub permission_requirement: ToolPermissionRequirement,
    pub dispatch: PreparedToolDispatch,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ToolError {
    #[error("unknown semantic agent tool `{0}`")]
    UnknownTool(String),
    #[error("core-shaped tool `{0}` is not part of the authoring tool contract")]
    CoreShapedTool(String),
    #[error("tool `{tool}` requires an idempotency key")]
    MissingIdempotency { tool: &'static str },
    #[error("tool `{tool}` received invalid input: {reason}")]
    InvalidInput { tool: &'static str, reason: String },
}

pub fn catalog() -> SemanticToolCatalog {
    SemanticToolCatalog {
        schema_version: "authoring.semantic_tools.v1",
        tools: SemanticToolName::ALL
            .iter()
            .copied()
            .map(descriptor)
            .collect(),
    }
}

pub fn descriptor(name: SemanticToolName) -> SemanticToolDescriptor {
    SemanticToolDescriptor {
        name: name.as_str(),
        description: tool_description(name),
        commands: commands_for(name),
        risk_tier: name.risk_tier(),
        permission_requirement: tool_permission_requirement(name.risk_tier()),
        idempotency_required: name.idempotency_required(),
        input_schema: input_schema(name),
    }
}

fn commands_for(name: SemanticToolName) -> Vec<CommandKind> {
    match name {
        SemanticToolName::ProposeChangeset => vec![
            CommandKind::CreateProposal,
            CommandKind::AppendDraft,
            CommandKind::ReplaceDraft,
        ],
        SemanticToolName::Cancel => vec![CommandKind::CancelProposal, CommandKind::CancelRun],
        other => vec![other.command()],
    }
}

pub fn prepare_tool_call(call: AgentToolCall) -> Result<PreparedToolCall, ToolError> {
    let name = parse_tool_name(&call.name)?;
    reject_core_shaped_payload(name, &call.input)?;
    if name.idempotency_required() && call.idempotency_key.is_none() {
        return Err(ToolError::MissingIdempotency {
            tool: name.as_str(),
        });
    }

    let dispatch = match name {
        SemanticToolName::ReadContext => PreparedToolDispatch::ReadContext {
            input: parse_bounded_input(name, call.input, validate_read_context)?,
        },
        SemanticToolName::SearchGraph => PreparedToolDispatch::SearchGraph {
            input: parse_bounded_input(name, call.input, validate_search_graph)?,
        },
        SemanticToolName::ProposeChangeset => PreparedToolDispatch::ProposeChangeset {
            dispatch: propose_dispatch(
                call.idempotency_key.expect("checked above"),
                parse_tool_input(name, call.input)?,
            ),
        },
        SemanticToolName::ValidateProposal => PreparedToolDispatch::ValidateProposal {
            command: CommandKind::ValidateProposal,
            idempotency_key: call.idempotency_key.expect("checked above"),
            input: parse_tool_input(name, call.input)?,
        },
        SemanticToolName::RequestApproval => {
            let input: RequestApprovalToolInput = parse_tool_input(name, call.input)?;
            PreparedToolDispatch::RequestApproval {
                changeset_id: input.changeset_id,
                command: envelope(
                    name.command(),
                    call.idempotency_key.expect("checked above"),
                    SubmitForReviewRequest {
                        expected_revision: input.expected_revision,
                        summary: input.summary,
                    },
                ),
            }
        }
        SemanticToolName::Cancel => match parse_tool_input(name, call.input)? {
            CancelToolInput::Proposal {
                changeset_id,
                expected_revision,
                summary,
            } => PreparedToolDispatch::CancelProposal {
                command: CommandKind::CancelProposal,
                idempotency_key: call.idempotency_key.expect("checked above"),
                input: CancelProposalAlias {
                    changeset_id,
                    expected_revision,
                    summary,
                },
            },
            CancelToolInput::Run { run_id, reason } => PreparedToolDispatch::CancelRun {
                command: envelope(
                    CommandKind::CancelRun,
                    call.idempotency_key.expect("checked above"),
                    CancelRunRequest { reason },
                ),
                run_id,
            },
        },
        SemanticToolName::RequestApply => PreparedToolDispatch::RequestApply {
            command: envelope(
                name.command(),
                call.idempotency_key.expect("checked above"),
                parse_tool_input(name, call.input)?,
            ),
        },
    };

    Ok(PreparedToolCall {
        tool_call_id: call.tool_call_id,
        name,
        command: dispatch.command_kind(),
        risk_tier: name.risk_tier(),
        permission_requirement: tool_permission_requirement(name.risk_tier()),
        dispatch,
    })
}

fn parse_tool_name(raw: &str) -> Result<SemanticToolName, ToolError> {
    let normalized = raw.trim();
    if is_core_shaped_tool(normalized) {
        return Err(ToolError::CoreShapedTool(raw.to_string()));
    }
    SemanticToolName::ALL
        .iter()
        .copied()
        .find(|candidate| candidate.as_str() == normalized)
        .ok_or_else(|| ToolError::UnknownTool(raw.to_string()))
}

fn is_core_shaped_tool(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("/ops/core")
        || lower.contains("vaultspec-core")
        || lower.contains("vault add")
        || lower.contains("vault_")
        || lower.contains("set-body")
        || lower.contains("set_body")
        || lower.contains("direct_write")
        || lower.contains("core_capability")
}

fn reject_core_shaped_payload(name: SemanticToolName, input: &Value) -> Result<(), ToolError> {
    fn visit(value: &Value) -> Option<String> {
        match value {
            Value::String(raw) => is_core_shaped_tool(raw).then(|| raw.clone()),
            Value::Array(items) => items.iter().find_map(visit),
            Value::Object(fields) => fields.iter().find_map(|(key, value)| {
                if is_core_shaped_tool(key) {
                    Some(key.clone())
                } else {
                    visit(value)
                }
            }),
            Value::Null | Value::Bool(_) | Value::Number(_) => None,
        }
    }

    if let Some(offending) = visit(input) {
        return Err(ToolError::InvalidInput {
            tool: name.as_str(),
            reason: format!("core-shaped payload value `{offending}` is not allowed"),
        });
    }
    Ok(())
}

fn parse_tool_input<T>(name: SemanticToolName, input: Value) -> Result<T, ToolError>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(input).map_err(|err| ToolError::InvalidInput {
        tool: name.as_str(),
        reason: err.to_string(),
    })
}

fn parse_bounded_input<T>(
    name: SemanticToolName,
    input: Value,
    validate: impl FnOnce(&T) -> Result<(), String>,
) -> Result<T, ToolError>
where
    T: for<'de> Deserialize<'de>,
{
    let parsed = parse_tool_input(name, input)?;
    validate(&parsed).map_err(|reason| ToolError::InvalidInput {
        tool: name.as_str(),
        reason,
    })?;
    Ok(parsed)
}

fn validate_read_context(input: &ReadContextInput) -> Result<(), String> {
    match input {
        ReadContextInput::Document { max_bytes, .. } => {
            if *max_bytes == 0 || *max_bytes > MAX_CONTEXT_BYTES {
                return Err(format!(
                    "max_bytes must be between 1 and {MAX_CONTEXT_BYTES}"
                ));
            }
        }
        ReadContextInput::Proposal { max_bytes, .. }
        | ReadContextInput::Session { max_bytes, .. } => {
            if *max_bytes == 0 || *max_bytes > MAX_CONTEXT_BYTES {
                return Err(format!(
                    "max_bytes must be between 1 and {MAX_CONTEXT_BYTES}"
                ));
            }
        }
        ReadContextInput::DocumentList { cap, .. } => validate_cap(*cap)?,
    }
    Ok(())
}

fn validate_search_graph(input: &SearchGraphInput) -> Result<(), String> {
    let trimmed = input.query.trim();
    if trimmed.is_empty() {
        return Err("query must not be empty".to_string());
    }
    if input.query.chars().count() > MAX_SEARCH_QUERY_CHARS {
        return Err(format!(
            "query must be no longer than {MAX_SEARCH_QUERY_CHARS} characters"
        ));
    }
    if let Some(max_results) = input.max_results
        && (max_results == 0 || max_results > MAX_SEARCH_RESULTS)
    {
        return Err(format!(
            "max_results must be between 1 and {MAX_SEARCH_RESULTS}"
        ));
    }
    if let Some(scope) = input.scope.as_deref()
        && scope.chars().count() > MAX_SEARCH_SCOPE_CHARS
    {
        return Err(format!(
            "scope must be no longer than {MAX_SEARCH_SCOPE_CHARS} characters"
        ));
    }
    Ok(())
}

fn validate_cap(cap: u32) -> Result<(), String> {
    if cap == 0 || cap > MAX_SEARCH_RESULTS {
        return Err(format!("cap must be between 1 and {MAX_SEARCH_RESULTS}"));
    }
    Ok(())
}

fn propose_dispatch(
    idempotency_key: IdempotencyKey,
    input: ProposeChangesetInput,
) -> ProposeChangesetDispatch {
    match input {
        ProposeChangesetInput::Create { payload } => ProposeChangesetDispatch::Create {
            command: envelope(CommandKind::CreateProposal, idempotency_key, payload),
        },
        ProposeChangesetInput::Append {
            changeset_id,
            expected_revision,
            summary,
            operations,
        } => ProposeChangesetDispatch::Append {
            command: CommandKind::AppendDraft,
            idempotency_key,
            input: DraftAlias {
                changeset_id,
                expected_revision,
                summary,
                operations,
            },
        },
        ProposeChangesetInput::Replace {
            changeset_id,
            expected_revision,
            summary,
            operations,
        } => ProposeChangesetDispatch::Replace {
            command: CommandKind::ReplaceDraft,
            idempotency_key,
            input: DraftAlias {
                changeset_id,
                expected_revision,
                summary,
                operations,
            },
        },
    }
}

fn envelope<T>(
    command: CommandKind,
    idempotency_key: IdempotencyKey,
    payload: T,
) -> CommandEnvelope<T> {
    CommandEnvelope {
        api_version: ApiVersion::V1,
        command,
        idempotency_key,
        payload,
    }
}

fn default_search_result_cap() -> u32 {
    DEFAULT_SEARCH_RESULT_CAP
}

fn default_context_bytes() -> u64 {
    DEFAULT_CONTEXT_BYTES
}

fn tool_description(name: SemanticToolName) -> &'static str {
    match name {
        SemanticToolName::ReadContext => "Read bounded authoring context without side effects.",
        SemanticToolName::SearchGraph => "Search the bounded project graph for authoring context.",
        SemanticToolName::ProposeChangeset => {
            "Create a proposal changeset through the backend authoring ledger."
        }
        SemanticToolName::ValidateProposal => {
            "Request backend validation for a proposal without applying it."
        }
        SemanticToolName::RequestApproval => {
            "Submit a validated proposal into backend-owned human review."
        }
        SemanticToolName::Cancel => "Cancel a proposal or run through semantic authoring state.",
        SemanticToolName::RequestApply => {
            "Request application of an approved proposal through the apply boundary."
        }
    }
}

fn input_schema(name: SemanticToolName) -> Value {
    match name {
        SemanticToolName::ReadContext => json!({
            "oneOf": [
                {"target": "document", "required": ["document"], "optional": ["revision", "max_bytes"]},
                {"target": "proposal", "required": ["changeset_id"], "optional": ["max_bytes"]},
                {"target": "session", "required": ["session_id"], "optional": ["max_bytes"]},
                {"target": "document_list", "optional": ["cursor", "cap"]}
            ],
            "additionalProperties": false
        }),
        SemanticToolName::SearchGraph => json!({
            "required": ["query"],
            "optional": ["scope", "type", "max_results"],
            "bounds": {
                "query_chars_max": MAX_SEARCH_QUERY_CHARS,
                "scope_chars_max": MAX_SEARCH_SCOPE_CHARS,
                "max_results": MAX_SEARCH_RESULTS,
                "target": ["vault", "code"]
            },
            "additionalProperties": false
        }),
        SemanticToolName::ProposeChangeset => json!({
            "oneOf": [
                {"operation": "create", "payload": "CreateProposalRequest"},
                {"operation": "append", "alias_of": "append_draft"},
                {"operation": "replace", "alias_of": "replace_draft"}
            ],
            "additionalProperties": false
        }),
        SemanticToolName::ValidateProposal => json!({
            "alias_of": "validate_proposal",
            "required": ["changeset_id", "expected_revision", "summary"],
            "backend_derived": ["current_revisions", "chunk_evidence"],
            "additionalProperties": false
        }),
        SemanticToolName::RequestApproval => json!({
            "alias_of": "submit_for_review",
            "required": ["changeset_id", "expected_revision", "summary"],
            "payload": "RequestApprovalToolInput",
            "composes": ["validate_proposal", "submit_for_review", "open_approval"],
            "additionalProperties": false
        }),
        SemanticToolName::Cancel => json!({
            "oneOf": [
                {"target": "proposal", "required": ["changeset_id", "expected_revision", "summary"]},
                {"target": "run", "required": ["run_id", "reason"]}
            ],
            "additionalProperties": false
        }),
        SemanticToolName::RequestApply => json!({
            "alias_of": "request_apply",
            "payload": "ApplyRequest",
            "additionalProperties": false
        }),
    }
}

impl PreparedToolDispatch {
    fn command_kind(&self) -> CommandKind {
        match self {
            Self::ReadContext { .. } => CommandKind::ReadContext,
            Self::SearchGraph { .. } => CommandKind::SearchGraph,
            Self::ProposeChangeset { dispatch } => match dispatch {
                ProposeChangesetDispatch::Create { command } => command.command,
                ProposeChangesetDispatch::Append { command, .. }
                | ProposeChangesetDispatch::Replace { command, .. } => *command,
            },
            Self::ValidateProposal { command, .. } => *command,
            Self::RequestApproval { command, .. } => command.command,
            Self::CancelProposal { command, .. } => *command,
            Self::CancelRun { command, .. } => command.command,
            Self::RequestApply { command } => command.command,
        }
    }
}

#[cfg(test)]
mod tests {
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
}
