---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S08'
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
     The S08 and 2026-07-18-a2a-product-provisioning-plan placeholders are machine-filled by
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
     The Persist atomic complete receipts, channel provenance, bootstrap-created ownership retention, active generation, prior seat identity, consistency generation, and interruption markers and ## Scope

- `engine/crates/vaultspec-product/src/receipt.rs` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Persist atomic complete receipts, channel provenance, bootstrap-created ownership retention, active generation, prior seat identity, consistency generation, and interruption markers

## Scope

- `engine/crates/vaultspec-product/src/receipt.rs`

## Description

- Add the `Receipt` struct in `receipt.rs` carrying channel provenance
  (`Channel`), bootstrap-created ownership retention, active generation, the
  consistency generation counter, prior seat identity (`PriorSeatIdentity`), and
  an optional durable interruption marker (`InterruptionMarker`), alongside the
  release identity, target, activation state, and creation time.
- Implement atomic persistence: `persist` writes a pid-suffixed temp file,
  restricts it to the owner, then renames over the destination so a reader never
  observes a torn receipt; `activate` clears the interruption marker and commits
  active state; `mark` records a durable phase marker mid-transaction.
- Treat a malformed active receipt as a hard `ReceiptError`, not a best-effort
  empty default, since activation authority cannot silently default.

## Outcome

A bootstrap receipt round-trips through disk retaining ownership; a mid-flight
receipt persists as `Staged` with its interruption marker, and activation
atomically produces an `Active` receipt with the marker cleared.

## Notes

None.
