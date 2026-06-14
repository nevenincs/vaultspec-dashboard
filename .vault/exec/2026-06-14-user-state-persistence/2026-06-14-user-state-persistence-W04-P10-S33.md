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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S33 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The add stores tests for the session client and restore and persistence and ## Scope

- `frontend/src/stores/server/session.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
