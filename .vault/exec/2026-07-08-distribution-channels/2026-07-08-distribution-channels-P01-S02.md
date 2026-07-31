---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
body_hash: 'sha256:925ceb37edf85d525345f9b282a67d746d6b65ccd06ce42a84307b3e9ed2a3ce'
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
