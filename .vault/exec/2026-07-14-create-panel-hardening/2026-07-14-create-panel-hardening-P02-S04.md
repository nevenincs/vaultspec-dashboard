---
tags:
  - '#exec'
  - '#create-panel-hardening'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S04'
related:
  - "[[2026-07-14-create-panel-hardening-plan]]"
---

# Move focus deterministically on stage transitions, default initial focus to the feature combobox for every entry point, and announce the stage change

## Scope

- `frontend/src/app/left/CreateDocDialog.tsx`

## Description

- Re-home focus on every stage transition: entering the document stage focuses the selected type radio (back affordance as fallback); returning focuses the feature combobox. Tracked against the previous stage so a bare re-render never steals focus.
- Default initial focus for EVERY open: the stage's primary field (combobox at stage 1, selected radio on a draft-preserving stage-2 reopen), replacing the header-Close landing; the Features-affordance one-shot flag is still consumed but now matches the default.
- Announce the stage change through a visually-hidden polite live region ("Step 1 of 2 ..." / "Step 2 of 2 ...").

## Outcome

Closes focus-lost-on-stage-transition (HIGH), default-initial-focus-is-close-button (MEDIUM), and stage-transition-not-announced (MEDIUM). 15 render tests green.

## Notes

Executed inline by the principal (coder fleet throttled by a shared session limit).

## Review addendum

Recorded trade (review LOW): defaulting initial focus to the feature field
raises the soft keyboard on every compact open. Accepted deliberately —
with the pinned footer and focused-field scroll-into-view, the keyboard no
longer hides the primary action, and a consistent focus target beats a
per-pointer fork.
