---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
body_hash: 'sha256:19adbbb85198ce2d10f39d052920c7a07a2d5f0eb2386e6a8812a004dd7f24b8'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# `distribution-channels` `P05` summary

- Verified: `bucket/vaultspec.json`, `engine/crates/vaultspec-api`, the published v0.1.0 artifacts

## Description

All three steps closed with REAL channel verification on this machine: the staged-assets packaged binary served standalone; scoop installed/ran/uninstalled v0.1.0 from this repo's bucket (hash check passed against the seeded manifest); cargo-binstall resolved and fetched the published artifact via `--manifest-path engine` (the `--git` form refuted and the ADR amended honestly).
