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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S34 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The add a mock-versus-live parity test feeding a captured sample through the adapter and ## Scope

- `frontend/src/stores/server/liveAdapters.session.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
