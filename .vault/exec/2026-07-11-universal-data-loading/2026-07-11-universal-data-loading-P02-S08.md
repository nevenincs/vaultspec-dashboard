---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S08'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Test the chrome plane: indicator render modes and a11y label, both shell mounts, canvas refetch banner precedence against the existing designed-state table

## Scope

- `frontend/src/app/stage/canvasStateOverlay.test.tsx + sibling chrome tests`

## Description

Extend `CanvasStateOverlay.render.test.tsx`: refresh banner surfaces on refreshing-with-held-slice, is outranked by degraded and by truncation, and renders as a non-blanking corner banner; updated the availability fixture for the new field.

## Outcome

29 tests green including the pre-existing designed-state table unchanged.

## Notes
