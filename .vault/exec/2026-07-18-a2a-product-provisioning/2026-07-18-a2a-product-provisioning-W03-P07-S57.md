---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S57'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Declare the target-specific external updater executable as a separate workspace package

## Scope

- `engine/crates/vaultspec-updater/Cargo.toml`

## Description

- Declare the `vaultspec-updater` crate as a separate workspace package (auto-registered by the `crates/*` glob) — the target-specific external updater executable, depending on `vaultspec-product`.
- Add a compiling skeleton so the package builds as a workspace member: `lib.rs` establishes the crate contract (module doc) and the real public `UpdaterError` type (wrapping the product transaction/recovery errors, redacted-of-secrets `Io` variant); `main.rs` is the executable entrypoint stub that refuses (exit 2) rather than exiting success having done nothing.

## Outcome

Delivered `engine/crates/vaultspec-updater/{Cargo.toml, src/lib.rs, src/main.rs}`. Builds, `clippy --all-targets -D warnings`, and `fmt --check` all exit 0. The workspace forbids unsafe; the updater is unsafe-free.

## Notes

The testable runner (S58) and the executable flow (S59) flesh out `lib.rs`/`main.rs`. SCOPE DECISION flagged to the lead: I did NOT add the `vaultspec-distribution-authority` + tokio/tough dependencies yet. Under option (A) the updater's activation-independent orchestration (descriptor parse, installation lock, ordered transaction, drain/stop/snapshot/migrate/rollback/recover, relaunch) does not touch distribution verification — that is part of the materialize+activate sealed seam (W04). Adding those deps now would be unused weight; they join the crate when the verify+materialize seam is wired. `serde`/`serde_json` similarly join with the descriptor in S58. No unused dependencies, no faked swap.
