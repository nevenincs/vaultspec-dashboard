---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:0312cefa93585215adea7c3c4b2890e718af567a947636a18486919bee63988f'
step_id: 'S32'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Emit node selection intent on activating a plan row, calling the existing selectNode seam with the plan's stable node id so the stage and inspector reflect it, mirroring the SearchTab result-activation path

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Emitted node selection intent on activating a plan row, calling `selectNode` with the plan stable node id, mirroring the SearchTab result-activation path so the stage and inspector reflect it.

## Outcome

Activating a plan row selects the plan node through the shared selection seam.

## Notes

None.
