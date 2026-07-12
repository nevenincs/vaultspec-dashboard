---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S01'
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
     The S01 and 2026-07-12-mobile-unified-rail-plan placeholders are machine-filled by
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
     The Cut the compact surface union to Home and Timeline plus the momentary Search, renaming the browse pane to home and updating the default, reset, and pane helpers and ## Scope

- `frontend/src/stores/view/compactSurface.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Cut the compact surface union to Home and Timeline plus the momentary Search, renaming the browse pane to home and updating the default, reset, and pane helpers

## Scope

- `frontend/src/stores/view/compactSurface.ts`

## Description

- Replace the compact surface union with `home`, `timeline`, and the momentary `search`; drop the retired `browse` and `status` pane ids.
- Point the store default and the reset target at the unified `home` pane.
- Keep the primitive-returning selector hook and the standalone setter/reset (stable-selector law) unchanged in shape.

## Outcome

The compact shell now rests on one `home` pane plus `timeline`; the former Browse and Status panes no longer exist as standing surfaces. Typecheck, eslint, and prettier clean.

## Notes
