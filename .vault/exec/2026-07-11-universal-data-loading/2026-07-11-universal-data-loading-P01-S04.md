---
tags:
  - '#exec'
  - '#universal-data-loading'
date: '2026-07-11'
modified: '2026-07-11'
step_id: 'S04'
related:
  - "[[2026-07-11-universal-data-loading-plan]]"
---

# Unit-test the activity core: drain slice bounds and pruning, SSE key exclusion, grace/hold debounce determinism, and determinate rollup from concurrent drains

## Scope

- `frontend/src/stores/server/dataActivity.test.ts`

## Description

Author `frontend/src/stores/server/dataActivity.test.ts`: drain slice tracking/pruning/bounds/rollup, stream-key exclusion, kind precedence, grace/hold debounce determinism under fake timers, and view integration (drain to visible to settle to hidden; stream query excluded; real fetch counted).

## Outcome

12 tests green; unhandled cancellation rejections from teardown swallowed via a `fetchForever` helper.

## Notes
