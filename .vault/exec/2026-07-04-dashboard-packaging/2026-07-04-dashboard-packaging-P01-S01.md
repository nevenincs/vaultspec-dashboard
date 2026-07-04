---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S01'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# add the embed-spa cargo feature and the rust-embed dependency to the api crate

## Scope

- `engine/crates/vaultspec-api/Cargo.toml`

## Description

- Added `rust-embed` 8.11.0 as an optional dependency of the api crate, following the crate's existing inline third-party dependency convention (internal path crates only live in the workspace dependency table).
- Enabled the `debug-embed` feature on `rust-embed` so the embedded asset store is compiled in even for debug builds, letting the feature-gated tests exercise the real embedded store deterministically rather than falling back to a runtime disk read.
- Declared a new `embed-spa` crate feature wired to `dep:rust-embed`, so the dependency is pulled only when the feature is enabled and dev builds stay byte-identical.
- Verified the license tree with the supply-chain gate and refreshed the workspace lockfile.

## Outcome

The api crate now carries an `embed-spa` feature that gates the `rust-embed` dependency. `cargo deny check licenses` reports `licenses ok`: `rust-embed` (MIT) and its transitive dependencies (`rust-embed-impl`, `rust-embed-utils`, `walkdir`, `sha2`) all resolve to licenses already in the allow-list, so no allow-list change was required. `cargo check -p vaultspec-api` succeeds with the feature off, and `engine/Cargo.lock` now records `rust-embed`. No Rust source changed in this step, so `cargo fmt` is a no-op for it and the feature-gated resolution code lands in the next step.

## Notes

The shared working tree carries untracked authoring-module WIP (`src/authoring/apply.rs`, `src/authoring/projections.rs`) from another agent that fails `cargo fmt --check` and `cargo clippy -D warnings` independently of this change. Those files are outside this step's scope and were left untouched; the failures pre-date this work and originate entirely in that untracked WIP, not in the manifest change or `spa.rs`.
