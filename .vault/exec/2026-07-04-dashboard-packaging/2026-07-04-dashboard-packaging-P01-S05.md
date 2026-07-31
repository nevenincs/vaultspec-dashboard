---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
body_hash: 'sha256:81b68d4547f1057a6f20d6639e760a5017566707fba85dd9e15632a22195dcff'
step_id: 'S05'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# add a packaged-build recipe running the frontend build then the release cargo build with the embed-spa feature

## Scope

- `justfile`

## Description

- Add `_dev-build-package` to the existing `_dev-build-*` dispatcher family: frontend production build first, then the release cargo build of the bin crate with the embed-spa feature
- Register the `package` target in the `_dev-build-help` listing

## Outcome

`just dev build package` resolves through the dispatcher and `just -n _dev-build-package` shows the exact two-command pipeline. The identical command pair was executed end to end during S03 verification, producing the 25 MB embedded release binary that served standalone from a clean directory.

## Notes

- None.
