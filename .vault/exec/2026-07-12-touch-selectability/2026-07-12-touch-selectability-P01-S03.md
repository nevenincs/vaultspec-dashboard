---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Scope the island context-menu handler with a target predicate like the rail and timeline predicates so nested data targets stop being blanketed

## Scope

- `frontend/src/app/islands/IslandLayer.tsx`

## Description

- Add `isIslandMenuTarget` with the island non-menu selector (button, anchor, form controls) mirroring the rail and timeline predicates
- Route the island `onContextMenu` through `guardedContextMenu` and the new predicate so nested targets stop being blanketed

## Outcome

Island menu now opens only on genuine island targets and yields to live selections; islands suite green (89/89 across menus plus islands).

## Notes
