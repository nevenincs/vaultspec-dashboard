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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S57 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Declare the target-specific external updater executable as a separate workspace package and ## Scope

- `engine/crates/vaultspec-updater/Cargo.toml` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
