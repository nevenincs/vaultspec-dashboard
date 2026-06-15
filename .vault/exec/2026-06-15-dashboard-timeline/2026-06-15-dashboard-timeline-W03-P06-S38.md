---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S38'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---




# Add HEB bundling along feature/lineage containment with a disparity filter as a hardening step

## Scope

- `frontend/src/app/timeline/arcs.ts`

## Description

- Add the disparity filter: keep declared and structural arcs always (framework-
  named lineage) and thin temporal/semantic arcs to those clearing a confidence
  floor, so the weak tiers reduce to their significant subset at coarse scale.
- Add HEB containment grouping (`groupByContainment`) and a bundled cubic path
  (`bundledPath`) routing each arc through a shared group meeting point by a
  bundle strength, plus `bundledArcs`, which computes each group's endpoint
  centroid as the meeting point and caps the union exactly like the raw path.
- Wire bundling into the timeline gated behind a coarse-scale `pxPerMs` threshold
  with a feature-derived containment key; above the threshold the surface uses the
  raw path, so raw arcs are the structural fallback and bundling never raises the
  ceiling or breaks the v1 surface.

## Outcome

At coarse scale cross-feature arcs bundle into clean threads with weak tiers
thinned; at fine scale the surface falls back to raw arcs unchanged.

## Notes

Bundling is only CALLED below the coarse-scale threshold, so a defect in the
bundling path cannot reach the fine-scale raw v1 surface; the cap is applied to the
bundled union identically to the raw path.
