---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S11'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# suppress or pause normal link-force simulation when temporal graph mode is active

## Scope

- `frontend cosmos field simulation`

## Description

- Suppressed normal simulation for static representation layouts.

## Outcome

When a representation supplies static positions, including temporal mode, Cosmos pauses and refuses simulation activation so edge forces cannot move nodes away from date anchors.

## Notes

Verified by typecheck and focused tests; browser verification remains open.
