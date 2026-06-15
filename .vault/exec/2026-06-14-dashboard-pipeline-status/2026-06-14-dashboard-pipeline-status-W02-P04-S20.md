---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S20'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Render the plan row: the ProgressRing, the plan title, the tier badge (L1-L4) reading the real plan-tier facet, the current pipeline phase, and a freshness stamp from the doc-node dates, using only the shared :root token tier and the two sanctioned icon families

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rendered the plan row: the `ProgressRing`, the title, the tier badge reading the real plan-tier facet, the current pipeline phase, and a freshness stamp from the doc-node dates, using only the shared :root tokens and the two sanctioned icon families.

## Outcome

A plan row carries ring, title, tier, phase, and freshness from real facets.

## Notes

None.
