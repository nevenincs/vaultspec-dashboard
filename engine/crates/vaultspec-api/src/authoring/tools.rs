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

/// The search input ceilings this catalog ADVERTISES and pre-validates against.
/// Single-sourced with the `/search` route that enforces them, so the bounds an
/// agent is told about are the bounds it will actually be held to.
pub(crate) use crate::search_bounds::{MAX_SEARCH_QUERY_CHARS, MAX_SEARCH_RESULTS};

pub const MAX_SEARCH_SCOPE_CHARS: usize = 256;

/// A page of a document LISTING — a different quantity from the search bounds
/// above, despite the ceiling happening to equal the search one today. Kept
/// separate deliberately: a listing page is bounded by what a caller can
/// usefully page through, a search result count by what is forwarded to rag.
/// Binding them together would make either unmovable without silently moving
/// the other, and these were previously named for search while only ever
/// bounding `read_context`'s `document_list`.
pub const DEFAULT_DOCUMENT_LIST_CAP: u32 = 8;
pub const MAX_DOCUMENT_LIST_CAP: u32 = 50;
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
        #[serde(default = "default_document_list_cap")]
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
    if cap == 0 || cap > MAX_DOCUMENT_LIST_CAP {
        return Err(format!("cap must be between 1 and {MAX_DOCUMENT_LIST_CAP}"));
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

fn default_document_list_cap() -> u32 {
    DEFAULT_DOCUMENT_LIST_CAP
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
        // Standard, valid JSON Schema (top-level `type: object` + `properties`)
        // for the model-owned content of a propose_changeset call, so a bridged
        // agent can construct `operations` (the opaque `payload:
        // CreateProposalRequest` type ref left it unable to - the S20 blocker).
        // The a2a normalizer detects this shape and passes it through verbatim;
        // an older engine still serves the DSL fallback. create/append/replace
        // share the same model-owned surface - {summary, operations}; the
        // `operation` discriminator selects the leg. The proposal-lifecycle ids
        // (session_id, changeset_id, expected_revision) are injected by the a2a
        // dispatcher BELOW the model and are deliberately NOT advertised.
        //
        // Fields derived field-for-field from the serde types in
        // authoring/api/mod.rs and authoring/model.rs:
        //   - CreateProposalRequest (api/mod.rs:503) -> summary, operations
        //     (session_id:504, changeset_id:505 injected, omitted here)
        //   - ChangesetChildOperationDraft (api/mod.rs:512) -> child_key,
        //     operation, target, draft
        //   - ChangesetOperationKind (api/mod.rs:521) -> the complete 10-kind enum
        //   - TargetRevisionFence (api/mod.rs:536) -> document, base_revision?,
        //     current_revision?
        //   - DocumentRef (model.rs:161) -> `kind`-tagged; Existing (:162) and
        //     ProvisionalCreate (:170) inlined fully, both cheap string objects
        //   - DraftMutation (api/mod.rs:546) -> mode, body, frontmatter?
        //   - FrontmatterEditFields (api/mod.rs:615) -> date?, tags?, related?
        //
        // Scope (#44 create-leg-complete): the operation-kind enum is COMPLETE
        // and the create/replace_body draft surface plus the Existing and
        // ProvisionalCreate document variants are fully described. The per-kind
        // specialized DraftMutation fields (new_stem for Rename, section_selector
        // for SectionEdit, plan_step for SetPlanStepState - api/mod.rs:562/570/577)
        // and the RenameTarget/MaterializedResult DocumentRef variants
        // (model.rs:187/192) are enum-vocabulary only; the `description` records
        // this as the scoped follow-up.
        SemanticToolName::ProposeChangeset => json!({
            "type": "object",
            "description": "Propose a changeset. Injected below the model and NOT \
        supplied here: session_id, changeset_id, expected_revision. Fully described for \
        this (create-leg-complete) scope: the complete operation-kind enum, the \
        whole_document/append draft surface (mode, body, frontmatter), and the Existing \
        and ProvisionalCreate document variants. Scoped follow-up (#44, enum-vocabulary \
        only, not field-expanded here): the rename/section_edit/set_plan_step_state \
        per-kind draft fields (new_stem, section_selector, plan_step) and the \
        rename_target/materialized_result document variants.",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["create", "append", "replace"]
                },
                "summary": {"type": "string"},
                "operations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "description": "Scope note: only the create_document / \
        provisional_create document / whole_document draft path is fully modeled here. \
        The enumerated draft surface (mode, body, frontmatter) covers the create/ \
        replace_body/append_body body path, and the existing + provisional_create \
        document variants are fully described. NOT enumerated in this schema: the \
        per-kind draft fields required by other operation kinds (new_stem for rename, \
        section_selector for section_edit, plan_step for set_plan_step_state) and the \
        rename_target/materialized_result document variants. The engine validates each \
        kind and each variant with deny_unknown_fields, so composing a non-create kind \
        here from only the create-shaped fields is rejected - fully modeling those \
        kinds is a scoped follow-up.",
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
                                            // DocumentRef::Existing (model.rs:162)
                                            "scope": {"type": "string"},
                                            "node_id": {"type": "string"},
                                            "stem": {"type": "string"},
                                            "path": {"type": "string"},
                                            "base_revision": {"type": "string"},
                                            // DocumentRef::ProvisionalCreate (model.rs:170)
                                            "provisional_doc_id": {"type": "string"},
                                            // doc_type is shared by both variants
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
            "required": ["operation", "summary", "operations"]
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
