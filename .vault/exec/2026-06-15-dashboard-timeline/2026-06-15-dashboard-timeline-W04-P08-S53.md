---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S53'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S53 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the jump-to-date control and ## Scope

- `frontend/src/app/timeline/TimelineControls.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the jump-to-date control

## Scope

- `frontend/src/app/timeline/TimelineControls.tsx`

## Description

- Add the jump-to-date control as a native tabular date input plus a go button, with a Lucide calendar mark; the go button is disabled until a valid date is entered, and Enter in the input triggers the jump.
- Add a pure `jumpToDateOffset` helper that returns the clamped scroll offset centring an instant in the viewport at the current scale (scale unchanged).
- Wire the control to set the store's scroll offset from the parsed date.

## Outcome

Jump-to-date centres the chosen date in the viewport without changing the zoom. Verified by a pure-helper test asserting the centred instant maps back to the viewport centre and clamps at the origin, plus a component test asserting the disabled-when-empty state and the centred offset after entering a date.

## Notes

The jump uses a real native date input so the control is tabular and keyboard-reachable for free; the scale is deliberately left untouched (a jump moves where you look, not how zoomed you are).
