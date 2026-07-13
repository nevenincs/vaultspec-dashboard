---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S23'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Render the ADR row as a leaf (no step tree): title, the StatusPill reading the real ADR-status facet, feature, and a freshness stamp

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rendered the ADR row as a leaf (no step tree): title, the `StatusPill` reading the real ADR-status facet, the feature tag, and a freshness stamp.

## Outcome

An ADR row is a leaf that reads real status and feature; it has no expand affordance.

## Notes

None.
