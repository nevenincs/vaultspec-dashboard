---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S51'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Route node selection and hover intent back through the preserved SceneController event channel

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

- Route node selection and hover intent through the PRESERVED SceneController event channel, using the EXISTING surface without widening it: the `select`/`hover` events OUT and the `set-selected` command IN are already on the locked union; the round-trip is the scene `select` event → view store → the store pushing the shared selection back through `set-selected`.
- Retain the inbound `set-selected` selection at the seam: add a private `_selectedIds` and move `set-selected` from the no-op forwarding group into a retaining case (mirroring `set-layout-mode`/`set-representation-mode`/`set-overlays`), holding a defensive copy and still forwarding the command to the field below (the ring is the renderer's concern).
- Expose a synchronous `getSelectionState()` returning a defensive copy of the held selection, mirroring `getLayoutState`/`getRepresentationState`, so a consumer can root a re-layout or a focus on the current selection without re-deriving it from a render frame.
- Cover the routing in `sceneController.test.ts`: the select-out / set-selected-in / read-at-the-seam loop (and the field still receives the forwarded command), the defensive-copy guard, and the hover event carrying id-or-null. No new command and no new event kind was added.

## Outcome

Selection and hover intent route cleanly through the preserved channel, and the controller now answers the current selection synchronously the same way it answers layout/representation state. The frozen command and event unions are UNCHANGED (purely additive bookkeeping over the existing `set-selected` command). Scoped controller tests green; the full scene suite (46 files, 642 tests) is green, confirming the `set-selected` field-forward path is intact.

## Notes

No SceneController command/event SURFACE was widened — the seam lock (RL-1 to RL-5) is honored: the change is internal state retention plus a synchronous getter, not a new union member. The field→store→field round-trip wiring (`PointerGestures` emit, the Stage `controller.on` router, the stores `bindSelectionToScene`) already existed and lives outside this step's `sceneController.ts` scope fence; this step completes the controller's half so the routed selection is readable at the seam. Scope touched `sceneController.ts` and its test only.
