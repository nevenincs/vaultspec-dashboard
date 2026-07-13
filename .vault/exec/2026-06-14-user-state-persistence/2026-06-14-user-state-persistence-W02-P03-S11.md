---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S11'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# restore and persist the active scope through the session crate at serve boot

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Register the new `registry` module in the crate root.
- At serve boot, build the workspace state through `build_state` (which opens
  the shared `UserState` once, eagerly warms the launch scope's cell, spawns its
  watcher on its own clock, and pins it as the active scope).
- Restore the persisted active scope through the shared `UserState`: read the
  workspace's stored active scope, validate it still names a selectable
  vault-bearing worktree, warm it and make it active if it differs from the
  launch worktree, otherwise fall back to the launch worktree.
- Persist the resolved active scope back through `UserState::set_active_scope`
  so a first run seeds it; lock the shared handle's `Mutex` in a tight block so
  the guard never crosses an `await`.
- Remove the now-redundant single-scope cold-index and watcher-wiring from
  `serve`: both moved onto the per-scope registry build path; `write_service_json`
  is unchanged (one process, one port/token, written under the workspace root).

## Outcome

Reload restores "where I was": the persisted active scope is validated and
warmed at boot, and the active scope is persisted back through the single shared
user-state writer. The watcher and cold index are now per warm scope, driven by
the registry. The serve boot path compiles and the migrated as-of and
poison-recovery tests pass against the new active-cell shape.

## Notes

The shared `UserState` is `!Sync` (rusqlite), so every boot access takes the
`Mutex` in a scoped block that drops the guard before any `.await` — a guard held
across an await would make the serve future non-`Send`. The persisted scope is
validated before warming so a stale token (a worktree that was removed) falls
back to the launch worktree rather than failing boot, per the best-effort
posture.
