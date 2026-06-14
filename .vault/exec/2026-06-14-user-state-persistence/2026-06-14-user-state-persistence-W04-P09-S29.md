---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S29'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# restore the persisted session on load instead of recomputing the default scope

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

- Rewrote `useActiveScope` to restore the persisted session: precedence is now
  the explicit in-session pick, then the persisted session `active_scope` (read
  through the `useSession` stores hook), then the map default — the reload no
  longer recomputes a default when a selection was persisted.
- Kept `useActiveScope` a PURE read hook (no side effects): it is consumed by ~9
  surfaces, so the cold-start persist cannot live inside it.
- Added a dedicated `useRestoreSessionScope` effect hook, mounted ONCE in Stage
  (one scene per app lifetime), that persists the cold-start map default through
  `usePutSession` exactly when the session loaded with no active scope, no pick
  exists, a vault-bearing default exists, and the mutation is idle — so the first
  ever choice becomes durable and every subsequent reload takes the restore path.
- Extracted the map-default selection into a `mapDefaultScope` helper shared by
  the read hook and the restore hook.

## Outcome

Reload amnesia for the active scope ends: end to end, `useSession` reads the
persisted `active_scope` on load and `useActiveScope` returns it instead of
recomputing; a never-before-selected workspace persists its computed default once
so the next reload restores it. The restore flows through stores hooks only — no
fetch and no raw tiers read in the chrome. Frontend `tsc -b` and prettier pass.

## Notes

The cold-start persist is latched off by the mutation's non-idle state and by
`onSuccess` flipping `active_scope` truthy, so it fires at most once per app
lifetime. The precedence and restore are covered directly by the S33 stores
tests. No skips.
