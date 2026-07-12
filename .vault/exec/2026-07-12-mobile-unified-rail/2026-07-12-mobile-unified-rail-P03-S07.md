---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S07'
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
     The S07 and 2026-07-12-mobile-unified-rail-plan placeholders are machine-filled by
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
     The Add pure unit and render tests for the compact rail-sections fold store and the reduced bottom tab bar and ## Scope

- `frontend/src/stores/view/compactRailSections.test.ts`
- `frontend/src/app/shell/BottomTabBar.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add pure unit and render tests for the compact rail-sections fold store and the reduced bottom tab bar

## Scope

- `frontend/src/stores/view/compactRailSections.test.ts`
- `frontend/src/app/shell/BottomTabBar.test.tsx`

## Description

- Add a pure unit test for the rail-sections fold store: both sections default open, each toggle flips only its own flag, and reset restores both.
- Add a happy-dom render test for the bottom tab bar: exactly Home, Timeline, and Search render, the active tab carries `aria-current="page"`, and `onSelect` reports the tapped surface id; no Browse or Status tab.

## Outcome

Four fold-store cases and three tab-bar cases, all passing; the only spy is the caller's own `onSelect` (no engine wire mocked). Authored by a delegated Opus coder under supervision.

## Notes

The unified rail's full render is wire-coupled (it mounts the live `StatusTab`); its composition is covered indirectly through the fold store, the tab bar, and the `FoldSection` kit primitive's own tests rather than a heavier live-wire mount.
