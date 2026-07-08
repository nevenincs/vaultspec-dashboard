---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S02'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# stage frontend/dist into the crate assets before the feature-on cargo build in the packaged-build recipe

## Scope

- `justfile`

## Description

- Add the staging copy (clean rmtree then copytree of `frontend/dist` into the crate `assets/spa`, via the uv-provided python) between the frontend build and the feature-on cargo build in the packaged-build recipe

## Outcome

`just -n _dev-build-package` shows the three-command pipeline; the identical staging was executed for the local verification.

## Notes

- None.
