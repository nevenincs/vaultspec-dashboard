---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S01'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace touch-selectability with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Author the shared selection-guard helper that yields the app context menu to a live non-collapsed text selection intersecting the target, plus its yield/open unit matrix and ## Scope

- `frontend/src/app/menus/guardedContextMenu.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the shared selection-guard helper that yields the app context menu to a live non-collapsed text selection intersecting the target, plus its yield/open unit matrix

## Scope

- `frontend/src/app/menus/guardedContextMenu.ts`

## Description

- Author `shouldYieldContextMenuToSelection`, `selectionForEventTarget`, and the `guardedContextMenu` wrapper in `frontend/src/app/menus/guardedContextMenu.ts` per ADR D1
- Implement `Range.intersectsNode` intersection with a containment fallback that over-approximates toward yielding
- Author the nine-case yield/open unit matrix in `frontend/src/app/menus/guardedContextMenu.test.ts` under the happy-dom environment pragma

## Outcome

Guard module and matrix landed; 9/9 tests pass. `selectionForEventTarget` resolves null (never throws) outside a DOM environment so node-env handler tests keep passing.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
