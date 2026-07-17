---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S230'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize timeline filter criteria and unavailable-state messages with consistent verbs

## Scope

- `frontend/src/app/timeline/menus/timelineFilterActions.ts`

## Description

- Verified every criterion action's label and unavailable/disabled reason is sourced
  from the already-localized `timelineDateCriterion.ts` vocabulary
  (`criterion.filterActionLabel`, `criterion.currentFilterActionLabel`,
  `criterion.unavailableReason`, `TIMELINE_DATE_CRITERION_MESSAGES.current`), never a
  raw literal owned by this file.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The timeline "Filter by" criterion menu renders only localized, typed-descriptor copy
with consistent verbs across its current/available/unavailable states.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed via the
`timelineDateCriterion.ts` vocabulary migration in commit `81cc7291de` ("feat(frontend):
localize timeline date criteria"). This record retroactively documents and ticks the
plan step; verification was file inspection plus a scoped scanner run, not a fresh
implementation.
