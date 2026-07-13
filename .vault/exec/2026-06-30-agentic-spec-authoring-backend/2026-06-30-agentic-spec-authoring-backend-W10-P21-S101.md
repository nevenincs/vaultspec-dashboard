---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S101'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Ground Approval policy matrix requirements into the phase checklist

## Scope

- `.vault/adr/`

## Description

- Run `vaultspec-rag` semantic discovery over the current plan, rollout
  reference, operation-mode ADR, approval-gates ADR, security-provenance ADR,
  frontend review station store, backend routes, and existing policy module.
- Re-read the binding `W10.P21` plan rows after the plan advanced to 120 of 240
  checked steps.
- Cross-check the accepted operation-mode decision against the approval policy
  and security-provenance amendments.
- Convert the policy requirements into the checklist for `S102`, `S103`, and
  `S105`.

## Outcome

`W10.P21` is the first unchecked phase after the Increment 1 frontend skeleton.
The phase starts Increment 2 and must represent approval requirements,
freshness rules, reviewer eligibility, tool permission gates, and policy reasons
as backend policy data. It must not execute autonomous mode or create the
after-the-fact lane; those belong to `W10.P48`.

`S102` implementation checklist:

- Define the policy vocabulary as backend data: `manual`, `assisted`, and
  `autonomous` operation modes, with `manual` as the default.
- Resolve per-scope mode plus optional per-session override with narrowing-only
  semantics. A session may become more manual than its scope, never more
  autonomous; a widening override must be ignored with a served reason.
- Classify changeset risk from `ChangesetKind` and child operation kinds. The
  destructive floor is absolute: rollback, rename, archive, unarchive, and any
  unknown or empty operation set require human approval in every mode.
- Compute approval requirements as policy data: non-destructive changesets need
  human approval in `manual`, and are system-auto-approvable in `assisted` or
  `autonomous`; destructive changesets always need human approval.
- Reuse the existing agent self-approval ban from the approval layer instead of
  re-deriving it. Agent and tool-executor self-approval remain forbidden; human
  self-approval is allowed for the later direct-changeset path.
- Define system auto-approval eligibility as a policy fact only: it requires a
  genuine `system` actor and a `system_auto_approvable` requirement. The actual
  system-actor approval record, automatic apply traversal, kill switch, and
  after-the-fact lane are `W10.P48`.
- Define tool permission policy separately from changeset approval. Read/context
  tools can be auto-permitted; mutating and dangerous tools require a human
  gate; tool permission must never substitute for final changeset approval.
- Classify approval stale conditions from the existing freshness tuples:
  proposal revision changed, target revision changed, validation digest changed,
  policy version changed, and run cancellation. Missing approval is absence, not
  staleness.
- Serve a policy decision projection that includes policy version, scope mode,
  session override, effective mode, risk class, approval requirement, and a
  human-readable reason. The frontend must render this served state rather than
  infer policy locally.
- Keep the phase pure and bounded. No policy store, no mode mutation route, no
  system-actor execution, no review-lane projection, no LangGraph wiring, and no
  direct editor-save dual-run belongs in `W10.P21`.

`S103` test checklist:

- Prove the destructive floor holds in every mode and non-destructive
  authoring changes follow the manual/assisted/autonomous matrix.
- Prove narrowing-only session override behavior, including the served reason
  for an ignored widening override.
- Prove reviewer eligibility refuses agent and tool-executor self-approval while
  permitting human self-approval and distinct reviewers.
- Prove system auto-approval eligibility is allowed only for a `system` actor
  and a system-auto-approvable policy requirement.
- Prove tool permission gates distinguish read-only, mutating, and dangerous
  tool classes without treating tool permission as changeset approval.
- Prove stale-condition classification for validation, proposal revision,
  target revision, policy version, and cancelled run.
- Prove policy projections reject unknown fields and carry the backend-served
  reason string.

`S105` verification checklist:

- Confirm frontend review surfaces and stores consume served policy/eligibility
  state and do not recompute mode, risk, or approval requirements.
- Confirm no authoring API accepts a request-body actor for policy decisions;
  actor identity remains resolved through the principal seam.
- Confirm the policy layer does not fork lifecycle states or relax apply-time
  validation and revision checks.
- Confirm `W10.P48` remains the owner of auto-approval execution, after-the-fact
  review, kill-switch requeue, and autonomous apply.

## Notes

`vaultspec-rag` found that `engine/crates/vaultspec-api/src/authoring/policy.rs`
already exists while `W10.P21` is still unchecked. The next step must therefore
verify and adapt the existing implementation against this checklist rather than
blindly reimplementing it. The plan also reports earlier checked rows without
execution records; that is a traceability gap to repair, but it does not change
the next unchecked row in document order.
