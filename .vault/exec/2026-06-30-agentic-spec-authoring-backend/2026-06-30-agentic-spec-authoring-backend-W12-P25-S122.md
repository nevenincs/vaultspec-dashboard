---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S122'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement session creation, prompt turns, run ownership, cancellation, active state, and recovery snapshot handlers

## Scope

- `engine/crates/vaultspec-api/src/authoring/session.rs`

## Description

- Add the `authoring::session` domain module for durable session, prompt-turn, run, cancellation, listing, and snapshot records.
- Add V1 request DTOs for prompt turns, run cancellation, and run resume/join.
- Add store schema version 13 with `authoring_sessions`, `authoring_prompt_turns`, and `authoring_runs` tables plus bounded listing and active-run indexes.
- Attach typed session repositories to `UnitOfWork` and route all session mutations through the existing idempotency and actor-principal patterns.
- Publish `session.created`, `run.started`, and `cancellation.recorded` lifecycle events through the transactional outbox in the same unit of work as product-state writes.
- Mount session, prompt-turn, cancel, and resume routes under the existing authoring router and principal middleware.
- Replace the pre-W12 recovery rejection with bounded session/run snapshot recovery while preserving proposal recovery.
- Report the backend `sessions` capability as enabled after route, store, and recovery wiring.
- Run `cargo fmt -p vaultspec-api`.
- Run `cargo check -p vaultspec-api`.

## Outcome

- The authoring backend now has durable product-state storage for sessions, prompt turns, active run ownership, cancellation state, and recovery snapshots.
- `POST /authoring/v1/sessions` creates idempotent backend-owned sessions with actor identity resolved only from `ResolvedCommand`.
- `GET /authoring/v1/sessions` serves bounded listings with a cap, truncation flag, and next marker.
- `GET /authoring/v1/sessions/{session_id}` serves backend-owned session snapshots.
- `POST /authoring/v1/sessions/{session_id}/turns` starts one active run or joins an existing active run without creating a duplicate.
- `POST /authoring/v1/runs/{run_id}/cancel` records durable cancellation and clears active state.
- `POST /authoring/v1/runs/{run_id}/resume` joins/reads an existing run snapshot without implementing LangGraph interrupt resume.
- `GET /authoring/v1/recovery` accepts `session_id` and `run_id` filters and includes bounded session snapshot data in the recovery payload.
- `cargo check -p vaultspec-api` passed after formatting.

## Notes

- `recovery.snapshot_served` remains a review point: the existing recovery route is a read-only GET using `CommandKind::RecoverEventStream` and SQLite `query_only`, so S122 does not write an outbox event from that read path.
- LangGraph runtime calls, interrupt resume values, tool aliases, generation streams, leases, and conflict/rebase behavior remain deferred to their later plan phases.
- S123 owns the full real-behavior test expansion for idempotency replay/conflict, restart recovery, cancellation, active-run join, bounded listing, route tiers, and proposal `session_id` validation.
