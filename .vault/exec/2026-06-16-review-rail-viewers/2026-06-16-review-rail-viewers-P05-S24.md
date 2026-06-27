---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S24'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Render the viewer degraded, empty, truncated, and error states from the tiers-derived content selector and the truncated block

## Scope

- `frontend/src/app/viewer/CodeViewer.tsx`

## Description

- Render the viewer's loading, errored, degraded, empty, and truncated states from the tiers-derived ContentView and the truncated block; the degraded reason comes from the structural tier.

## Outcome

The viewer's states derive from the content view; the component test covers the truncated notice, the structural-degraded state, and the loading/error states.

## Notes

None.
