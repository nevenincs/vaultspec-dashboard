---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S53'
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
     The S53 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Resolve interruption at every declared transaction boundary and recover staged, draining, snapshotted, activated, migrating, accepted, and rolling-back states deterministically from durable markers and complete receipts and ## Scope

- `engine/crates/vaultspec-product/src/recovery.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Resolve interruption at every declared transaction boundary and recover staged, draining, snapshotted, activated, migrating, accepted, and rolling-back states deterministically from durable markers and complete receipts

## Scope

- `engine/crates/vaultspec-product/src/recovery.rs`

## Description

- Add the `recovery` module: deterministic interruption recovery resolving an interrupted update transaction from two durable authorities — the transaction descriptor phase (S52) and the fixed active-receipt journal (the commit authority).
- Add a pure, total `plan_recovery(phase, candidate_committed)` planner: a committed candidate (the receipt selects it) always rolls forward; otherwise the pre-snapshot phases (Staged/Draining) abort and the rest (Snapshotted/Migrating/Activated/Accepted/RollingBack) roll back.
- Add `recover(paths, guard)`: reproves the guard, reads the descriptor (absent → NoTransaction), joins it to the receipt journal via the read-only active-release observation to decide commit, and executes the action — roll forward (clear descriptor), roll back (restore the consistency snapshot then clear), or abort (clear). Idempotent, so a crash during recovery is resolved by re-running it. A recovery-required or unverifiable receipt journal cannot confirm a commit and conservatively rolls back.
- Expose `clear_descriptor` (pub(crate)) and add a test-support `persist_descriptor_for_test` in the transaction module so recovery can be proven at every declared boundary, including the downstream Activated/Accepted phases.
- Register `pub mod recovery` and add tests: exhaustive planner coverage across every phase × commit state, no-descriptor no-op, staged-abort, snapshotted/migrating roll-back restoring the group with idempotent re-run, and a committed-candidate roll-forward proven against a REAL settled receipt built through the manifest fixture and the S172 publisher.

## Outcome

Delivered `src/recovery.rs` (+ tests) and the two transaction-module accessors. Full product gate green: build, `cargo test -p vaultspec-product` (141 lib + all integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

The roll-forward proof uses a real fixed-receipt commit (manifest fixture + `publish_active_receipt`), not a stub; the roll-back proof restores a real captured snapshot. The exhaustive per-durable-phase reopen against real transaction directories and receipts is completed by S56. No scaffolds or skipped work.
