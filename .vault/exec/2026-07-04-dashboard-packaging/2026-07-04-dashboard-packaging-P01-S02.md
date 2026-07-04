---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S02'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# forward the embed-spa feature from the bin crate so release builds enable it with one flag

## Scope

- `engine/crates/vaultspec-cli/Cargo.toml`

## Description

- Declared an `embed-spa` feature on the `vaultspec-cli` bin crate that forwards to `vaultspec-api/embed-spa`, so enabling the flag once at the binary compiles the SPA into the release build without callers needing to know the api crate carries the actual dependency.

## Outcome

`cargo check -p vaultspec-cli --features embed-spa` resolves and compiles the whole chain: the bin feature turns on the api feature, which pulls `rust-embed` and its transitive tree. With the feature off, the bin builds unchanged. No SPA folder is required at this step because the embedded asset store and its derive land in the next step; enabling the feature here only compiles the dependency crate.

## Notes

None.
