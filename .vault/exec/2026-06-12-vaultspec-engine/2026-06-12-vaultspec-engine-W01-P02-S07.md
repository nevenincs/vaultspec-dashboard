---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S07'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement worktree enumeration capturing checkout path, HEAD ref and dirty state

## Scope

- `engine/crates/ingest-git/src/worktrees.rs`

## Description

- Implement worktree enumeration: the main checkout plus all linked worktrees via the gix worktree proxy API, skipping pruned/inaccessible entries non-fatally.
- Capture checkout path (canonicalized), symbolic HEAD ref (None when detached), dirty state, and an is-main marker.
- Test a two-worktree fixture asserting per-worktree HEAD refs and dirty detection.

## Outcome

Worktrees are first-class scopes per ADR D2.2, each reported as (path, HEAD ref, dirty).

## Notes

Deliberate call: gix `is_dirty()` excludes untracked files, but an untracked vault document is exactly the divergence the landscape must report - dirty detection uses the status iterator (untracked included) instead. Flagged for phase review as a semantics choice, not an ADR deviation (the ADR does not define dirty).
