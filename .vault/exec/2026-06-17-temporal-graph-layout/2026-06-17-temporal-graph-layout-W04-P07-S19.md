---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-18'
step_id: 'S19'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# add integration tests for temporal representation mode and scene controller behavior

## Scope

- `frontend scene representation tests`

## Description

- Add scene-controller coverage for temporal representation mode.
- Verify temporal mode does not mutate topology or layout-mode state at the controller seam.
- Extend temporal adapter tests for bucket lookup, debug metadata, and edge capping.

## Outcome

Focused integration coverage now proves temporal mode is a real scene representation and that the temporal adapter emits bounded, debuggable scene data.

## Notes

`npm run typecheck` is currently blocked by unrelated scope-prop errors in non-temporal files. Focused temporal tests pass.
