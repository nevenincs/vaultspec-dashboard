---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S26'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# add session and settings query and mutation hooks and keys

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Extended `engineKeys` with workspace-singular `session()` and `settings()`
  keys (one active session and one settings document per workspace, not
  scope-keyed).
- Added `useSession` and `useSettings` read hooks over the client's tolerant
  `session()`/`settings()` methods; `useSession` is the restore-on-load source of
  truth Stage consumes.
- Added `usePutSession` and `usePutSettings` mutation hooks: each seeds its own
  cache key from the server-returned full document on success, then invalidates
  so any other observer re-reads the authoritative shape. A rejected switch
  (unknown scope → tiered 400) rejects the mutation for callers to surface
  gracefully.
- Folded the active scope into the live stream subscription: `engineKeys.stream`,
  `engineStreamOptions`, and `useEngineStream` now carry an optional `scope`, and
  `useGraphLiveSync` passes the active scope through so `since=` resume runs
  against that scope's own monotonic clock and two scopes' streams never share a
  cache entry (the W02.P04.S14 per-scope wire change).

## Outcome

The session/settings surface is consumed only through stores hooks (chrome and
scene never touch the wire), and the live stream is now per-scope-correct.
Frontend `tsc -b` passes; queries, stream-01, and graphSync suites are green.

## Notes

The scope-fold into the stream key changed the cache identity, so the existing
`graphSync.test.tsx` seeds were updated to subscribe with the same scope the
active hook uses, and the key-difference test was strengthened to assert two
scopes' streams never collide. This is a direct consequence of the wire change,
not a workaround. No skips, no stubs.
