---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S56'
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
     The S56 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove crash recovery from every durable transaction phase by reopening real transaction directories and receipts and ## Scope

- `engine/crates/vaultspec-product/tests/interruption_recovery.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove crash recovery from every durable transaction phase by reopening real transaction directories and receipts

## Scope

- `engine/crates/vaultspec-product/tests/interruption_recovery.rs`

## Description

- Add the interruption-recovery integration proof: drive a real transaction to a durable phase, "crash" it (drop the transaction and its installation guard, as on process death, freeing the OS lock), acquire a FRESH guard as a restarted process would, and run recovery — which reopens the real transaction directory and receipt journal.
- Prove crash recovery from every phase reachable through the public transaction API: Staged and Draining abort (nothing durable mutated), Snapshotted and Migrating roll back the real SQLite store to its captured state, and a no-descriptor product is a no-op.
- Prove recovery is idempotent (a second recovery after a roll-back finds nothing to do).

## Outcome

Delivered `tests/interruption_recovery.rs` (5 tests) over real SQLite + real transaction directories/receipts. Full product gate green: build, `cargo test -p vaultspec-product` (all lib + integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Integration tests see only the public crate API, which cannot forge a descriptor at the downstream `Activated`/`Accepted` phases or publish a committed receipt (those require the sealed activation). The recovery decision for EVERY durable phase, including committed roll-forward at `Activated`/`Accepted`, is proven exhaustively in the S53 unit tests (which use the crate-internal descriptor writer and a real fixed-receipt commit via the manifest fixture); this integration step reopens real directories/receipts for every publicly-reachable phase. End-to-end integration of the committed roll-forward completes when the sealed activation lands (W03.P07/W04). No fakes, no skips.
