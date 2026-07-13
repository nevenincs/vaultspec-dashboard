---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S27'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Render the per-capability designed placeholders gated on the CAPABILITY-served constants so an ADR row without real status and a plan row without the step tree show a designed placeholder rather than a broken control

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Gated the per-capability designed placeholders on the capability-served constants so an ADR row without real status shows a 'status pending' placeholder and a plan without the interior shows a designed step-tree placeholder rather than a broken control.

## Outcome

Each not-yet-shipped capability renders a designed placeholder under staged unblock.

## Notes

None.
