---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S04'
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
     The S04 and 2026-07-12-mobile-unified-rail-plan placeholders are machine-filled by
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
     The Render the unified rail for the Home pane in the compact shell, keep the Timeline pane, and route the search, advanced-filter, and workspace-switcher triggers to the Home top bar and ## Scope

- `frontend/src/app/shell/CompactAppShell.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render the unified rail for the Home pane in the compact shell, keep the Timeline pane, and route the search, advanced-filter, and workspace-switcher triggers to the Home top bar

## Scope

- `frontend/src/app/shell/CompactAppShell.tsx`

## Description

- Render `CompactUnifiedRail` for the `home` pane and keep `CompactTimeline` for `timeline`; drop the standalone Browse and Status branches from the `<main>`.
- Route the worktree-name title, the search + advanced-filter top-bar actions, and the workspace-switcher title trigger to the `home` surface.
- Correct the stale Browse references in the surrounding comments to Home.

## Outcome

The compact shell mounts the unified rail as its landing surface; the Timeline surface and the one-scroll `<main>` (which owns `overflow-y-auto`) are unchanged.

## Notes
