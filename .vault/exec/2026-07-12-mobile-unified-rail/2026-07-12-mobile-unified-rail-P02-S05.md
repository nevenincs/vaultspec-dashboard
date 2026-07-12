---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S05'
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
     The S05 and 2026-07-12-mobile-unified-rail-plan placeholders are machine-filled by
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
     The Reduce the bottom tab bar to Home, Timeline, and Search and update its glyphs and labels and ## Scope

- `frontend/src/app/shell/BottomTabBar.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Reduce the bottom tab bar to Home, Timeline, and Search and update its glyphs and labels

## Scope

- `frontend/src/app/shell/BottomTabBar.tsx`

## Description

- Reduce the compact tab list to Home, Timeline, and Search; retire the Browse and Status tabs (both folded into Home).
- Add a `House`-based `Home` glyph to the centralized kit glyph module (Lucide structural family) and bind the Home tab to it.
- Update the bar's header and FocusZone comments to the three-surface count.

## Outcome

The bottom bar shows three thumb-reachable tabs; the active tab keeps its non-colour-only accent pill and `aria-current`. The unused `Books` and `GitBranch` imports are dropped.

## Notes
