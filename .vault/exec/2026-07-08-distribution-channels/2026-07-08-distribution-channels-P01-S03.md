---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S03'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# stage the assets in the CI build step and regenerate the release workflow through dist

## Scope

- `.github/workflows/release-build-setup.yml`

## Description

- Add the same staging (bash, strict mode) to the injected CI build step after the frontend build, and regenerate `release.yml` through dist so the staleness gate stays clean

## Outcome

`dist generate` refreshed the workflow; `dist plan` passes downstream.

## Notes

- None.
