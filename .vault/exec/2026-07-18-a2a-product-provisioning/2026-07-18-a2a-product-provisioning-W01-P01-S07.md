---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S07'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Derive product-owned install, generation, app-home, transaction, staging, snapshot, and updater paths without accepting client paths

## Scope

- `engine/crates/vaultspec-product/src/paths.rs`

## Description

- Add `ProductPaths` in `paths.rs`, rooted at the `a2a` subtree of the machine
  app home; `derive` resolves the app home from `VAULTSPEC_APP_HOME` or
  `USERPROFILE`/`HOME`, and `under_app_home` takes an already-resolved app home
  as a product-state seam.
- Expose derivations for the generations base, per-generation tree, mutable app
  home, credentials dir, receipt path, snapshots base and per-generation
  snapshot, transaction, staging, updater, and install-lock paths, plus an
  idempotent `ensure` that creates the base tree.
- Enforce that no client path is accepted: the constructors take no wire operand,
  and the one caller-influenced token — a generation identifier — is validated to
  `[A-Za-z0-9._-]` with no separators and no `..`, refusing traversal.

## Outcome

Every product location derives from product state, and generation identifiers
cannot escape the product root; a battery of traversal attempts (`../escape`,
`a/b`, `..`) are refused with `PathError::InvalidGeneration`.

## Notes

The edition-2024 workspace forbids `unsafe`, so the path tests use the
`under_app_home` seam with a tempdir rather than mutating the process
environment (which is now `unsafe`).
