---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

# Run the full frontend lint gate and vitest suite and drive to green

## Scope

- `frontend/`

## Description

- Run the full frontend lint gate (`just dev lint frontend`: eslint, px guard, prettier, tsc, tokens, figma:names) and confirm exit 0.
- Run the full vitest suite twice: first surfaced one guard failure, the second confirmed a clean pass after the fix.

## Outcome

Full lint gate exit 0. Full vitest suite green: 314 files, 2854 tests passing. The change is regression-free.

## Notes

The first full suite run failed exactly one guard — `filterConsolidation.guard.test.ts` — because the S03 draft mounted `FilterSidebar` in `app/shell/`; the guard binds every filter mount to `app/left/`. Fixed by rehoming the mount into `CompactFilterSheet` (`app/left/`), rendered from the rail's top level. The re-run passed all 2854 tests. (The suite's console shows expected negative-path 400s and one ECONNRESET from live-wire error-path tests; all 314 files passed.)
