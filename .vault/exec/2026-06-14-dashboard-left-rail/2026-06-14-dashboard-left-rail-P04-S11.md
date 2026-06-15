---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---




# Keep the inline git status badge read-only with no mutation affordance anywhere in the rail

## Scope

- `frontend/src/app/left/WorktreePicker.tsx`

## Description

- Keep the inline git status badge read-only: the WorktreePicker ahead/behind/dirty badge surfaces git STATE only, with no stage/commit/discard/checkout affordance anywhere in the rail.

## Outcome

The git badge stays read-only status; no mutation affordance exists in the rail.

## Notes

`WorktreePicker` is unchanged for this step; the read-only render test scans every rail button for forbidden git/disk/vault mutation vocabulary and finds none.
