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
