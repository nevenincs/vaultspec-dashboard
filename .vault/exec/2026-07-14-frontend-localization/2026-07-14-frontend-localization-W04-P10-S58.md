---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S58'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize status-tab summaries, freshness, unavailable states, and recovery guidance

## Scope

- `frontend/src/app/right/StatusTab.tsx`
- `frontend/src/app/right/FrameworkStatusCluster.tsx`

## Description

- Verified both files resolve their summary, freshness, unavailable-state, and
  recovery-guidance copy through `useLocalizedMessage` over typed descriptors.
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.

## Outcome

Status-tab summaries and the framework status cluster render only localized,
typed-descriptor copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). `StatusTab.tsx`'s localization
landed in bulk commit `3562d0262a` ("localize frontend and split oversized modules");
`FrameworkStatusCluster.tsx` was rebuilt afterward (`7bd22f87ee` agent-panel work,
`fb71b6866f` footer-cluster refactor) and remains typed. This record retroactively
documents and ticks the plan step; verification was file inspection plus a scoped
scanner run, not a fresh implementation.

CORRECTION (2026-07-17): the original 13-hit `useLocalizedMessage` count missed that
`StatusTab.tsx`'s freshness row (line ~177, rendered ~268) called the then-unlocalized
`presentation/freshness.ts` helper (a defect tracked separately under `W03.P07.S113`,
outside my original grep pattern since it is a plain function call, not a
`useLocalizedMessage`/`resolveMessage` site, and outside the scanner's reach as a
`.ts` string-builder module). That defect has since landed atomically: `StatusTab.tsx`
now calls the rewritten `freshness()` helper and resolves its typed descriptor via
`resolveMessage(fresh.descriptor).message`, with the static muted tone preserved.
Independently confirmed via `git diff` and a clean scanner run. Tick stands; treat this
as a correction of the original verification's coverage, not a defect in the step's own
outcome.
