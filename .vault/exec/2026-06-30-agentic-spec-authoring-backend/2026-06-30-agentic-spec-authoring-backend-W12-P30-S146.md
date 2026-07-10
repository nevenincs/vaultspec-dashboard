---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S146'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground LangGraph runtime mapping requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground `W12.P30.S146` against the binding plan, the LangGraph integration ADR,
  the authoring state-store ADR, the V1 API contract ADR, the
  security/provenance ADR, and the streaming/outbox ADR.
- Search the vault and code with `vaultspec-rag` for LangGraph thread, run,
  checkpoint, interrupt, and product-record mapping surfaces.
- Inspect the current authoring model, API fixtures, session records, store
  schema, recovery path, and fenced module tree.
- Check current official LangGraph documentation for persistence, interrupts,
  thread/run APIs, and stream joining before freezing the implementation
  checklist.
- Dispatch a read-only grounding sidecar for the W12.P30 integration surface
  and reconcile its implementation, test, review, and verification findings.

## Outcome

- `W12.P30` is a runtime-reference mapping phase. LangGraph threads, runs,
  checkpoints, and runtime errors may be created, correlated, and persisted as
  references, but Vaultspec sessions, prompt turns, runs, proposals, approvals,
  apply receipts, outbox events, and recovery snapshots remain product truth.
- The current code already has typed `LangGraphThreadId`, `LangGraphRunId`,
  `LangGraphCheckpointId`, and `LangGraphRef` model values, and the W12.P25
  session/turn/run tables already have nullable LangGraph reference columns.
  `W12.P30` should reuse those types and columns rather than creating a second
  runtime identity model.
- `W12.P30.S147` must add `langgraph.rs`, register it from the authoring module,
  and keep LangGraph API shape churn behind an adapter boundary. The module
  should own runtime availability, thread creation, run creation/reference
  mapping, checkpoint-reference capture, and redacted runtime error mapping.
- `W12.P30.S147` must add a repository/update path for attaching runtime-created
  LangGraph refs to existing Vaultspec session/turn/run records. The current
  session code primarily stores refs supplied on create/start requests; runtime
  mapping needs an adapter-owned path so clients do not have to fabricate refs.
- Checkpoint IDs are correlation/provenance fields only. No checkpoint payload,
  raw LangGraph state, raw event stream, prompt body, token stream, or tool-debug
  payload may become the only copy of product state or be persisted into product
  schemas as history.
- Runtime errors must be redacted before crossing the public authoring surface:
  safe category and operator-oriented message are allowed, but URLs, tokens,
  prompts, raw request/response bodies, and provider diagnostics stay private.
- `CreateSessionRequest.langgraph` and `StartPromptTurnRequest.langgraph`
  currently allow caller-supplied refs. `W12.P30.S147` must explicitly decide
  whether those remain compatibility inputs, are validated/overwritten by the
  runtime adapter, or are narrowed to adapter-owned creation to avoid bypassing
  runtime mapping.
- No new public core-shaped endpoint is allowed. Runtime mapping feeds semantic
  authoring commands and product records; agents still interact through the
  authoring API and later semantic tool aliases.
- `W12.P30.S148` test checklist:
  - Unavailable runtime returns a typed, redacted error without leaking URL,
    token, prompt, or raw runtime response data.
  - Thread creation produces a valid `LangGraphRef` and persists the
    `thread_id` on the Vaultspec session.
  - Run mapping stores runtime `run_id` on the Vaultspec run without replacing
    the Vaultspec `RunId`.
  - Checkpoint reference storage survives store reopen and appears in recovery
    snapshots as a reference only.
  - Runtime API errors preserve internal diagnostics for logs/tests while
    exposing only the redacted public category/message.
  - Tests use real adapter and store code paths with temp stores; no fakes,
    stubs, monkeypatches, skips, xfails, or duplicated business logic.
- `W12.P30.S149` review checklist:
  - LangGraph is not document, proposal, approval, apply, rollback, or audit
    authority.
  - Raw LangGraph and Agent Server payload shapes are hidden behind the adapter
    and do not leak into durable product schemas.
  - No direct `.vault/` writes, git mutation, or public `vaultspec-core` shaped
    routes are introduced.
  - Idempotency and replay implications at thread/run creation and checkpoint
    reference capture are explicit.
  - Error taxonomy follows denials-as-values and faults-as-errors.
- `W12.P30.S150` verification checklist:
  - A session and run can recover after store restart with Vaultspec-owned
    records intact when only LangGraph checkpoint references exist.
  - Pruning or losing checkpoint payloads would not delete proposals, approvals,
    apply records, lifecycle events, or snapshots.
  - Recovery snapshots and event replay continue to use backend envelopes and
    tiers, not raw LangGraph events.
  - Checkpoint ids are visible only as correlation/provenance references.
- Explicit deferrals: semantic tool aliases stay in `W12.P31`, tool permission
  requests stay in `W12.P22`, interrupt normalization and resume-by-interrupt-id
  stay in `W12.P32`, bounded generation/token channels stay in `W12.P44`, and
  the full LangGraph authoring fixture stays in `W12.P41`.

## Notes

- `langgraph.rs` does not exist yet; `W12.P30.S147` owns creating it.
- The current Rust crate has no obvious dedicated LangGraph HTTP client module.
  If S147 needs a live Agent Server client, it must either use existing project
  HTTP primitives, add a dependency deliberately, or first implement a narrower
  adapter boundary that can be exercised without widening product scope.
- Current LangGraph documentation preserves the ADR's split: checkpointers hold
  thread-scoped graph state, application stores hold cross-thread application
  memory, interrupts resume with `Command(resume=...)`, multiple simultaneous
  interrupts should be resumed by interrupt id, and Agent Server exposes
  thread/run APIs and a thread stream join surface. This supports the
  Vaultspec decision to persist only references and normalized product records.
