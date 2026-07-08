---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# `distribution-channels` `P01` summary

- Modified: `engine/crates/vaultspec-api/src/routes/spa.rs`, `justfile`, `.github/workflows/release-build-setup.yml`, `.github/workflows/release.yml`, `.gitignore`

## Description

All four steps closed. The rust-embed target moved inside the api crate (`assets/spa`, staged by the package recipe and the CI build step, gitignored) - the crate no longer reaches outside its boundary and is packageable, with the missing-staging compile error preserved. 601 feature-on / 598 feature-off tests green.
