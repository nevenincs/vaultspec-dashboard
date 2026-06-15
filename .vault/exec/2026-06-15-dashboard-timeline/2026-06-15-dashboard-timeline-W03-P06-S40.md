---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S40'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add ego-highlight plus dim-the-rest on node hover

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Set the hovered node on mark hover and focus (and clear on leave/blur) through
  the store, so the ego-highlight is driven by the shared hovered-node view state.
- Compute the 1-hop ego set (`egoNodeIds`: the hovered node plus every node one arc
  away) and use it to keep the hovered node, its neighbors, and incident arcs at
  full treatment while the rest RECEDE to a dim alpha — never hidden.
- Apply the recede consistently to marks (button opacity) and arcs (path opacity
  scaled by the recede factor) so the whole surface dims around the lifted ego.

## Outcome

Hovering a mark lifts its 1-hop lineage and dims the rest to a legible-but-receded
alpha; nothing is hidden, so the corpus context stays visible around the ego.

## Notes

Focus drives the same hover state as the pointer, so the ego-highlight is reachable
by keyboard; the recede alpha is a single shared constant used by marks and arcs.
