---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S03'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace mobile-unified-rail with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-07-12-mobile-unified-rail-plan placeholders are machine-filled by
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
     The Author the unified rail composing the Status overview then the Browse tree as natural-height sticky collapsible sections under one outer scroll and ## Scope

- `frontend/src/app/shell/CompactUnifiedRail.tsx`
- `frontend/src/app/left/BrowserRegion.tsx`
- `frontend/src/app/left/LeftRail.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the unified rail composing the Status overview then the Browse tree as natural-height sticky collapsible sections under one outer scroll

## Scope

- `frontend/src/app/shell/CompactUnifiedRail.tsx`
- `frontend/src/app/left/CompactFilterSheet.tsx`
- `frontend/src/app/left/BrowserRegion.tsx`
- `frontend/src/app/left/LeftRail.tsx`

## Description

- Add `CompactUnifiedRail` composing the Status overview then the Browse tree as two sticky, collapsible `FoldSection`s under the one Home-pane scroll, Status first.
- Add `CompactFilterSheet` under `app/left/` to own the canonical filter mount, and render it from the rail's TOP LEVEL, OUTSIDE the collapsible Browse fold, so the top-bar filter button still works when Browse is collapsed.
- Make `BrowserRegion` natural-height on compact (drop the internal `flex-1 overflow-y-auto` on the tree wrapper) so the outer pane is the single scroll.
- Remove the now-dead compact branch of `LeftRail`; the rail is desktop-only, its compact composition rehomed into the unified rail.

## Outcome

One vertical scroll stacks Status above Browse with sticky section headers; no nested scroll traps the tree below the Status section. Typecheck, eslint, prettier, and the px guard clean.

## Notes

The integration-sensitive step. Two design decisions made the single scroll behave: composing both rails as natural-height sections, and keeping the filter sheet outside the Browse fold. The first draft mounted `FilterSidebar` directly in `CompactUnifiedRail` (`app/shell/`), which tripped the `filterConsolidation` guard (every filter mount must live under `app/left/`); the mount was rehomed into `CompactFilterSheet` under `app/left/`, satisfying the guard while keeping the sheet outside the fold.
