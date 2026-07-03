---
tags:
  - '#exec'
  - '#worktree-switcher-identity'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S05'
related:
  - "[[2026-07-03-worktree-switcher-identity-plan]]"
---

# Delete the LocationStrip and the location-anchor selector family with no bridge

## Scope

- `frontend/src/app/right/StatusTab.tsx`

## Description

- Delete the LocationStrip component and its mount from the Status tab; drop the now-unused imports; update the rail-state and header comments to name the left rail as the one location surface.

## Outcome

The right rail states no location of its own; the literal-"main" defect is gone with the surface. Right-rail suites pass live.

## Notes

The compact viewport's bordered location card is retired with the strip; the left-rail trigger carries identity there too (accepted in the ADR).
