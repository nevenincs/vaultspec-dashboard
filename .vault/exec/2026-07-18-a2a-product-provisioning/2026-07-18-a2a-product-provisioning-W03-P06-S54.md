---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S54'
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
     The S54 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Prove consistency snapshots restore real SQLite primary and checkpoint stores together and reject incomplete or unverified groups and ## Scope

- `engine/crates/vaultspec-product/tests/snapshot_group.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove consistency snapshots restore real SQLite primary and checkpoint stores together and reject incomplete or unverified groups

## Scope

- `engine/crates/vaultspec-product/tests/snapshot_group.rs`

## Description

- Add the consistency-snapshot integration proof using REAL SQLite primary and checkpoint databases and the production snapshot API (no fakes).
- Add `rusqlite` (bundled) as a dev-dependency — the version already used across the workspace; dev-only, so the shipped crate is unaffected.
- Prove a captured group restores both real databases together: seed real tables/rows, capture, mutate both databases (delete rows, drop a table), restore, reopen both with SQLite and assert the original rows.
- Prove an incomplete group (committed manifest removed) and a drifted member (captured bytes tampered) are both rejected on reopen.

## Outcome

Delivered `tests/snapshot_group.rs` (3 tests) + the dev-dependency. Full product gate green: build, `cargo test -p vaultspec-product` (all lib + integration), `clippy --all-targets -D warnings`, `fmt --check` all exit 0.

## Notes

Uses default SQLite journal mode with the connection closed before capture, so the byte-level snapshot of the quiesced store is a real consistent snapshot; the SQLite `-wal`/`-shm` sidecar capture/restore path is proven in the snapshot unit tests. No fakes, no skips.
