---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S49'
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
     The S49 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Snapshot primary, checkpoint, every manifest-declared schema-bearing store, the complete receipt generation, and prior seat descriptor as one verified consistency group and ## Scope

- `engine/crates/vaultspec-product/src/snapshot.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Snapshot primary, checkpoint, every manifest-declared schema-bearing store, the complete receipt generation, and prior seat descriptor as one verified consistency group

## Scope

- `engine/crates/vaultspec-product/src/snapshot.rs`

## Description

- Add the `snapshot` module: a verified consistency-group snapshot keyed by the receipt `consistency_generation`.
- Model each mutable schema-bearing store as a validated `SchemaBearingStore` (bounded id, non-escaping app-home-relative segments, declared schema authority/version); the store set is caller-supplied from the verified capsule consistency group, never a hardcoded gateway file name.
- Capture, as one all-or-nothing group under the held installation guard: every store primary file plus any present SQLite `-wal`/`-shm` sidecars, the fixed active-receipt journal (the receipt generation), and the prior-seat descriptor.
- Write each member no-follow and byte-bounded into a fresh per-generation snapshot tree, then commit a `snapshot.json` manifest LAST via atomic rename so its presence witnesses a complete capture; refuse a pre-existing generation directory.
- Reopen-and-verify reproves every recorded member's size and lowercase SHA-256 digest and fails closed on an absent manifest (incomplete), a malformed manifest, or any drift.
- Restore verifies the whole group first, then writes each primary and captured sidecar back atomically, removes any live sidecar absent from the snapshot (so a post-snapshot WAL cannot corrupt the restored database), removes an absent store's live files, and restores the receipt journal last; restore is idempotent so an interrupted restore resumes cleanly.
- Register `pub mod snapshot` and add focused unit tests over real files: grammar rejection, group validation, full capture/restore roundtrip with sidecars + receipt journal + prior seat, stale-sidecar removal, absent-store removal, reject-incomplete, reject-drift, existing-generation refusal, and foreign-guard refusal.

## Outcome

Delivered `src/snapshot.rs` (+ `snapshot/tests.rs`). Snapshots take a byte-level capture of quiesced stores (the S52 order drains and stops the runtime first), so no live-database backup API or SQLite dependency is introduced — the module owns the grouping/verify/restore invariants only. Full product gate green: build, `cargo test -p vaultspec-product` (104 lib + all integration tests pass, 10 new snapshot tests), `clippy --all-targets -D warnings`, and `fmt --check` all exit 0.

## Notes

The archive→generation materializer and the same-process helper chain remain out of scope for this step (they sit behind the still-proposed archive-materialization ADR). No scaffolds or skipped work in this module. The real-SQLite integration proof lands separately in `tests/snapshot_group.rs` (S54); this step's unit tests exercise the capture/restore machinery over opaque byte members, which is the module's true contract.
