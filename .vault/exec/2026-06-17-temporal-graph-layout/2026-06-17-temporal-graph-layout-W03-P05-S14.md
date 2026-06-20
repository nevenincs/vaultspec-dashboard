---
tags:
  - '#exec'
  - '#temporal-graph-layout'
date: '2026-06-17'
modified: '2026-06-18'
step_id: 'S14'
related:
  - "[[2026-06-17-temporal-graph-layout-plan]]"
---

# preserve individual node hover, selection, pulse, and accessible mark summaries on the canvas surface

## Scope

- `frontend timeline interaction`

## Description

- Add per-node accessible controls for every rendered temporal scene node.
- Route accessible focus to the same timeline hover state as Cosmos pointer hover.
- Route accessible activation to the same node click handler used for selection and stage pulse.
- Add pure accessible-label coverage for day density and joined-node counts.

## Outcome

Individual temporal documents remain addressable even though the primary marks are rendered by Cosmos. The hidden node list preserves keyboard and assistive-tech access without replacing the canvas nodes.

## Notes

The visible pointer interaction continues to come from the Cosmos field event stream.
