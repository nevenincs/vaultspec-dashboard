---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S35'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the timeline from the binding Timeline Kit primitive over the preserved events query and time-travel store

## Scope

- `frontend/src/app/timeline/Timeline.tsx`

## Description

- Rebuilt the relational phase-lane timeline faithfully to its binding Figma frame (Timeline 17:647, Kit Timeline 239:713) on the canonical Figma role-named token foundation, migrating the surface's class strings from the legacy alias shims to the canonical role utilities.
- Migrated the dense metadata text from the legacy `text-2xs` alias to the canonical `text-caption` role utility across the lane labels, the ruler endpoints, the loading/empty/error states, and the degraded badge.
- Migrated the radius and elevation usages onto the Figma scales: the dated marks and the error retry pill take `rounded-fg-xs`, and the degraded reconnect badge takes the Figma `rounded-fg-pill` plus `shadow-fg-raised`.
- Kept the perfect-circle liveness dots on `rounded-full` (a circle is not the pill radius) and left every behavioral contract unchanged.

## Outcome

The timeline now renders against the canonical Figma role-named utilities and the Figma radius/elevation scales rather than the legacy alias shims, while remaining a dumb projection over the preserved `useTimelineLineage` lineage hook, the `useFiltersVocabulary` corpus bounds, and the time-travel/timeline view stores. Degradation stays read pre-derived from the stores degradation layer (the RECONNECTING row on stream loss), never guessed from a transport error; the surface fetches nothing, mints no model, reads no raw tiers block, and re-mints no stable id. The edited file is eslint-clean, prettier-clean, and introduces no tsc error.

## Notes

The shared worktree carries concurrent uncommitted scene WIP (`frontend/src/scene/field/` graph-viz/scorecard work: an unused-var in `radialLayout.test.ts`, a missing `positionCache` module in `scorecard/calibrate.ts`) that fails the full-tree eslint and tsc steps. Those failures are entirely outside this phase's scope fence and were not introduced by this step; the timeline file itself passes every gate step independently. No engine, stores, scene, or out-of-scope app file was touched.
