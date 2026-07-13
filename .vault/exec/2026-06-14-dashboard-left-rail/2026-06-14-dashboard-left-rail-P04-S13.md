---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# Establish the rail-wide keyboard contract, labelled landmark, and reduced-motion and keyboard-instant behaviour

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Establish the rail-wide keyboard contract and labelled landmark: `LeftRail` is the `scope rail` navigation landmark; the mode toggle and filter are keyboard-reachable; reduced-motion is honored by the global token-layer floor (no non-token motion path introduced).

## Outcome

The rail is one labelled landmark with a keyboard-first contract; reduced-motion is inherited from the token layer.

## Notes

The reduced-motion floor already lives globally in `styles.css`; the new components use only token-bounded transitions, so they inherit it. The landmark assertion is committed in the render test.
