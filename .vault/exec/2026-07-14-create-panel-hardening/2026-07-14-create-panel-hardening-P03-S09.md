---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S09'
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
     The S09 and 2026-07-14-create-panel-hardening-plan placeholders are machine-filled by
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
     The Add keyboard and announcement regression tests: stage-transition focus, default initial focus, aria-disabled reason reachability, Home and End, draft preservation on Escape and ## Scope

- `frontend/src/app/left/CreateDocDialog.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add keyboard and announcement regression tests: stage-transition focus, default initial focus, aria-disabled reason reachability, Home and End, draft preservation on Escape

## Scope

- `frontend/src/app/left/CreateDocDialog.render.test.tsx`

## Description

- Add the keyboard and announcement regressions: default initial focus on every open (combobox, never the header close), stage-transition focus re-homing both directions, the polite step live region, Home/End roving with the window-spy leak guard, Escape-preserves-draft with reopen-restores, and the always-present add-link affordance.
- Extend the live-engine section: one-click prerequisite routing (an ineligible decision-record click selects and focuses research) and the full remove-then-re-add link flow over the fixture corpus.

## Outcome

Render suite grew 15 -> 26 tests (plus 4 compact); every audit HIGH/MEDIUM now carries a regression lock. The Escape-preserves test caught a REAL defect in the draft preservation (below) before it shipped.

## Notes

Defect caught by the new test: the open-time link seed cleared its key on close, so a reopen re-seeded over the preserved draft and wiped user-edited links. Fixed by letting the seed key survive dismissal and clearing it only on the successful-create reset.
