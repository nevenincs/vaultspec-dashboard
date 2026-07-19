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
