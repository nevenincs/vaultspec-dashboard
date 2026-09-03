---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:7af6abe74ddea13c5099879b1e15f68c219710b7b5652955d200c9b74688aa62'
step_id: 'S20'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Add the three reviewer approval policy copy strings and reword the manual human approval string off its former reviewer approval phrasing

## Scope

- `frontend/src/locales/en/documents.ts`

## Description

- Add three new policy copy strings: `assistedReviewerApproval`, `autonomousReviewerApproval`, `manualReviewerApproval` (the two unreachable non-manual combos reuse the same "reviewer approval" phrasing as their sibling mode for consistency; the manual entry reuses the exact string `manualHumanApproval` previously held).
- Reword `manualHumanApproval` off its former "Manual, reviewer approval" phrasing to "Manual, human approval required", matching the engine's `decision_reason` destructive-floor wording ("requires explicit human approval") now that this token exclusively denotes the destructive floor.
- Extend `frontend/src/localization/catalogKeys.test.ts` and `frontend/src/localization/messagePolicy.ts` with the three new keys (both are hand-maintained exhaustive registries over every catalog key, enforced by existing tests; not in the plan Step's named scope but mechanically required to keep `messagePolicy.test.ts` and `catalogKeys.test.ts` green after the catalog addition).

## Outcome

Three new `documents:reviewStation.policy.*ReviewerApproval` keys are live with `role: "label"` policy entries; `manualHumanApproval` reads "Manual, human approval required", distinct from the new `manualReviewerApproval`'s "Manual, reviewer approval".

## Notes
