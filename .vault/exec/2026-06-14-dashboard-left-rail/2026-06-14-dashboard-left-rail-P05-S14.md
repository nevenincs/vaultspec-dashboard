---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S14'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---




# Test that the ordered rail stack renders with collapse and focus order

## Scope

- `frontend/src/app/`

## Description

- Add `LeftRail.render.test`: mount the composed rail through the real mockEngine transport and assert one `scope rail` landmark, the coarse-to-fine slot order, vault default, the code toggle swap, and the filter's visible distinction from global search.

## Outcome

The ordered rail stack renders with the collapse model preserved and a single focus order; committed and green.

## Notes

Exercised through the real stores client transport (mockEngine), no component-internal doubles.
