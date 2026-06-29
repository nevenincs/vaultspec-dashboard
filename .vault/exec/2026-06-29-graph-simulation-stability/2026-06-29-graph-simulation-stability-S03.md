---
tags:
  - '#exec'
  - '#graph-simulation-stability'
date: '2026-06-29'
modified: '2026-06-29'
step_id: 'S03'
related:
  - "[[2026-06-29-graph-simulation-stability-plan]]"
---

# Run the full frontend gate (just dev lint frontend) and the test suite to exit 0

## Scope

- `frontend/`

## Description

- Ran `just dev lint frontend`: a first pass flagged the new test file under prettier;
  formatted it and re-ran.
- Re-ran the full gate to exit 0: eslint, `lint:px` (clean, allowlist empty), prettier
  `format:check` (all files conform), `tsc -b` typecheck, `tokens:check`, and `figma:names`.
- Ran the scene-layer test suite (`vitest run src/scene`): 21 files, 223 tests pass.

## Outcome

Full frontend gate green (exit 0) and the entire scene-layer suite passes. The change is
isolated to the scene layer, so no wire/engine test is affected.

## Notes

Followed the declaring-green discipline: ran the FULL `just dev lint frontend` recipe
(eslint + prettier + tsc + token/figma gates), not just eslint.
