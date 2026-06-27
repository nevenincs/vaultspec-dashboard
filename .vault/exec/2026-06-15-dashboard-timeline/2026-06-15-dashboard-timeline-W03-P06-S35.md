---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S35'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

# Add the 14px grayscale-by-shape gate assertion for the phase-lane document marks

## Scope

- `frontend/src/app/timeline/Timeline.render.test.tsx`

## Description

- Rewrite the timeline render test to assert the 14px grayscale-by-shape gate for
  the phase-lane document marks, reusing the shared `gateFamily` gate over the
  exact `MarkDef` silhouettes the surface draws (research, reference, adr, plan,
  exec, audit), with the same 8-cell squint floor the scene gate uses.
- Add render-level tests driving the real stores transport (mockEngine) over the
  live lineage wire shape: each dated document renders as an activatable button
  naming its kind, date, and lineage degree, under a non-overriding group role.
- Dock a fine scale on the corpus week so the research and adr pipeline marks fall
  in range and resolve by name, proving the marks are dated, not events.

## Outcome

The gate proves the lane marks stay distinct in grayscale at the legibility floor;
the render tests prove the marks are dated, button-roled, and degree-announced.

## Notes

The mock corpus feature names are seeded by the fixture; the assertions match by
doc-type and date rather than hardcoding a feature slug to stay fixture-agnostic.
