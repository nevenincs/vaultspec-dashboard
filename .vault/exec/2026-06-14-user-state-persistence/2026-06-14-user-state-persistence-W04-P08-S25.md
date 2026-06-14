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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S25 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The add session and settings client methods and snake_case wire types and ## Scope

- `frontend/src/stores/server/engine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
