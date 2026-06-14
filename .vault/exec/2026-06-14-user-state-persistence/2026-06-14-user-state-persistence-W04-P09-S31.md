---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S31'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# persist worktree selection through the session API

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description

- On a worktree pick, persist the selection durably through
  `usePutSession({ active_scope })` so it survives a reload, keeping the immediate
  `setScope(worktree.id)` for responsiveness (the durable write rides alongside
  the optimistic UI move).
- Surface a rejected switch gracefully: a `switchError` state holds a message set
  from the mutation's `onError` — a tiered 400 (unknown/non-vault scope) reports
  "could not switch", any other failure reports "could not persist"; rendered as
  a small status line under the picker rather than failing silently.
- Imported `EngineError` to distinguish the 400 rejection from a transport fault,
  and `usePutSession` from the stores query layer (the chrome consumes the stores
  mutation, never fetches).

## Outcome

Switching worktrees now persists durably through the session API, so the chosen
worktree is the one restored on the next reload; a rejected switch is reported in
the picker. The existing WorktreePicker / VaultBrowser / browserSelection suites
stay green.

## Notes

The immediate `setScope` plus the durable `putSession` is the responsive-then-
durable pattern the ADR's prototype posture calls for. No skips, no stubs.
