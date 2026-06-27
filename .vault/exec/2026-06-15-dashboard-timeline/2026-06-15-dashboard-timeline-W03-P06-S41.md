---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S41'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add tests for arc treatment, bundling, un-bundle-on-hover, and ego-highlight

## Scope

- `frontend/src/app/timeline/arcs.test.ts`

## Description

- Add `arcs` unit tests covering arc treatment per tier (declared solid, structural
  status-hued by state, temporal dotted, semantic haze) and confidence-as-lightness.
- Cover the geometry (cubic path connecting endpoints, bow direction by lane) and
  the cap (raw arcs truncate to the ceiling and report dropped count).
- Cover the disparity filter (declared/structural never thinned, weak temporal/
  semantic dropped below the floor), the HEB grouping and bundled geometry, and
  the gating property: raw and bundled produce the same arc identities but different
  geometry, and bundling respects the cap exactly like raw.
- Cover un-bundle-on-hover (incident set, raw incident path under a bundle, no raw
  arcs added at rest) and the arc label precedence (derivation > relation > tier).

## Outcome

All 23 arc-module tests pass, locking the treatment, cap, bundling-vs-raw gating,
un-bundle-on-hover, and ego-selection logic as pure, regression-guarded contracts.

## Notes

Ego-highlight selection is tested through `egoNodeIds`/`incidentArcIds` (the pure
parts); the rendered recede is exercised by the render test suite.
