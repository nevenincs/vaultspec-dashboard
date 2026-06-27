---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-06-23'
step_id: 'S21'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Give the right-rail fold sections a keyboard contract (twisty focusable, Enter/Space toggles, arrows move between folds) via FocusZone

## Scope

- `frontend/src/app/right/StatusTab.tsx`

## Description

- Enrolled the right rail's six fold-section headers (Changes + Open Plans/PRs/Issues + Recent PRs/Commits) onto one vertical `useFocusZone` in `StatusTab`: the headers are now ONE tab stop and arrows rove between sections (Enter/Space toggles the focused fold via the native header button).
- Threaded the roving header wiring through the existing pass-through API: `SectionCard` and `ChangesOverview` gained `headerRef`/`headerProps` props that forward to `RailSection`/`FoldSection`; `StatusTab` calls `zone.rove(key)` per header in render order and spreads the result.

## Outcome

- Live-verified: the section headers carry one tab stop (Changes = 0, others = -1) and ArrowDown roved the Changes header → Open Plans header (a real section header, aria-expanded present). tsc/eslint/prettier clean; StatusTab/ChangesOverview/PlanStepTree tests (3) green.

## Notes

- Model: "arrow between sections, Tab into a section's rows" — the section headers are a roving group; each section's interactive rows stay Tab-reachable. A fully-unified single zone over headers AND every row is the larger S22 piece (the rail's rows are heterogeneous — `PrRow`/`IssueRow` are display-only `<li>`s, not focusable — so row roving needs making those rows focusable first).
