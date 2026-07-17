---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S09'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

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
