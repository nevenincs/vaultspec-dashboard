---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# `user-state-persistence` `W04.P08` summary

Wave `W04` summary (Phases `W04.P08` client + queries, `W04.P09` restore + persistence,
`W04.P10` tests + gate; Steps S25-S35). Wired the frontend stores layer as the sole client of
the new surface, ending reload amnesia.

- Created: `frontend/src/stores/server/session.test.ts`,
  `frontend/src/stores/server/liveAdapters.session.test.ts`.
- Modified: `frontend/src/stores/server/{engine,queries,liveAdapters,graphSync}.ts`,
  `frontend/src/testing/mockEngine.ts`, `frontend/src/app/stage/Stage.tsx`,
  `frontend/src/stores/view/viewStore.ts`, `frontend/src/app/left/{WorktreePicker,browserSelection}` .

## Description

The engine client gained `session`/`putSession`/`settings`/`putSettings` methods and the
`scope` stream param; `queries.ts` added the session/settings query and mutation hooks and
folded scope into the live stream cache key. On load, `useActiveScope` restores the persisted
`active_scope` (in-session pick, then persisted, then map default) and a one-shot hook seeds
the view store's scope and folder context from the session without triggering the wholesale
scope-swap reset; the worktree picker persists selection through `PUT /session`. The current
folder and its contexts are a projection over the existing `feature_tags`. Ephemeral view
state (pins, lenses, position cache) stays in localStorage; only durable session-defining
state goes to the backend. The mock engine mirrors the new session/settings shapes and the
W02 stream/status/scope-retarget behavior, proven by the mock-vs-live parity test feeding a
captured sample through the same adapter the app uses.

Verification: `just dev lint all` exit 0 (eslint + prettier + tsc + cargo fmt + clippy + docs);
490 frontend tests pass (9 pre-existing env-gated skips); engine suites green; all 35 plan
steps closed. Code review verdict PASS; one LOW (explicit one-shot latch for the cold-start
restore) was applied as polish.
