---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S01'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace create-panel-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Grow the Dialog a pinned non-scrolling footer slot (safe-area inset), gate its open animations on prefers-reduced-motion, and scroll the focused field into view within the body and ## Scope

- `frontend/src/app/chrome/Dialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Grow the Dialog a pinned non-scrolling footer slot (safe-area inset), gate its open animations on prefers-reduced-motion, and scroll the focused field into view within the body

## Scope

- `frontend/src/app/chrome/Dialog.tsx`

## Description

- Add the optional pinned `footer` slot to the Dialog primitive: a shrink-0 region below the one scrolling body, top-ruled, carrying the safe-area bottom inset (the sheet idiom generalized into the modal).
- Gate both open animations with motion-reduce variants (the kit spinner idiom).
- Scroll the focused field into view (nearest-block) via a focus handler on the body scroller.
- Migrate every consumer's bottom action row into the slot: the create panel, the add-project dialog, the project navigator, the settings dialog, and the confirm dialog. The control-panels surface was left untouched (foreign in-flight lane).

## Outcome

Closes the audit's compact-submit-behind-keyboard HIGH at the primitive plus the no-safe-area-inset and reduced-motion-unguarded LOWs and the scroll-into-view MEDIUM. Whole-frontend tsc clean; 82 chrome+dialog tests and 160 viewer/settings/navigator consumer tests pass with zero churn.

## Notes

Executed inline by the principal: the delegated coder failed on a shared session limit with zero work landed, so the throttle playbook applied (stand in on the critical path).
