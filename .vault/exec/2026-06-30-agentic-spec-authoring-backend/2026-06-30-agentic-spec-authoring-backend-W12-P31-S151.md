---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S151'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Semantic agent tool aliases requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Re-ground W12.P31 against the current plan ordering, the API contract ADR,
  LangGraph integration ADR, security/provenance ADR, and approval-gate ADR.
- Reconcile local source evidence with an independent read-only research
  sidecar for the semantic agent-tool alias phase.
- Confirm the phase owns only the semantic tool catalog, schemas, bounded
  validation, and backend command dispatch aliases.
- Confirm durable tool-permission requests, interrupt resume records,
  normalized tool-call replay, generation compaction, and LangGraph fixture
  replay remain later plan phases.
- Ground the phase against current LangChain/LangGraph tool and human-in-the-
  loop guidance: tools have stable names, descriptions, schemas, contextual
  execution, and human decisions resume persisted graph state, while side-
  effecting tools are approved, edited, or rejected rather than treated as raw
  writes.
- Define the S152 semantic catalog as `read_context`, `search_graph`,
  `propose_changeset`, `validate_proposal`, `request_approval`, `cancel`, and
  `request_apply`.
- Bind `read_context` to bounded document/proposal/session context reads and
  snapshots.
- Bind `search_graph` to bounded search semantics with local cap and query
  validation before any search/RAG dispatch.
- Bind `propose_changeset` to existing proposal creation and draft mutation
  commands rather than a new proposal state machine.
- Bind `validate_proposal` to the existing proposal validation command.
- Bind `request_approval` to the backend-owned submit-for-review composition,
  not a parallel approval path.
- Bind `cancel` to schema-discriminated proposal/run cancellation.
- Bind `request_apply` to the existing approved apply request path; core
  invocation remains internal to the apply adapter boundary.
- Require all tool input DTOs to deny unknown fields, use provider-safe
  snake_case names, keep actors server-resolved, and reject body-supplied actor
  identity.
- Require mutating aliases to carry idempotency keys and route through existing
  semantic command handlers with denials returned as domain values and faults
  returned as errors.
- Require all read/search aliases to be bounded, read-only, and tiered as
  auto-permitted read tools.
- Require all mutating/dangerous aliases to expose eligibility/permission
  metadata without implementing durable permission requests early.
- Require raw core verbs, raw `.vault` filesystem writes, `direct_write` tool
  names, `/ops/core` shaped names, and client-chosen core capabilities to be
  rejected before dispatch.
- Require S153 tests for catalog listing, rejected core-shaped tools, bounded
  read context, search validation, propose, validate, request approval, cancel,
  request apply, idempotent replay, and actor provenance.
- Require S154 review to check for duplicate state machines, HTTP self-calls,
  body-supplied actors, unbounded search, core-shaped vocabulary, and premature
  permission/interrupt implementation.
- Require S155 verification to prove registered agents can use semantic aliases
  while the same agents cannot invoke direct core writes or smuggle core verbs
  through tool payloads.

## Outcome

S151 grounds W12.P31 as a narrow semantic alias layer over the existing Rust
authoring backend. The phase should create an `authoring::tools` module and
wire it through the API surface, but it should not create a second proposal,
approval, apply, permission, or interrupt state machine.

The governing decision remains viable: frontend users and LangGraph agents both
collaborate through the Rust backend and its semantic authoring commands, while
`vaultspec-core` stays behind the backend apply boundary. No reviewed evidence
contradicted that direction.

The principal S152 implementation gap is search reuse. The existing bounded
search behavior is route-local, so S152 needs either a reusable internal search
helper or an authoring-local implementation that preserves the same caps and
validation behavior.

## Notes

- No code was changed for S151 beyond this execution record.
- No tests were run for S151 because this row is requirement grounding; feature
  and plan checks are run after closing the row.
- Independent sidecar finding: `tools.rs` does not exist yet, bounded search
  validation is currently route-local, and W12.P31 must keep W12.P22 and
  W12.P32 deferrals explicit.
