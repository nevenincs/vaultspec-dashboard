---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S01'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Emit a run.completed lifecycle event and transition RunStatus to Completed at the run-settle seam

## Scope

- `engine/crates/vaultspec-api/src/authoring/`

## Description

- Add `LifecycleEventKind::RunCompleted` with wire string `run.completed`, mirroring the existing `run.started` run-aggregate convention, in `events.rs` (both `as_str` and `from_str`).
- Add `CommandKind::CompleteRun` to the command enum and its `ALL` roster in `model.rs`; add the `CompleteRun` arm to the exhaustive `command_lifecycle_scope` match in `transitions/mod.rs` as `NotChangesetLifecycle` (completion touches no changeset).
- Add `CompleteRunRequest { summary: Option<String> }` in `api/mod.rs` and a bounded `validate_completion_summary` (non-empty, unpadded, <=500 bytes when present) in the session module.
- Add `SessionRepository::complete_run`, modeled on `cancel_run`: transition `Active`/`CancelRequested` -> `Completed`, set `completed_at_ms` and `active=false`, idempotent no-op when already terminal. Unlike `cancel_run`, the owning session is left `Active` so further turns may follow.
- Add the top-level `session::complete_run` command, mirroring `cancel_run`'s idempotent command path: it emits `run.completed` on the durable outbox with sequence replay via `append_session_event`, and maps `RunCompleted -> CompleteRun` in `context_command`.
- Mount `POST /authoring/v1/runs/{run_id}/complete` (`http/mod.rs`) with a `complete_run` handler (`handlers1.rs`) symmetric to `cancel_run`.
- Add a command-level test (transition, single `run.completed` emission, idempotent re-completion, already-terminal no-op, outbox replay across restart) and a live end-to-end HTTP route test (200, terminal status straight from the wire, session stays active, idempotent replay).

## Outcome

Code sits on branch `edge-activation` in an isolated worktree off clean HEAD, pending merge-back sequencing against a concurrent, uncommitted authoring-crate module-decomposition refactor that leaves the shared main tree non-compiling. The checkbox for this Step is intentionally left open until that merge-back lands (hold-until-truly-landed).

Verified green in the worktree: both S01 tests pass and the full `vaultspec-api` lib test target compiles; `cargo clippy --all-targets -- -D warnings` clean; `cargo fmt --check` clean. Mock-free: the HTTP test drives the real router, real store, and real outbox.

## Notes

CONTRACT ADDITION for the P05 reviewer to scrutinize: this Step introduces a new public authoring-plane surface `POST /authoring/v1/runs/{run_id}/complete` plus the `run.completed` lifecycle kind and `CommandKind::CompleteRun`. The run-settle seam is modeled as a driver-reported callback (the run's external driver — in this program the a2a orchestrator — reports completion), because the engine authoring plane is durable-state authority and does not drive generation in-process; the LangGraph runtime adapter is unwired dead code. Open question for review: who calls complete in the single-agent frontend case (no external orchestrator)? The transition itself is idempotent and safe to call from any driver; the trigger wiring for the single-agent path is not settled here.

Merge-back will conflict on `session/mod.rs` and `api/mod.rs`, which the concurrent refactor also gutted; the team lead sequences that landing.
