---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S37'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Fade rows in/out on add/remove with stable ids for object constancy and render keyboard-initiated and reduced-motion paths instantly, reusing the existing animated-transitions grammar without introducing a new motion grammar

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rows key on stable node id for object constancy across re-render and live re-rank; the surface reuses the existing token-driven transition grammar and introduces no new motion grammar, with reduced-motion respected by the shared floor.

## Outcome

Add/remove preserves object constancy; no new motion grammar is introduced.

## Notes

None.
