---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S11'
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
     The S11 and 2026-07-12-touch-selectability-plan placeholders are machine-filled by
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
     The Scope doc tab title selection to the title span so tab dragging survives, and guard the doc-tab menu open and ## Scope

- `frontend/src/app/stage/DockWorkspace.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Scope doc tab title selection to the title span so tab dragging survives, and guard the doc-tab menu open

## Scope

- `frontend/src/app/stage/DockWorkspace.tsx`

## Description

- Import `guardedContextMenu` and wrap the doc-tab `onContextMenu` handler with it.
- Add `select-text` scoped to the title span only, leaving the tab root and close button unchanged so drag-to-dock still works.

## Outcome

`frontend/src/app/stage/DockWorkspace.tsx` now yields the doc-tab context menu to a live text selection, and the open document's title text is selectable without affecting dockview's drag-to-dock on the tab root. `npx vitest run src/app/right src/app/stage src/app/islands` (261 tests) and `npx tsc --noEmit` both pass clean.

## Notes

None.

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
