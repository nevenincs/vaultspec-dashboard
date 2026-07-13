---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# add a hover-id view slice and handle the hover scene event in the stage

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

- Add a `hoveredId: string | null` slice to the view store with a `setHoveredId` setter, mirroring the existing selection/opened slices. The setter short-circuits an identical write so a stream of identical hover events does not churn subscribers.
- Document the slice as a DISTINCT concept from `selection` (focus/pin) and `openedIds` (the opened interior), so the three intents stay cleanly separate.
- Reset `hoveredId` to null in both the `setScope` wholesale swap and the `swapWorkspace` swap, alongside the other per-scope state, so a stale hovered id cannot anchor a card against a new slice.
- Handle the `hover` scene event in the stage's seam event handler: on `hover`, write the carried id (or null) to `setHoveredId`, leaving the existing `select`/`open`/`expand` handling and the scene-side ego-lift untouched. Add `setHoveredId` to the effect's dependency array.

## Outcome

The stage now feeds the hover scene event into a dedicated view-store slice. `hover` previously arrived and was ignored; it now drives `hoveredId` without touching selection or the opened set, so the hover-bloom rung is a separate intent from focus-pin and open. The slice resets with the rest of the per-scope state on a scope or workspace swap.

## Notes

The dwell delay and the opened-id suppression deliberately do NOT live in this slice — they are host concerns (P04.S15) so the store carries only the raw hover truth. The existing select/open/expand handlers and the scene ego-lift were not disturbed.
