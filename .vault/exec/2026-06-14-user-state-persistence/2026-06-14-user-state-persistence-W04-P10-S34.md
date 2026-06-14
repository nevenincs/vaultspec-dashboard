---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S34'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---




# add a mock-versus-live parity test feeding a captured sample through the adapter

## Scope

- `frontend/src/stores/server/liveAdapters.session.test.ts`

## Description

- Added the mock-versus-live parity test for the session/settings surface: a
  sample captured verbatim from the live `vaultspec serve` routes (the exact
  `{data, tiers}` envelopes the engine conformance suite asserts) is fed through
  the SAME tolerant adapter the app uses and must reconcile onto the internal
  shape.
- Proved the session adapter against the live shape (workspace, active_scope,
  scope_context folder + feature_tags, recents) and the fresh-store shape (null
  folder, empty arrays), plus tolerance of a sparse body and a non-object body
  (defaulting to safe empties, never throwing).
- Proved the settings adapter against the live shape (global map + per-scope
  scoped map keyed by the scope token), plus tolerance of empty maps, a sparse
  body, and defensive dropping of non-string values.

## Outcome

The mock-mirrors-live-wire-shape proof is executable: the live session/settings
shapes reconcile through the tolerant adapter, and a sparse or older shape never
throws. All 8 tests pass; eslint, prettier, and tsc are clean.

## Notes

The captured-live samples are the exact shapes the engine's `conformance.rs`
asserts, derived from the contract — not copied from a broken run's output. No
skips, no tautologies.
