---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S07'
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
     The S07 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Raise the chip-remove and back affordances to the touch floor, mark stems select-text, put a polite live region on the coverage card, and move information-bearing small captions off ink-faint and ## Scope

- `frontend/src/app/left/CreateDocDialog.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Raise the chip-remove and back affordances to the touch floor, mark stems select-text, put a polite live region on the coverage card, and move information-bearing small captions off ink-faint

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Raise the chip-remove and back affordances to the touch floor on coarse pointers (2.75rem min) with an always->=24px hit area (WCAG 2.5.8); chips grow with them.
- Mark the coverage stems, chip stems, and the selected-feature pill `select-text` (touch-selectability D2).
- Put a polite live region on the coverage card so the async Checking-to-rows (or degraded) swap is announced.
- Move information-bearing small captions off ink-faint to ink-muted (stems, "Not yet", the four state lines, the type-row reason/purpose hints); the decorative eyebrow stays for the app-wide S13 ruling pass.

## Outcome

Closes the panel's share of touch-target-subminimum (both audits), data-not-select-text (LOW), coverage-arrival-silent (MEDIUM), and the panel-local half of ink-faint-small-text-contrast. Render suite green.

## Notes

None.
