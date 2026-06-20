---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S36'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Make the right rail subscribe to canonical selection and panel tab state

## Scope

- `frontend/src/app/AppShell.tsx`

## Description

- Route shell panel collapse state through canonical dashboard `panel_state`.
- Route right panel tab state through canonical dashboard `panel_state`.
- Route right rail node selections through dashboard-state mutation helpers.
- Keep event and edge selections local until the backend state schema carries those selection classes.

## Outcome

Closed S36. The shell and right rail now subscribe to canonical dashboard state for panel state and node selection, while right-rail row actions write back through the shared state engine.

## Notes

The local event and edge inspector selections remain intentionally outside this step because the current backend selection schema is node-id based.
