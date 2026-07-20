---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S55'
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
     The S55 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove candidate failure restores files, all schema-bearing state, checkpoints, complete receipt generation, and prior seat while successful activation cannot leave a split release set and ## Scope

- `engine/crates/vaultspec-product/tests/update_transaction.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove candidate failure restores files, all schema-bearing state, checkpoints, complete receipt generation, and prior seat while successful activation cannot leave a split release set

## Scope

- `engine/crates/vaultspec-product/tests/update_transaction.rs`

## Description

- Add the update-transaction integration proof using the production transaction API, REAL SQLite databases, and a real spawned owned-runtime child (resolved through the public capsule-relative program authority) — no fakes.
- Drive a real transaction begin → drain-and-stop → snapshot, then corrupt every mutable store (delete rows, drop a table), the fixed receipt-journal generation, and hit a REAL migration spawn failure.
- Prove the candidate failure restores the whole consistency group together — both real SQLite databases (files + all schema-bearing state + checkpoints), the fixed receipt-journal generation, and the retained prior seat — and clears the durable descriptor, so no split release set is left behind.

## Outcome

Delivered `tests/update_transaction.rs` (1 comprehensive proof) over real SQLite + a real child. Full product gate green: build, `cargo test -p vaultspec-product` (all lib + integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

The "successful activation cannot leave a split release set" half is the fixed active-receipt journal's atomic single-selection property, which is proven in the receipt (S172) tests and, at the integration level, becomes end-to-end provable once the sealed activation (materializer + public publish) lands (W03.P07/W04). This step proves the candidate-FAILURE rollback fully against real state. No fakes, no skips.
