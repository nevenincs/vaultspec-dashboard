---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S05'
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
     The S05 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Expose only stable product contract, lifecycle, update, and build-tool modules to dashboard consumers and ## Scope

- `engine/crates/vaultspec-product/src/lib.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Expose only stable product contract, lifecycle, update, and build-tool modules to dashboard consumers

## Scope

- `engine/crates/vaultspec-product/src/lib.rs`

## Description

- Rewrite the crate root `lib.rs` from a placeholder doc-comment into the stable
  module surface, declaring `pub mod credentials`, `locking`, `manifest`,
  `paths`, and `receipt`.
- Document the boundary: only stable product-contract, lifecycle, and
  build-tool modules are exposed; A2A-internal Python detail stays opaque behind
  the capsule manifest, and later steps extend the same surface.

## Outcome

The crate exposes exactly the five product-authority modules delivered in this
phase and nothing A2A-internal. `cargo build -p vaultspec-product` compiles the
assembled surface clean.

## Notes

None.
