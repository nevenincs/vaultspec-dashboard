---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S30'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the belt-and-suspenders client mark and arc cap

## Scope

- `frontend/src/app/timeline/scrollStrip.ts`

## Description

- Export the belt-and-suspenders client ceilings `MAX_TIMELINE_MARKS` and `MAX_TIMELINE_ARCS` (arcs higher, since a node can carry several).
- Add a pure `capItems(items, max)` returning a `Capped<T>` (the kept items plus how many were `dropped`), truncating to at most `max`.
- Treat a non-positive or non-finite `max` as drop-everything rather than throwing; return a copy so caller state is never aliased.

## Outcome

The surface can never render an unbounded mark or arc count even if the engine somehow serves one: the cap truncates and reports the dropped count so the truncation is stated, not silent. This is the client half of the ADR's bounded-and-honest reads, complementing the engine's document node ceiling.

## Notes

Pure and allocation-safe: `capItems` always returns a fresh array, so callers cannot mutate the source through the result.
