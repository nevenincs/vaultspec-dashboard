---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S10'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-platform with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-06-13-dashboard-platform-plan placeholders are machine-filled by
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
     The Implement the useAction React hook face over the dispatch core and ## Scope

- `frontend/src/platform/dispatch/useAction.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the useAction React hook face over the dispatch core

## Scope

- `frontend/src/platform/dispatch/useAction.ts`

## Description

- Implemented `useDispatch` (stable bound dispatch) and `useAction<P>(type)` (a typed
  per-type dispatcher), both over the app dispatcher.
- Implemented `useConfirmable<P>(type)`: packages arm-to-confirm as a hook returning
  `{ armed, trigger, cancel }` - first `trigger()` arms, second fires, `cancel()`
  disarms the shared guard and clears local state.

## Outcome

The React face of the seam. 4 tests (renderHook) cover typed dispatch with payload, raw
`useDispatch`, the arm-then-fire flow, and cancel proving the guard truly disarms (a
later trigger re-arms rather than firing). Typecheck and lint clean.

## Notes

`useConfirmable` is the reusable generalization of the ops rail's two-click guard; the
chrome team can drop its hand-rolled `confirming` state in favor of it. `cancel` calls
`appConfirmGuard.disarm(type)` to keep local and guard state in sync.
