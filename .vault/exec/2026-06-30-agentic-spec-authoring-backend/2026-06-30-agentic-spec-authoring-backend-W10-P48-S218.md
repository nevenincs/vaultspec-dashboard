---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S218'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add mode tests for eligible auto-approval, the destructive-op human floor, after-the-fact lane contents, kill-switch re-queue, and stale system approval on policy downgrade

## Scope

- `engine/crates/vaultspec-api/src/authoring/modes.rs`

## Description

- Add real store-backed mode tests for eligible autonomous auto-approval, destructive-operation human floor, after-the-fact lane projection, and downgrade requeue.
- Build S218 fixtures through actual actor records, ledger revisions, preimage capture, proposal materialization, validation digest storage, and approval requests.
- Add a route-level assertion that agent principals cannot change operation-mode policy.
- Extend the frontend lane render test to assert served mode-policy metadata and acknowledgement count.

## Outcome

S218 is complete. The test coverage now proves:

- An eligible non-destructive changeset in `autonomous` mode receives a normal system-actor approval and reaches `approved`.
- A destructive operation in `autonomous` mode remains human-gated and records no system decision.
- A system-approved applied changeset appears in the backend-served after-the-fact lane with mode policy metadata and rollback availability.
- Downgrading from `autonomous` to `manual` requeues a not-yet-applying system-approved changeset, marks the old approval stale, and opens a fresh queued approval.
- Agent principals receive a denial value when attempting to write operation-mode policy.
- The frontend lane renders the served mode-policy reference and uses the existing rollback command.

## Notes

- Verification passed:
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::modes -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml operation_mode_policy_write_denies_agent_principal -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
  - `npm run typecheck`
  - `git diff --check -- ...` over the edited S217/S218 files
- `git diff --check` reported only the existing CRLF/LF warning for the plan file.
- The Rust authoring suite still emits existing temporary watcher/core-tier warnings after passing tests.
