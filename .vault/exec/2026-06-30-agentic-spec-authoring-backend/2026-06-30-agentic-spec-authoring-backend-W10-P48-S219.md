---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S219'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Run System-actor auto-approval, after-the-fact review lane, and kill switch code review and record the phase audit

## Scope

- `.vault/audit/`

## Description

- Ground the W10.P48 review against the accepted operation-modes ADR, S216-S218
  execution records, the current plan row, and the live implementation.
- Run a read-only `vaultspec-code-reviewer` pass over the mode execution layer,
  submit/apply route composition, after-the-fact projection, kill switch, and
  frontend lane.
- Record three W10.P48 audit findings: submit retry after autonomous apply,
  after-the-fact diff erasure after apply, and missing policy-version stale
  reason.
- Fix the high retry finding by replaying same-key submits whose approval-open
  step already exists after the changeset head advanced beyond review.
- Fix the high diff finding by serving review-detail base text from the durable
  materialization preimage instead of the current worktree body.
- Fix the stale-reason finding by carrying backend-authored approval
  `stale_reason` through records, projections, the frontend adapter, and the
  review-station label.
- Fix the follow-up served-projection gap by overlaying the policy requeue reason
  onto the projected replacement approval so the human review row carries the
  kill-switch reason while remaining actionable.
- Add regression coverage for route replay after an applied head, durable
  preimage-backed detail text, kill-switch policy stale reason, frontend stale
  reason rendering, and served stale-reason adaptation.
- Update the rolling audit record with the original findings and the S219 fix
  resolutions.

## Outcome

S219 review found and resolved all blocking issues discovered in the W10.P48
review pass.

The route-level autonomous retry gap is closed: a submit retry with the same
idempotency key now replays the original approval-open result after a prior
request has advanced the changeset to `approved`, `applying`, or `applied`.

The after-the-fact review detail now keeps the original base text available
after apply by reading the persisted preimage associated with the materialized
operation. Current worktree reads remain the conflict-detection source, not the
review evidence source.

The kill-switch stale-policy evidence is now backend-served. Stale approval
records can carry `stale_reason`, downgrade requeue marks the old system approval
as `policy_version_changed`, projections serve it, and the frontend renders the
served policy-change reason.

Follow-up review found that the first fix only attached the stale reason to the
old invalidated approval, while the review queue serves the replacement approval.
That gap is resolved: projections now serve the policy requeue reason on the
replacement review item without marking the replacement approval stale.

## Notes

- Verification passed:
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml submit_route_replays_after_auto_apply_advanced_the_head -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml detail_projection_keeps_original_base_after_worktree_matches_target -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml mode_downgrade_requeues_not_yet_applying_system_approval_as_human_review -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::approvals -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::projections -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::modes -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring::http -- --nocapture`
  - `cargo test -p vaultspec-api --manifest-path engine/Cargo.toml authoring -- --nocapture`
  - `cargo check -p vaultspec-api --manifest-path engine/Cargo.toml`
  - `npm test -- src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx`
  - `npm run typecheck`
  - `git diff --check -- ...` over the edited S219 files
- The Rust authoring suite still emits existing temporary watcher/core-tier
  warnings after passing tests.
- The first follow-up reviewer found one remaining medium projection gap; the
  follow-up fix passed focused `authoring::modes`, `authoring::projections`,
  `cargo check`, frontend test, and frontend typecheck verification.
