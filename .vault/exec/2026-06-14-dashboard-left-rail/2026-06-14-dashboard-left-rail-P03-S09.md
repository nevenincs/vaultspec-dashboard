---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S09'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---




# Make the filter visibly distinct from the global right-rail search pillar

## Scope

- `frontend/src/app/left/`

## Description

- Make the filter visibly distinct from the global right-rail search pillar: a Lucide `Filter` funnel mark (not the search glass), a 'filter <mode>...' placeholder (not 'search'), and inline placement in the rail's browser region.

## Outcome

The in-rail filter reads as a different surface from the global search pillar; committed and asserted in the render test.

## Notes

The right-rail SearchTab uses the Lucide `Search` glass and `POST /search`; the in-rail filter uses the funnel and no wire, the deliberate distinction the ADR demands.
