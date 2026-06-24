---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-06-24'
step_id: 'S25'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace keyboard-navigation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S25 and 2026-06-21-keyboard-navigation-plan placeholders are machine-filled by
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
     The Build the timeline mark cursor: one focusable region with aria-activedescendant, arrows/Home/End traverse marks, Enter selects, replacing the sr-only per-mark button enumeration and ## Scope

- `live-verify`
- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the timeline mark cursor: one focusable region with aria-activedescendant, arrows/Home/End traverse marks, Enter selects, replacing the sr-only per-mark button enumeration

## Scope

- `live-verify`
- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Built the timeline mark cursor (the contended `Timeline.tsx` was clean/committed, so safe to edit): rebuilt `TemporalAccessibleNodes` from a sr-only enumeration of tabIndex=-1 buttons into ONE focusable `role="listbox"` (tabIndex 0) carrying an `aria-activedescendant` cursor over per-mark `role="option"` items.
- Arrows (Left/Right + Up/Down) move the cursor prev/next, Home/End jump to the first/last mark, Enter/Space selects the cursored mark via the existing `onNodeClick`; each move sets the existing hover intent so the VISUAL dot highlights, and `aria-selected` tracks the cursor. Consumed keys `stopPropagation` (Class-B isolation from the global bare-arrow bindings).

## Outcome

- Live-verified via the self-launched-Chromium harness: the listbox is one tab stop with 1000 options; focusing it and pressing ArrowRight moved the aria-activedescendant cursor foundation-adr → audit → reference, ArrowLeft moved back, End jumped to the last mark. tsc/eslint/prettier clean; Timeline tests (14) green. W05 timeline is now fully keyboard-navigable (viewport pan/zoom + mark cursor + playhead + minimap).

## Notes

- The cursor does not yet PAN the viewport to keep an off-screen cursored mark visible — a refinement; selection (Enter) and the dot-hover highlight work regardless of viewport position. The mark cursor (listbox) and the viewport (pan/zoom) are two distinct tab stops with distinct key models, which is coherent.
