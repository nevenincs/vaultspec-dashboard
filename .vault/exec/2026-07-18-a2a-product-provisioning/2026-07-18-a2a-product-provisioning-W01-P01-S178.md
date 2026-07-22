---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-22'
modified: '2026-07-22'
step_id: 'S178'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Guard the duplicated VAULTSPEC_APP_HOME resolver with one agreement test asserting ProductPaths derive equals ProductPaths under_app_home of app_home_dir, using the process environment with no env mutation, plus a one-line comment at each site naming the other and recording that a new leaf crate is revisited only if the resolver acquires branching precedence or a third implementation appears

## Scope

- `engine/crates/vaultspec-session/src/app_home.rs`
- `engine/crates/vaultspec-product/src/paths.rs`
- `engine/crates/vaultspec-cli`

## Description

- Confirm the `VAULTSPEC_APP_HOME` resolver is implemented twice with identical precedence: `vaultspec_session::app_home_dir` and `vaultspec_product::paths::ProductPaths::derive`.
- Refuse extracting a shared leaf crate: a small function that is easy to reimplement is also easy to misapply, and `fs_browse`'s `home_dir()` deliberately resolves the OPERATOR's home rather than the app home, so a shared crate would become a magnet for the wrong reuse (the picker silently routing through it and opening at `~/.vaultspec`).
- Author one TOTAL agreement test, `the_two_app_home_resolvers_agree`, in `vaultspec-cli` (which already depends on both crates, so the test costs no crate-graph change). It runs both resolvers against the ambient process environment (no `set_var`, which is `unsafe` under edition 2024 and process-global under a parallel test runner) and asserts they agree on a resolved home, AND that both refuse together with `NoAppHome` when none exists — so the test cannot pass vacuously.
- Add a one-line comment at each resolver site naming the other and pointing at the agreement test.
- Record the revisit trigger at both sites: extracting a shared crate is reconsidered only if the resolution grows branching precedence beyond flat fallback (XDG handling, legacy-home migration, per-platform divergence), or a third implementation appears.

## Outcome

Delivered by commit `4c8564475f`. `cargo test -p vaultspec-cli --test app_home_agreement` passes 1/1. `just dev lint rust` (fmt, clippy `-D warnings`, module-size) exits 0.

## Notes

The `VAULTSPEC_APP_HOME` override branch is covered only when the ambient environment happens to set it; covering it unconditionally would need a serialized env guard, judged not worth the added contention for this guard's purpose.
