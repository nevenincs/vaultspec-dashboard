---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S08'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S08 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Implement the typed Action and dispatch core with the middleware chain and ## Scope

- `frontend/src/platform/dispatch/dispatch.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the typed Action and dispatch core with the middleware chain

## Scope

- `frontend/src/platform/dispatch/dispatch.ts`

## Description

- Defined the typed `Action` (`type` / `payload` / `meta`), `ActionHandler`, `Next`,
  and `Middleware` (`(action, next) => unknown`) contracts.
- Implemented the `Dispatcher`: a handler registry (`register` returns a disposer,
  `hasHandler`) and a middleware list composed right-to-left around a terminal that
  invokes the registered handler.
- The terminal throws `UnknownActionError` for an unregistered type - a typo is a loud,
  catchable failure, never a silent no-op.

## Outcome

`dispatch.ts` is the thin seam (ADR D2): not a state container, Zustand stays the store.
6 tests cover handler routing, the unknown-action throw, disposer semantics (including
re-registration), middleware ordering, short-circuit, and action transformation.

## Notes

The scene command union is the *model* for the action shape; the locked scene seam is
neither imported nor mutated. Substrate-clean: no upward imports.
