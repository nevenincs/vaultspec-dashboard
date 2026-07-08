---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S14'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# pin the CI toolchain to the repo rust-toolchain.toml instead of stable in the quality-gates workflow

## Scope

- `.github/workflows/quality-gates.yml`

## Description

- Apply the same read-the-pin pattern as the engine workflow at both rust setup sites (the frontend live-suite job that builds the engine test backend, and the engine-conformance job), reading `engine/rust-toolchain.toml` from the repo root

## Outcome

Both jobs now install exactly the pinned 1.96.0 instead of floating stable, closing the reproducibility gap the packaging research flagged (F5).

## Notes

- None.
