---
tags:
  - '#exec'
  - '#approval-shape-reconciliation'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:91618580d1136992498d0f8f4243c1d29c43bd9202c923b03cc1d3fcf120c487'
step_id: 'S24'
related:
  - "[[2026-08-01-approval-shape-reconciliation-plan]]"
---

# Remove the session_override and session_override_ignored fixture lines from the authoring store test

## Scope

- `frontend/src/stores/server/authoring.test.ts`

## Description

- Remove the three `session_override`/`session_override_ignored` fixture lines from `authoring.test.ts` (the shared `needsReviewProjectionWire()` fixture, the `adaptProposalProjection` expectation it feeds, and the applied-under-policy lane's nested policy fixture in `adaptProposalList`).

## Outcome

`npx vitest run src/stores/server/authoring.test.ts src/app/authoring/ReviewStation.render.test.tsx` passes 63/63. A mechanically-required follow-on beyond the plan's named scope: `frontend/dev/visual-review/specimens/authoring.tsx` (the visual-review desk's authored `proposalRow` fixture, sanctioned under the dev/production fence exception) also constructs a `PolicyDecisionProjection` literal and failed `tsc` once the field left the type; its one `session_override_ignored` line is removed too, keeping the desk fixture on the same served shape as the real wire.

## Notes
