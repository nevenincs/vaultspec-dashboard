---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:a91910968ee6879eae8f3c8ccc9599aa1192c2290417cb62c8bd32419cbe67d2'
step_id: 'S33'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Emit node selection intent on activating an ADR row, calling selectNode with the ADR's stable node id

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Emitted node selection intent on activating an ADR row, calling `selectNode` with the ADR stable node id.

## Outcome

Activating an ADR row selects the ADR node through the same seam.

## Notes

None.
