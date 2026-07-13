---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S35'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Verify the four-tab law holds and every Overview row cross-links to file, node, and viewer with no inlined content

## Scope

- `frontend/src/app/right/ChangesOverview.test.tsx`

## Description

- DEFERRED with Phase P06. This step verifies the right-rail Overview re-scope and its cross-link rows (four-tab law, Overview row cross-links, no inlined content) — the surface P06 builds.

## Outcome

Not executed. Phase P06 (right-rail overview re-scope + cross-link wiring) was superseded mid-execution: the right rail is being redefined as a simplified "Status overview" by a new ADR, to be implemented as a separate follow-up. This verification belongs to that superseded surface and is deferred to the follow-up that builds the revised rail.

## Notes

P06.S26-S32 and this P07.S35 verification are left unchecked pending the revised right-rail ADR. The delivered viewer surfaces (markdown reader, code viewer, content endpoint, shared highlighter, open-in-viewer intent) are complete and independently verified by P07.S33/S34 and the engine/stores tests; the open-in-viewer intent the rail's cross-links would have driven is built and tested.
