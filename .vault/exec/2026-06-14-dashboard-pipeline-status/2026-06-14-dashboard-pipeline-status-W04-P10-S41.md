---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S41'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

# Add render tests asserting the plan row (ring, title, tier, phase, freshness) and the leaf ADR row (title, status pill, feature, freshness) render from the mock-backed selector

## Scope

- `frontend/src/app/right/WorkTab.render.test.tsx`

## Description

- Added render tests asserting the plan row (ring, title, tier, phase, freshness) and the leaf ADR row (title, status pill, feature, freshness) render from the mock-backed selector through the real client transport.

## Outcome

The two row species render from real wire facets, proven against the mock.

## Notes

None.
