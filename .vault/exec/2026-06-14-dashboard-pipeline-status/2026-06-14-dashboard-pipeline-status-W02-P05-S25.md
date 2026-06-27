---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S25'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Render the degraded state from the selector's interpreted degraded flag (pipeline tier absent or unavailable) as a designed advisory notice, never guessed from a transport error

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rendered the degraded state from the selector interpreted `degraded` flag (structural tier absent or unavailable) as a designed advisory notice surfacing the engine per-tier reason, never guessed from a transport error.

## Outcome

Degradation is a designed state read from tiers truth; a bare transport fault does not render degraded.

## Notes

None.
