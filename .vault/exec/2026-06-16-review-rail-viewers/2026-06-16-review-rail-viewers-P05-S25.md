---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S25'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Host the two viewers behind the open-in-viewer view-store intent so a selection routes to the markdown reader or the code viewer by node kind

## Scope

- `frontend/src/app/viewer/ViewerSurface.tsx`

## Description

- Build the ViewerSurface host reading the open-in-viewer viewerTarget from the view store, driving the single content query keyed on the target id + the active scope, and routing the resulting content view to the markdown reader or the code viewer by the target's surface.
- Add a close affordance (Lucide X) clearing the target; the host fetches nothing itself and reads no raw tiers block.

## Outcome

A selection routes to the correct viewer by node kind through the open-in-viewer intent; the host is dumb chrome over the stores content query.

## Notes

None.
