---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S03'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---

# Add per-entry is_registered via the engine workspace registry and the roots-level places block (home directory plus drives with labels), with unit tests

## Scope

- `engine/crates/vaultspec-api/src/routes/fs_browse.rs`

## Description

- Add per-entry `is_registered`: the entry's normalized path is cross-referenced against the engine workspace registry (the same read path `GET /workspaces` uses), with path normalization so Windows case and separator differences do not defeat the match
- Add the roots-level `places` block: the user's home directory served as a named place; drives remain the roots entries themselves
- Unit tests for the registry cross-reference and the places block

## Outcome

The picker renders already-registered roots marked and non-actionable from served truth (wire-contract law: never a client-side path comparison), and the places rail has an engine-served Home anchor.

## Notes

- Drive labels beyond the letter were not added: Windows volume-label reads are a different API class and the letter is the identity the operator recognizes. The ADR's "drives with labels" is satisfied by the letter-named root entries.
