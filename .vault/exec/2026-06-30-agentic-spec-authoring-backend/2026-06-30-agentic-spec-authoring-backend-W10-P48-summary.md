---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` `W10.P48` summary

W10.P48 is complete for system-actor auto-approval, the after-the-fact review
lane, and the kill switch.

- Created: `engine/crates/vaultspec-api/src/authoring/modes.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/mod.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/model.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/api.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/http.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/approvals.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/actors.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/store/mod.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/transitions.rs`
- Modified: `engine/crates/vaultspec-api/src/authoring/projections.rs`
- Modified: `frontend/src/stores/server/authoring.ts`
- Modified: `frontend/src/stores/server/authoring.test.ts`
- Modified: `frontend/src/app/authoring/ReviewStation.tsx`
- Modified: `frontend/src/app/authoring/ReviewStation.render.test.tsx`
- Modified: `.vault/audit/2026-07-06-agentic-spec-authoring-backend-audit.md`
- Created: W10.P48 Step Records `S216` through `S220`

## Description

The phase grounded the accepted operation-modes decision into implementation,
then added a durable worktree-scoped operation-mode store with `manual` as the
default, system actor registration, and a mode write route that denies agent
principals. Eligible non-destructive changesets can now receive a normal
system-actor approval under assisted or autonomous policy while traversing the
existing lifecycle; destructive work remains human-gated.

Autonomous mode reuses the canonical apply command instead of bypassing review,
idempotency, receipts, preimages, or rollback. The submit route now also handles
the retry case where the first autonomous request already advanced the changeset
past review: same-key retries replay the original approval-open result instead
of conflicting or revalidating against an applied head.

The review-station projection now includes a backend-served
`applied_under_policy` lane. Lane rows carry the normal proposal projection,
system policy metadata, acknowledgement count, and rollback availability. Detail
projection preserves after-the-fact review evidence by serving base text from
the durable materialization preimage rather than the current worktree body, so an
already-applied autonomous change still shows the original before/after text.

The kill switch is implemented as a policy downgrade path: not-yet-applying
system-approved changesets are requeued through the existing review lifecycle,
old system approvals are marked stale, replacement human approvals are opened,
and the visible review item serves the backend-authored
`policy_version_changed` reason while remaining actionable.

S219 review found two high and two medium issues across retry idempotency,
after-fact diff preservation, and stale-policy visibility. All were resolved and
cleared by follow-up reviewer agents.

Verification passed:

- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::modes -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
- `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
- `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
- `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
- `npm run typecheck`
- `git diff --check -- ...` over the edited W10.P48 files

Known remaining note: after-the-fact acknowledgement is implemented as durable
append-only repository state and count projection, but no user-facing
acknowledgement route or control is exposed in this phase. Rollback remains the
reviewer's active command for an applied-under-policy item.
