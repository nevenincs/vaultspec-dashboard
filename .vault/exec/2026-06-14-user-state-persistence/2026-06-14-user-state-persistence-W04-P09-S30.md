---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S30'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# seed and persist scope and folder context in the view store through the session API

## Scope

- `frontend/src/stores/view/viewStore.ts`

## Description

- Added an `activeFolder` (string | null) and `featureContexts` (string[]) slice
  to the view store: the durable "which folder + which contexts" projection over
  the existing `feature_tags` grouping primitive — no new node model.
- Added `seedFromSession` (mirrors a restored session's scope + folder context
  into the store WITHOUT the wholesale reset) and `setScopeContext` (mirrors a
  user folder/context selection for synchronous reads; the durable write goes
  through the session API at the call site, never localStorage).
- Extended `setScope`'s wholesale reset to clear `activeFolder`/`featureContexts`
  too — the previous corpus's folder context must not bleed into the new scope —
  while leaving the pin/lens re-key and live-slice reset untouched.
- Wired the seed in Stage via a one-shot `useSeedSessionContext` hook (latched by
  a ref so a later session re-fetch never clobbers in-session edits): on the first
  successful `useSession` load it calls `seedFromSession` with the persisted
  `active_scope` and `scope_context`.

## Outcome

The view store now restores the active folder + feature-tag contexts from the
session on load, and the durable home for scope/folder is the session API (a
stores mutation), not localStorage — ephemeral view state (pins, lenses, position
cache) stays in localStorage as before. The existing scope-swap reset semantics
and pin/lens re-key are preserved (viewStore + isolation suites green).

## Notes

The seed-wiring hook lives in Stage (the single one-per-lifetime owner) so it
mounts once; the store action itself is the file deliverable. `seedFromSession`
sets `scope` only as a mirror — `useActiveScope` still reads the persisted scope
from the session, so the two stay consistent. No skips, no stubs.
