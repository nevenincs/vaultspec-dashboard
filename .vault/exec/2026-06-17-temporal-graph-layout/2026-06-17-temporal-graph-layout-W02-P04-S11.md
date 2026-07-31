---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-07-12'
body_hash: 'sha256:c2b958ad291e40e9512b1dfabcef666eeea90253689cddb06697735332044b5d'
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
