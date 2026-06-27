---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S11'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Add a view-store open-in-viewer intent carrying the target node id and the active viewer surface

## Scope

- `frontend/src/stores/view/viewStore.ts`

## Description

- Add the `ViewerSurface` and `ViewerTarget` types and a `viewerTarget` view-store slice carrying the target node id plus the active viewer surface (markdown/code).
- Add `openInViewer(nodeId, surface)` and `closeViewer()` actions, distinct from `select`/`openNode`, so a cross-link can both select and open.
- Reset `viewerTarget` to null on both the scope swap and the workspace swap so a stale viewer does not survive a corpus change.

## Outcome

The open-in-viewer intent is owned in the view store; the viewer host reads it and the content query keyed on the id renders the document/file.

## Notes

None.
