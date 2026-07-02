---
tags:
  - '#adr'
  - '#agentic-spec-authoring-backend'
date: '2026-06-29'
modified: '2026-06-30'
related:
  - "[[2026-06-29-agentic-spec-authoring-backend-research]]"
  - "[[2026-06-29-langgraph-approval-document-editing-research]]"
  - "[[2026-06-29-zed-acp-document-authoring-research]]"
  - "[[2026-06-16-document-editor-backend-adr]]"
  - "[[2026-06-18-document-edit-hardening-adr]]"
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-06-29-agentic-approval-gates-review-state-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-apply-materialization-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-live-editing-room-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-document-chunk-management-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-06-29-agentic-document-identity-adr]]'
---

# `agentic-langgraph-integration` adr: `threads, runs, checkpoints, interrupts, and tool calls` | (**status:** `accepted`)

## Problem Statement

Agentic spec authoring needs LangGraph execution without letting LangGraph become
the document authority. The backend must let agents draft proposals, pause for
human decisions, resume safely, and expose tool-call progress, while Vaultspec
remains authoritative for documents, revisions, proposals, approvals, policy,
audit, and apply results.

## Considerations

LangGraph threads, runs, checkpoints, interrupts, and stream modes are execution
primitives, not product history. Research recommends one collaborator-facing
Vaultspec authoring API. Agents and frontend surfaces should not call
`vaultspec-core` or core-shaped write routes directly. LangGraph interrupts
replay the interrupted node on resume, so all proposal, approval, tool, apply,
and event-publication operations need idempotency keys.

Tool calls need stable IDs and semantic Vaultspec tool kinds: read context,
search graph, propose changeset, validate, request approval, cancel, and request
apply. The frontend must receive backend-served proposal status, pending
approvals, conflict state, and action eligibility through stores, never infer
them from raw run events.

## Constraints

`engine-read-and-infer` still forbids direct `.vault/` writes and sibling
semantics in the read/infer engine. Agent authoring state must be a distinct
authoring backend domain or sibling service, even if co-located in the same Rust
process. LangGraph
APIs and Agent Server shapes are active surfaces; the adapter must hide version
churn from Vaultspec records. Checkpoint retention cannot be treated as audit
retention. Product records must survive independently of LangGraph checkpoint
pruning. Multiple simultaneous interrupts must be resumed by interrupt ID, not
positional order. Authorization can drift between agent runtime context and
Vaultspec policy; the backend remains the policy authority.

## Implementation

The authoring backend creates an `authoring_session` and associates each agent
task with a LangGraph `thread_id` and one or more `run_id`s. Thread state stores
lightweight references to Vaultspec product objects, while final proposal
material, approval records, validation results, and apply receipts are copied
into Vaultspec-owned records.

A run may stream messages, tool updates, checkpoints, and interrupts, but only
semantic backend transitions create durable product state. Interrupt payloads
use stable domain schemas. A `tool_permission_request` carries `tool_call_id`,
requested tool kind, bounded scope, decision options, and policy context. A
`changeset_approval_request` carries `approval_id`, `proposal_id`, reviewed
proposal revision, decision options, and policy context. Resume commands carry
decision values keyed by `interrupt_id`.

Tool calls are represented twice: LangGraph owns executable tool-call state, and
the authoring backend stores normalized tool-call records for replay and audit.
Dangerous tools do not mutate `.vault/` directly. They request proposal
creation, validation, approval, or `request_apply` through backend commands with
idempotency keys.

## Rationale

This preserves LangGraph's strengths: durable execution, human pause points,
replay, and tool-call visibility, without making checkpoints the source of truth
for Vaultspec documents. It also matches the approval-driven authoring research:
users approve reviewable changesets, not token streams or raw tool calls.

## Consequences

Agents can recover from disconnects, paused approvals, and retries without
duplicating side effects. Product history remains queryable after LangGraph
checkpoint compaction. The adapter becomes a compatibility layer that must track
LangGraph changes. Debugging requires correlating product IDs with LangGraph IDs,
so stable cross-references are mandatory.

## Codification candidates

- **Rule slug:** `langgraph-is-execution-state-not-product-history`.
  **Rule:** LangGraph checkpoints, threads, runs, interrupts, and tool calls may
  reference Vaultspec authoring records, but proposal lifecycle, approval, apply,
  rollback, and audit truth must live in Vaultspec-owned state.

(The idempotency obligation this ADR's interrupt-replay analysis motivates is
owned by the changeset-ledger ADR's `authoring-mutating-commands-are-idempotent`
candidate; it is deliberately not restated as a second rule here.)
