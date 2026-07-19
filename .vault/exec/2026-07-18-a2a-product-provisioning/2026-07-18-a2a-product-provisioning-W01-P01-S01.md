---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S01'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Register the reusable dashboard product-contract crate for API, CLI, updater, and release-tool consumers

## Scope

- `engine/Cargo.toml`

## Description

- Register `vaultspec-product` as a path-only workspace dependency.
- Add a dependency-free crate manifest that inherits workspace package metadata and lints.
- Add a documented library root without exporting product modules.
- Refresh the workspace lockfile through Cargo resolution.

## Outcome

- `engine/Cargo.toml` now provides one reusable `vaultspec-product` dependency target for later consumers.
- `engine/crates/vaultspec-product/Cargo.toml` and `engine/crates/vaultspec-product/src/lib.rs` form the minimum compilable library scaffold required by the wildcard workspace membership.
- `engine/Cargo.lock` records `vaultspec-product` version `0.1.4` with no dependencies.
- Cargo metadata, focused check, focused test, focused warning-denied Clippy, workspace format check, and `just dev lint all` completed successfully.

## Notes

- Product dependencies remain deferred to `S02`.
- Public product-contract module exports remain deferred to `S05`.
- The library intentionally has no tests or runtime behavior at this registration-only step.
- The plan row remains open and the reviewed change set remains uncommitted for independent supervisor review.
