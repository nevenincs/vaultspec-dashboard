---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S05'
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
     The S05 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Make ineligible type rows aria-disabled and roving-included with their served reason associated via aria-describedby, add Home and End, and follow focus when reconcile moves the selection and ## Scope

- `frontend/src/app/left/CreateDocDialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Make ineligible type rows aria-disabled and roving-included with their served reason associated via aria-describedby, add Home and End, and follow focus when reconcile moves the selection

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Switch ineligible type rows from hard `disabled` to `aria-disabled`: focusable and roving-included, activation a no-op; the served reason (plain-language mapped) is programmatically associated via `aria-describedby`.
- Widen arrow roving to ALL rows (focus visits ineligible rows, selection only lands on eligible - the APG radio-with-disabled pattern); add Home/End with the same preventDefault + stopPropagation as the arrows.
- Follow focus when the async eligibility reconcile moves the selection while the radiogroup owns focus, so the roving tab stop and DOM focus never diverge.

## Outcome

Closes disabled-type-reason-unreachable (HIGH), home-end-missing-in-radiogroup (MEDIUM), and reconcile-moves-tabstop-not-focus (MEDIUM). The render test asserting the old hard-disabled contract was updated honestly to the aria-disabled one (focusable, described, activation no-op).

## Notes

None.
