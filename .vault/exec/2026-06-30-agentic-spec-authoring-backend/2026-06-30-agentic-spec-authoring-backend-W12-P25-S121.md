---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S121'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Sessions prompt turns and recovery snapshots requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Ground `W12.P25.S121` against the binding plan, the authoring state-store ADR, the LangGraph integration ADR, the V1 API contract ADR, the security/provenance ADR, and the streaming/outbox ADR.
- Search the vault and code with `vaultspec-rag` for session, prompt-turn, run-ownership, cancellation, and recovery-snapshot surfaces.
- Inspect the existing V1 DTO fixtures, authoring router, recovery stream placeholder, store migration runner, unit-of-work repository pattern, outbox repository, and actor principal seam.
- Dispatch a read-only review sidecar for the W12.P25 integration surface and reconcile its route, table, test, and deferral findings.

## Outcome

- `W12.P25` is a durable product-state phase. Authoring sessions, prompt turns, run ownership, cancellation, active state, and recovery snapshots must live in the authoring store, not in frontend memory, dashboard view sessions, LangGraph checkpoints, or `vaultspec-core`.
- `LangGraphRef` values are correlation/provenance only in this phase. `W12.P25` may store optional `thread_id`, `run_id`, and `checkpoint_id` references, but it must not call the LangGraph runtime, resume interrupts, or make checkpoints the only copy of product state. Runtime mapping stays in `W12.P30`.
- The minimum backend route contract for `W12.P25` is locked as:
  - `POST /authoring/v1/sessions` creates a session through `CommandKind::CreateSession`.
  - `GET /authoring/v1/sessions` returns a bounded session listing with truncation and a next marker.
  - `GET /authoring/v1/sessions/{session_id}` returns one backend-owned session snapshot.
  - `POST /authoring/v1/sessions/{session_id}/turns` starts a prompt turn and owns or joins the active run through `CommandKind::StartPromptTurn`.
  - `POST /authoring/v1/runs/{run_id}/cancel` records cancellation through `CommandKind::CancelRun`.
  - `POST /authoring/v1/runs/{run_id}/resume` is limited to joining/reading an already-known active run in this phase; interrupt-value resume remains deferred to the later permission/interrupt phases.
  - `GET /authoring/v1/recovery?last_seq=&session_id=&run_id=` must stop rejecting session/run parameters and return authoritative bounded session/run snapshot data alongside the existing proposal recovery snapshot.
  - `GET /authoring/v1/events?last_seq=` continues to replay lifecycle outbox events and must include session/run lifecycle events once the state mutations exist.
- `W12.P25.S122` must add `session.rs`, register it from `mod.rs`, and wire the routes from `http.rs` through the existing `ResolvedCommand` principal seam and tiered response helpers. Sessions must bind to the server-resolved actor; no request body actor field may be introduced.
- `W12.P25.S122` must add a schema migration after store version 12. The durable shape needs separate records for authoring sessions, prompt turns, and runs, with indexes for bounded listing, session lookup, active run lookup, and restart recovery. The migration must bump `SCHEMA_VERSION`, append a `MIGRATIONS` entry, and preserve fail-loud migration metadata checks.
- `W12.P25.S122` must add typed repository methods through `UnitOfWork` rather than ad hoc store access. Mutating session commands use `with_unit_of_work`; recovery/list/snapshot reads use `with_read_unit_of_work`.
- `W12.P25.S122` must publish lifecycle outbox events in the same transaction as product state. Required events for this phase are session created, run started, cancellation recorded, and recovery snapshot served when recovery is explicitly requested.
- Idempotency is mandatory for create/start/cancel/resume command handlers. Replays must return the recorded outcome without duplicating session, turn, run, or outbox rows; request drift under the same idempotency key must remain a conflict.
- `CreateProposalRequest.session_id` currently accepts arbitrary session ids. Once session truth exists, proposal creation must reject unknown session ids or explicitly record a migration-safe compatibility decision before accepting legacy loose ids.
- `enabled_status_data` may report `sessions: true` only after the route, store, and recovery contracts are actually wired. `langgraph` remains false until the runtime mapping phase.
- Bounds for this phase are part of the contract: prompt text length, session listing cap, recovery snapshot size, and retained event replay must all be capped at creation.
- Explicit deferrals: LangGraph adapter/runtime calls, semantic tool aliases, tool-permission interrupts, interrupt resume payloads, bounded generation/token channels, transcript compaction, leases/fencing, conflict/rebase/supersession depth, and any direct `.vault/` writes.
- `W12.P25.S123` test checklist:
  - Create session persists in real SQLite and survives store reopen.
  - Create session idempotency replays without duplicate state or events and conflicts on payload drift.
  - Starting a prompt turn creates an ordered turn and active run.
  - Joining an active run returns the existing active run instead of creating a duplicate.
  - Cancelling a run records durable cancellation and recovery reflects it after restart.
  - Session listing is bounded, reports truncation, and exposes a next marker.
  - Recovery with `session_id` and `run_id` returns backend-owned state and `next_seq`.
  - Unknown `session_id` on proposal creation is rejected once validation is enabled.
  - Success and error responses carry `tiers`.
- `W12.P25.S124` review checklist:
  - No frontend-derived session truth.
  - No LangGraph checkpoint is the only copy of product history.
  - All list/recovery accumulators are bounded.
  - Idempotency replay cannot duplicate turns, runs, or outbox rows.
  - Actor identity is resolved only from the principal middleware.
- `W12.P25.S125` verification checklist:
  - Refreshed clients recover session/run state from backend snapshots.
  - Stream recovery resumes from `next_seq - 1`.
  - Engine restart after an active run and after a cancelled run preserves the same session/run state.
  - W11 proposal recovery behavior remains intact when no session/run filters are supplied.

## Notes

- The reference document still labels this work as `W06.P25`, while the binding plan labels it `W12.P25.S121-S125`. The plan is current and governs execution order.
- `api.rs` already defines `CreateSessionRequest`, `RecoveryRequest`, `SessionId`, `RunId`, and fixtures for `POST /authoring/v1/sessions`; turn, list, cancel, and resume route names were implied rather than frozen before this step.
- `stream.rs` currently rejects `session_id` and `run_id` recovery as unavailable before W12. That placeholder is the main S122 integration point and must be replaced without regressing proposal recovery.
- The read-only sidecar agreed with the route contract, the store ownership boundary, the W12.P30+ deferrals, and the warning that `vaultspec-session` is unrelated dashboard navigation state, not authoring workflow state.
