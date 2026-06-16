---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S35'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S35 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Rebuild the timeline from the binding Timeline Kit primitive over the preserved events query and time-travel store and ## Scope

- `frontend/src/app/timeline/Timeline.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
