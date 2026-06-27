---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S17'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# resolve the cell via the registry in the temporal routes

## Scope

- `engine/crates/vaultspec-api/src/routes/temporal.rs`

## Description

- Resolve the per-request scope to its cell in `/events`, `/graph/asof`, and
  `/graph/diff` via `validate_scope`, then operate on the cell's root, scope, and
  live graph rather than the single frozen `AppState`.
- Scope `/events` commit sourcing and node correlation to the resolved cell's
  worktree; scope `/graph/asof` and `/graph/diff` historical snapshots and the
  equal-ref fast path to the cell's worktree, keeping each ref as the time axis
  and the worktree as the corpus-view label so spurious label-only diffs stay
  suppressed.
- Update the shared tiers helpers in `routes/mod.rs` to read from a resolved
  `&ScopeCell` (its root for rag discovery, its declared status), and resolve
  `api_error`/`revision_error` tiers from the always-present active-scope cell so
  even a bad-scope 400 carries an honest tiers block.

## Outcome

The temporal routes serve the resolved scope: events, as-of snapshots, and diffs
all run against the requested worktree's cell, and the as-of resolution facts
(resolved sha, interpretation) and result-local diff numbering are preserved.
Every response — success and the bad-scope 400 included — still carries the
tiers block through the shared envelope helper. The temporal/as-of tests pass.

## Notes

The tiers-helper signature change in `routes/mod.rs` is shared infrastructure
for every cell-resolving route (temporal and ops); it is committed here with the
temporal routes. `api_error`/`revision_error` keep taking `&AppState` and resolve
tiers internally from the active cell, so error paths that fire before a request
scope resolves never lose the tiers block — preserving
`every-wire-response-carries-the-tiers-block`.
