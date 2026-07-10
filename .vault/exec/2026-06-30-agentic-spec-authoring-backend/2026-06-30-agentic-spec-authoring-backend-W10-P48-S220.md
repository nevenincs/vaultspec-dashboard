---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-06'
step_id: 'S220'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify eligible changesets auto-approve under system-actor authority, appear in the after-the-fact lane with rollback available, and a mode downgrade re-queues in-flight auto-approvals for human review

## Scope

- `engine/crates/vaultspec-api/src/authoring/modes.rs`

## Description

- Run focused mode verification for autonomous system approval, destructive
  human floor, after-the-fact lane inclusion, rollback availability, and
  downgrade requeue.
- Run projection verification for backend-served after-the-fact review state,
  durable preimage-backed detail text, rollback availability, bounded lists, and
  served policy reason projection.
- Run HTTP verification for mode-route authorization, submit replay after an
  already-applied head, normal submit/review/apply route behavior, and typed
  denials.
- Run the authoring-wide backend test target after S219 fixes.
- Run frontend adapter/render verification for after-the-fact rows, rollback
  controls, policy metadata, and served stale-reason rendering.
- Run backend and frontend type checks.

## Outcome

S220 is complete. The verified W10.P48 behavior is:

- Eligible non-destructive changesets can be auto-approved by the recorded
  `system` actor under autonomous mode.
- Destructive operations remain human-gated in autonomous mode.
- Applied-under-policy changesets are served in the after-the-fact lane with
  mode policy metadata and rollback availability.
- Review detail for an applied-under-policy item still serves the original
  before/after material by reading the durable preimage, not current worktree
  bytes.
- A mode downgrade requeues not-yet-applying system approvals for human review,
  leaves the replacement approval actionable, and serves the policy-change stale
  reason on the visible review item.
- Retrying submit after an autonomous path has advanced the head beyond review
  replays the original submitted approval rather than conflicting or denying.
- The frontend consumes served lane and stale-reason state directly.

## Notes

- Verification passed:
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::modes -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
  - `npm run typecheck`
- Rust authoring tests still emit existing temporary watcher/core-tier warnings
  after passing tests.
