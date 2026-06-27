---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S25'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

# add session and settings client methods and snake_case wire types

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Added the snake_case wire types for the orchestration crate's session and
  settings surface: `ScopeContextWire`, `SessionState`, `ScopeContextUpdate`,
  `SessionUpdate`, `SettingsState`, and `SettingUpdate`, mirroring the live
  `{data, tiers}`-enveloped shapes exactly (folder nullable, feature_tags as the
  grouping primitive, scoped settings as a per-scope map).
- Added four `EngineClient` methods: `session()` and `settings()` (GET reads) and
  `putSession(body)` and `putSettings(body)` (PUT writes), each routing through a
  tolerant adapter so a sparse or older shape never throws.
- Added a private `put` transport helper alongside the existing `get`/`post`,
  preserving the tiers-block-bearing error path (`engineErrorFrom`) so an
  unknown-scope tiered 400 surfaces as a typed `EngineError` carrying the
  degradation block.
- Threaded the optional `scope` param through `openStream` and `streamUrl` (the
  W02 stream wire change): resume now runs against the named scope's own
  monotonic clock; absent, the engine falls back to the active scope.

## Outcome

The client is the sole wire entry point for the new session/settings endpoints,
typed against the exact live shapes and stream wire change. Frontend `tsc -b`
passes; the two touched source files are prettier-clean.

## Notes

The session/settings tolerant adapters (`adaptSession`/`adaptSettings`) were
added to the live-adapter module in the same change so the client compiles and
the per-commit gate stays green; the parity test that proves them against a
captured-live sample lands with its own Step. No skips, no stubs.
