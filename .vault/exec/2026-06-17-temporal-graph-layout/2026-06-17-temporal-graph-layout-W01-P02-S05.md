---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S05'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# route the Timeline segment to temporal graph mode while retaining playhead and time-travel state

## Scope

- `frontend timeline controls`

## Description

- Routed the Timeline layout segment to temporal graph mode.

## Outcome

Selecting Timeline now writes `representation_mode: temporal` alongside time-travel mode, while preserving the existing playhead instant behavior.

## Notes

Verified by the GraphControls render test against the live dashboard-state client.
