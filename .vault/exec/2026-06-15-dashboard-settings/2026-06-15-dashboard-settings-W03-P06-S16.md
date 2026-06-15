---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-settings with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S16 and 2026-06-15-dashboard-settings-plan placeholders are machine-filled by
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
     The Build the reusable Dialog primitive with focus trap, scrim, animated entry, and Escape or backdrop dismiss and ## Scope

- `frontend/src/app/chrome/Dialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the reusable Dialog primitive with focus trap, scrim, animated entry, and Escape or backdrop dismiss

## Scope

- `frontend/src/app/chrome/Dialog.tsx`

## Description

- Built the reusable `app/chrome/Dialog.tsx`: scrim, centered panel with the dialog role, real focus trap (Tab/Shift+Tab cycle), Escape + backdrop dismiss, focus-into on open and focus-restore on close.
- Generalized from the command-palette modal; token-driven, Lucide close glyph.

## Outcome

A reusable modal primitive the app previously lacked.

## Notes

