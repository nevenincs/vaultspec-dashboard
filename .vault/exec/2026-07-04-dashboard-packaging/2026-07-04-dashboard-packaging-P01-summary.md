---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# `dashboard-packaging` `P01` summary

All five steps closed. The release binary now carries the SPA: an `embed-spa` cargo feature (rust-embed 8.11.0, `debug-embed` so tests embed too) compiles `frontend/dist` into `vaultspec`, served through a source-blind `SpaSource` with the resolution chain embedded, then `VAULTSPEC_SPA_DIR`, then workspace `frontend/dist`, then the placeholder. Dev builds omit the feature and are provably byte-identical (374-test baseline unchanged). Four feature-gated tests cover embedded index delivery with the token bootstrap, asset MIME, deep-link fallback, and the API JSON-404 boundary; `just dev build package` builds the artifact in one recipe.

- Modified: `engine/crates/vaultspec-api/Cargo.toml`, `engine/crates/vaultspec-cli/Cargo.toml`, `engine/crates/vaultspec-api/src/routes/spa.rs`, `engine/crates/vaultspec-api/src/lib.rs`, `engine/Cargo.lock`, `justfile`

## Description

Commits: S01 `4ffad58dd4`, S02 `818d2c285a`, S03 `b6a4225247`, S04 `95c81ee94a`, S05 `030c7a840c`. Execution began under a dispatched executor that was cut off mid-S03 by a session limit; the orchestrator resumed the work in place, reviewing the uncommitted diff line by line before landing it.

Review verdict: PASS (pass-with-nits), no CRITICAL or HIGH. The one MEDIUM (the disk arm's traversal guard missed Windows drive-absolute and drive-relative escapes - pre-existing, embedded release path immune) was fixed immediately in `e8c7cbd2e5` with a pure, unit-tested guard rejecting every escape shape. Remaining LOW follow-up: the embedded read clones each asset per request; a zero-copy serve is a candidate cleanup, not a correctness issue.
