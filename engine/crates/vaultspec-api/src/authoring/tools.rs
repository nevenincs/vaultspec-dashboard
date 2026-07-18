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
                {
                    // Model-owned content for a create proposal, inlined as JSON
                    // Schema so a bridged agent can construct it (the opaque
                    // `payload: CreateProposalRequest` type ref left it unable to,
                    // the S20 blocker). session_id + changeset_id are injected by
                    // the a2a dispatcher BELOW the model and are deliberately NOT
                    // advertised here.
                    "operation": "create",
                    "properties": {
                        "summary": {"type": "string"},
                        "operations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "child_key": {"type": "string"},
                                    "operation": {
                                        "type": "string",
                                        "enum": [
                                            "create_document", "replace_body",
                                            "append_body", "edit_frontmatter",
                                            "rename", "archive", "unarchive",
                                            "link", "section_edit",
                                            "set_plan_step_state"
                                        ]
                                    },
                                    "target": {
                                        "type": "object",
                                        "properties": {
                                            "document": {
                                                "type": "object",
                                                "properties": {
                                                    "kind": {
                                                        "type": "string",
                                                        "enum": [
                                                            "existing",
                                                            "provisional_create",
                                                            "rename_target",
                                                            "materialized_result"
                                                        ]
                                                    },
                                                    "provisional_doc_id": {"type": "string"},
                                                    "doc_type": {"type": "string"},
                                                    "feature": {"type": "string"},
                                                    "title": {"type": "string"},
                                                    "collision_status": {
                                                        "type": "string",
                                                        "enum": [
                                                            "unknown", "available",
                                                            "conflicting"
                                                        ]
                                                    },
                                                    "proposed_stem": {"type": "string"},
                                                    "related": {
                                                        "type": "array",
                                                        "items": {"type": "string"}
                                                    }
                                                },
                                                "required": ["kind"]
                                            },
                                            "base_revision": {"type": "string"},
                                            "current_revision": {"type": "string"}
                                        },
                                        "required": ["document"]
                                    },
                                    "draft": {
                                        "type": "object",
                                        "properties": {
                                            "mode": {
                                                "type": "string",
                                                "enum": [
                                                    "whole_document", "append",
                                                    "section_scoped"
                                                ]
                                            },
                                            "body": {"type": "string"},
                                            "frontmatter": {
                                                "type": "object",
                                                "properties": {
                                                    "date": {"type": "string"},
                                                    "tags": {
                                                        "type": "array",
                                                        "items": {"type": "string"}
                                                    },
                                                    "related": {
                                                        "type": "array",
                                                        "items": {"type": "string"}
                                                    }
                                                }
                                            }
                                        },
                                        "required": ["mode", "body"]
                                    }
                                },
                                "required": [
                                    "child_key", "operation", "target", "draft"
                                ]
                            }
                        }
                    },
                    "required": ["summary", "operations"]
                },
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
mod tests;
