---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S38'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add the list/row ARIA semantics and a single polite live region announcing the settled outcome (in-flight count, empty, degraded, loading) so a screen reader hears the state without sighted scanning, mirroring the SearchTab live-region pattern

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Added the list/row ARIA semantics and a single polite live region announcing the settled outcome (in-flight count, empty, degraded, loading), mirroring the SearchTab live-region pattern so a screen reader hears the state without sighted scanning.

## Outcome

The settled outcome is announced once through one polite live region.

## Notes

None.
