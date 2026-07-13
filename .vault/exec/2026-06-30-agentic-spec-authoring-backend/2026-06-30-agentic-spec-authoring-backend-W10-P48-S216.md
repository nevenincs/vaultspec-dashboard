---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S216'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground System-actor auto-approval, after-the-fact review lane, and kill switch requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Run `vaultspec-rag` semantic discovery over the current plan, rollout
  reference, accepted operation-modes ADR, review-station ADR, approval-gates
  ADR, security-provenance ADR, and existing authoring policy/projection/apply
  modules.
- Re-read the binding `W10.P48` plan rows after `W10.P21` was completed and
  summarized.
- Cross-check the accepted operation-mode decision against the current
  `policy.rs`, approval record, apply lifecycle, review projection, frontend
  store, and review-station card seams.
- Convert the accepted mode requirements into the checklist for `S217`, `S218`,
  and `S220`.

## Outcome

`W10.P48` is the execution half of the accepted operation-modes decision. The
phase must compose the `W10.P21` policy decision data with the existing approval,
apply, rollback, and projection machinery. It must not fork the changeset
lifecycle, relax apply-time revision or validation checks, widen the destructive
human-approval floor, or absorb the direct editor-save dual-run work owned by
`W10.P49`.

`S217` implementation checklist:

- Add the `modes.rs` backend module and export it through `mod.rs`. The module is
  the mode execution layer: it may call `policy.rs`, `approvals.rs`, `apply.rs`,
  and `projections.rs`, but it must not duplicate their rules.
- Represent scope operation mode as backend policy data with `manual` as the
  default. For this phase, implement the smallest durable scope store needed for
  a worktree-scoped mode plus policy version metadata; keep per-session override
  as the policy input path already modeled by `policy.rs` unless the current route
  surface already has a real session source to bind.
- Auto-approve only when the served policy decision is
  `system_auto_approvable`, the changeset is non-destructive, and the reviewer is
  a genuine `system` actor. Use the `system_auto_approval_eligibility` helper
  rather than rechecking actor kind in ad hoc branches.
- Record auto-approval as a normal approval decision bound to the reviewed tuple:
  policy version, proposal revision, validation digest, reviewer identity, and a
  decision payload/comment naming the mode policy authority. Do not write an
  alternate approval table or skip the approval request shape.
- Preserve the canonical lifecycle: `needs_review` or submitted proposal reaches
  `approved` under the system actor, then the normal apply command drives
  `applying` to `applied` or failure. No auto-approved changeset may bypass
  approval, applying, receipts, preimage, outbox, idempotency, or rollback
  material.
- Keep the destructive floor absolute. Rollback changesets, rename/archive/
  unarchive, empty operation sets, and any policy-human-required changeset queue
  for explicit human approval in every mode.
- Add the after-the-fact review lane as backend-served projection data, not a
  frontend-derived filter. The lane contains changesets applied under recorded
  system-actor mode approval, ordered by apply time, carrying policy reference,
  diff/review detail availability, and rollback availability.
- Make after-the-fact review acknowledgement append-only and non-gating. Acknowledge
  is audit/projection state; rollback remains the existing normal rollback
  proposal command.
- Add a thin frontend lane that consumes the served after-the-fact projection and
  exposes the existing one-command rollback action when the backend says rollback
  is available. The frontend must not infer whether a row was auto-applied.
- Implement kill-switch downgrade semantics as a policy write. New approvals use
  the downgraded mode immediately. Existing system approvals that have not
  entered `applying` are marked stale or otherwise re-queued through the existing
  stale-approval policy-change semantics so the human queue sees them again.
- Preserve changesets already `applying`: they complete through the existing
  apply completion path and land in the after-the-fact lane if the recorded
  system approval applied them.
- Keep LangGraph runtime wiring, tool-permission interrupts, direct editor-save
  dual-run, and legacy write-broker retirement out of this phase.

`S218` test checklist:

- Prove eligible non-destructive authoring changesets in `assisted` and
  `autonomous` can be approved by the system actor and reach the normal approved
  state with a recorded approval tuple.
- Prove the normal apply path is reused for an auto-approved changeset and still
  records `applying`, `applied`, receipt, and rollback preimage state.
- Prove destructive operations and rollback changesets remain human-gated in
  every mode and are not system-auto-approved.
- Prove non-system actors cannot use the auto-approval path, including agents and
  tool executors.
- Prove the after-the-fact lane includes applied-under-policy items with policy
  reference and rollback availability, and excludes manual human approvals.
- Prove acknowledgement of an after-the-fact row is append-only and does not
  change lifecycle authority.
- Prove a mode downgrade re-queues or stales not-yet-applying system approvals
  while preserving already-applying changesets.
- Prove the policy downgrade stale reason is surfaced as policy/version staleness,
  not as a frontend-inferred state.
- Prove frontend store/render tests consume served lane data and preserve absence
  as absence.

`S220` verification checklist:

- Run the focused backend mode tests, approval/policy/projection tests, and the
  authoring HTTP route tests that cover the new served lane and kill-switch
  route.
- Run frontend store and review-station render tests for the after-the-fact lane
  and rollback button.
- Run `cargo check` for `vaultspec-api` and `npm run typecheck` for the frontend.
- Verify the demo path at the data-contract level: set scope mode to
  `autonomous`, submit a body-edit proposal, observe system approval, apply
  through the canonical apply path, find the applied row in the after-the-fact
  lane, generate rollback, then downgrade mode and observe pending auto approvals
  re-queued for human review.

## Notes

`vaultspec-rag` found no contradiction in the rewritten architecture direction.
The accepted ADR supports the hypothesis that the dashboard backend should own
the shared authoring surface while `vaultspec-core` remains the private
validation/materialization adapter. The code already reflects the intended split:
`policy.rs` is policy data, `approvals.rs` records durable approval decisions,
`apply.rs` owns materialization through the core adapter, and `projections.rs`
serves review state. `W10.P48` should wire those seams together rather than
creating a second autonomous pipeline.

Known implementation risk: `approvals.rs` currently records only a generic
approve/reject decision and policy version, not a structured mode-policy decision
payload. If the phase cannot persist the policy id/version as structured data
without a broad migration, the minimum acceptable V1 fallback is a backend-owned
system-approval marker that is durable, queryable for the after-the-fact lane, and
covered by tests.
