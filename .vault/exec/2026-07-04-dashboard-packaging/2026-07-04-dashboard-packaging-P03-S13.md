---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S13'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# pin the CI toolchain to the repo rust-toolchain.toml instead of stable in the engine workflow

## Scope

- `.github/workflows/engine-ci.yml`

## Description

- Add a "Read pinned toolchain" step extracting the channel from `rust-toolchain.toml` (the job's working directory is `engine`), and switch `dtolnay/rust-toolchain@stable` to `@master` with that channel as the explicit `toolchain` input

## Outcome

CI now builds with exactly the repo-pinned 1.96.0. The root cause was real: the action exports `RUSTUP_TOOLCHAIN`, which OVERRIDES rust-toolchain.toml file detection, so CI silently floated on stable despite the pin. The file stays the single source of truth; the workflow reads it rather than duplicating the version.

## Notes

- None.
