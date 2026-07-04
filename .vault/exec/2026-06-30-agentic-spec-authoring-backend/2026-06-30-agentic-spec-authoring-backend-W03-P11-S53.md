---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
step_id: 'S53'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add snapshot tests for unchanged revision, stale base, missing preimage, hash mismatch, and restart recovery

## Scope

- `engine/crates/vaultspec-api/src/authoring/snapshots.rs`

## Description

- Add direct assertions that revision metadata preserves document identity and omits payload text.
- Add whole-document target snapshot hashing coverage.
- Add recovery payload coverage proving rollback target text is reconstructed from the exact stored preimage.
- Preserve existing coverage for unchanged revision, stale base, missing preimage, same-length hash mismatch, ref-scope snapshot reads, and restart recovery with retention metadata.

## Outcome

- The snapshot test suite now covers all W03.P11 named cases plus the S52 metadata, target snapshot, and recovery payload surfaces.
- Focused verification passed with `cargo test -p vaultspec-api authoring::snapshots -- --nocapture`: 9 tests passed.

## Notes

- The hash-mismatch fixture intentionally mutates stored text to another string with the same byte length so the integrity path reaches the hash check.
- No destructive git operation was used.
