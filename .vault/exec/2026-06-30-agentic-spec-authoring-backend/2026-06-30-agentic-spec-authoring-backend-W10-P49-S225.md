---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-08'
step_id: 'S225'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Verify the Increment 2 demo: set scope to autonomous, have a script propose a body edit, watch it apply with no human gate, find it in the after-the-fact lane, roll it back, then flip the kill switch mid-flight and watch a pending auto-approval re-queue for manual review

## Scope

- `engine/crates/vaultspec-api/src/authoring/direct_write.rs`

## Description

- Run the S225 backend and frontend verification pass for the Increment 2
  autonomous-authoring demo.
- Dispatch frontend and backend review agents for the S225 closure criteria and
  record their findings in the phase audit.
- Add a frontend authoring-status adapter, client method, query key, and hook so
  the direct-write capability status is consumed through the store boundary.
- Add one route-level Increment 2 demo contract test covering autonomous submit,
  system approval, canonical apply, after-the-fact lane projection, rollback
  generation, and kill-switch downgrade requeue.
- Fix the apply/core materialization fence so authoring receipts keep body-level
  hashes while `vaultspec-core vault set-body` receives the full-file blob hash
  it expects for optimistic locking.
- Re-run the focused backend/frontend verification set and update the audit
  findings as resolved.

## Outcome

S225 is complete. The Increment 2 demo contract is now proven as one backend
route/data-contract scenario: autonomous mode accepts an eligible body edit from
an agent, records system approval, applies it through the normal apply path,
serves it in the after-the-fact lane with rollback availability, generates the
rollback changeset, and requeues a not-yet-applying system approval for manual
review when the mode is downgraded.

The S225 review pass also closed the frontend status gap: the dashboard store now
consumes `/authoring/status` direct-write capability fields instead of inferring
them from core envelopes or leaving them backend-only.

The new acceptance test exposed a real apply/core mismatch. Authoring snapshots
use body payload hashes for review and post-state verification, while
`vaultspec-core vault set-body` fences against the full markdown file blob. The
apply path now computes that full-file fence only for the internal core
invocation and leaves the authoring receipt semantics unchanged.

## Notes

- Verification passed:
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::direct_write -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::apply -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::modes -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::rollback -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::response -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::store -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::api -- --nocapture`
  - `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `cargo fmt -p vaultspec-api --manifest-path engine/Cargo.toml --check`
  - `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
  - `npm run typecheck`
  - `git diff --check -- engine/crates/vaultspec-api/src/authoring/apply.rs engine/crates/vaultspec-api/src/authoring/http.rs frontend/src/stores/server/authoring.ts frontend/src/stores/server/authoring.test.ts`
- Existing temporary-workspace watcher and declared-tier warnings still appear in
  some backend test output after assertions pass.
