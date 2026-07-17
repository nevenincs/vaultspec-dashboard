---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S14'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Run the full frontend lint gate and the touched vitest suites

## Scope

- `verify Figma name-as-contract bindings`
- `frontend`

## Description

## Outcome

## Notes

## Description

- Re-run the realignment-touched suites (112 tests green) and every frontend gate step: eslint, px-scan, prettier, tsc, token-drift, figma:names - all clean.

## Outcome

Frontend slice fully green. The repo-wide module-size scan fails on a FOREIGN lane (the parallel engine authoring decomposition mid-flight: apply/mod.rs over the cap + a stale baseline entry) - not this feature; left untouched per shared-tree discipline.

## Notes

figma:names validates the 4 canonical citations; the new panel/cluster components join by name-as-contract without headers.
