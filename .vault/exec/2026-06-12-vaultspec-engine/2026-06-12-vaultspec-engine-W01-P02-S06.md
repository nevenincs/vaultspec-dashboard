---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S06'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement workspace discovery resolving any launch directory to the repository common git dir via gix, with fixture-repo tests

## Scope

- `engine/crates/ingest-git/src/workspace.rs`

## Description

- Implement `Workspace::discover` resolving any launch directory to the repository common git dir via gix discovery, canonicalized so the identity key is spelling-independent.
- Add fixture-repo helpers (git CLI builds the fixtures; the engine itself never shells out per ADR D2.5 - the constraint governs runtime, not test setup).
- Test same-workspace resolution from repo root, deep subdirectory, and a linked worktree; non-repos fail loud.

## Outcome

Workspace identity = common git dir (ADR D2.1): main checkout and every linked worktree resolve to one equal `Workspace` value.

## Notes

Typed `GitError` introduced for the crate (thiserror); gix discovery error boxed to keep the variant small.
