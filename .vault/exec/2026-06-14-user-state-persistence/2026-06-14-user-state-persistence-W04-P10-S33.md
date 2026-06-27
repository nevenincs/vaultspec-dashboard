---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S33'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# add stores tests for the session client and restore and persistence

## Scope

- `frontend/src/stores/server/session.test.ts`

## Description

- Added a new stores test suite covering the session/settings client through the
  SAME mock transport the live app uses (the real client → adapter path, never a
  hand-built double): GET/PUT session shape round-trips, scope_context +
  push_recent persistence and read-back, push_recent dedup-to-front, and settings
  global/scoped writes with sparse-omit of empty scopes.
- Covered the tiered 400: an unknown `active_scope` rejects as a typed
  `EngineError` with status 400 and the tiers block preserved, and the active
  scope is left unchanged.
- Covered restore-on-load through stores hooks: `useActiveScope` returns the
  persisted `active_scope` from `useSession` rather than a recomputed default, and
  an explicit in-session pick (`viewStore.scope`) wins the precedence — driven
  over a QueryClient with the mock transport, never a fetch in a component.
- Covered selection persistence: `usePutSession` writes `scope_context` and the
  `useSession` read reflects it via the onSuccess cache seed.
- Covered view-store semantics: `seedFromSession` mirrors a restored context
  WITHOUT wiping ephemeral working state (a restore is not a swap), and `setScope`
  clears the folder context wholesale on a swap.

## Outcome

The session/settings client, restore-on-load, and selection persistence are
covered end-to-end against the mock transport. All 14 tests pass; eslint, prettier
and tsc are clean on the suite.

## Notes

The restore-on-load tests install the mock on the app-wide `engineClient` and
restore the default transport in `afterEach` (even on a thrown assertion) so the
mock never leaks into another suite. No skips, no tautologies — each assertion is
derived from the live wire contract, not copied from output.
