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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace a2a-product-provisioning with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Derive product-owned install, generation, app-home, transaction, staging, snapshot, and updater paths without accepting client paths and ## Scope

- `engine/crates/vaultspec-product/src/paths.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
