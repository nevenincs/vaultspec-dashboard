---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S217'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Implement mode-scoped system-actor auto-approval, the after-the-fact review-station lane, kill-switch re-queue on mode downgrade, and its thin frontend lane with one-command rollback

## Scope

- `engine/crates/vaultspec-api/src/authoring/modes.rs`

## Description

- Add the `modes.rs` execution layer for worktree-scoped operation modes, system-actor auto-approval markers, after-the-fact acknowledgements, and downgrade requeue.
- Extend the authoring store schema to persist mode events, recorded system-policy approvals, after-the-fact acknowledgements, and system actor records.
- Add the `set_operation_mode` command route, route-family metadata, and backend-derived worktree scope.
- Invoke mode auto-approval after submit using the existing policy and approval helpers, then run autonomous auto-apply through the normal `apply_changeset` path.
- Serve `applied_under_policy` as a backend projection lane and consume it in the frontend store/review station without deriving it from proposal status or actor.
- Add a thin frontend lane that reuses the existing proposal card and rollback command when the backend reports rollback availability.
- Deny operation-mode policy writes from agent principals; only human or system principals may change the mode.

## Outcome

S217 is complete. The implementation keeps mode behavior on the existing lifecycle:

- `manual` remains the default scope mode.
- Eligible non-destructive changesets in `assisted` and `autonomous` receive a normal system-actor approval decision bound to the reviewed tuple.
- `autonomous` mode then applies through the same idempotent apply command used by human-approved work.
- Destructive or otherwise human-required changesets remain queued for human approval.
- Downgrading mode requeues not-yet-applying system-approved changesets by marking the old approval stale and opening a fresh human review request.
- Applied system-approved changesets appear in the backend-served after-the-fact lane, with rollback still driven by the standard rollback command.

## Notes

- Verification passed:
  - `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::actors -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::policy -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
  - `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
  - `npm run typecheck`
- The first frontend verification attempt was run from the workspace root and failed because no root `package.json` exists; rerunning from `frontend` passed.
- The Rust HTTP test target still emits existing temporary watcher warnings after the passing result.
- Dedicated behavior tests for eligible auto-approval, destructive floor, after-the-fact lane contents, kill-switch requeue, and stale system approval remain assigned to S218.
