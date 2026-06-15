---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S22'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S22 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the useTimelineLineage hook wrapping the lineage projection for scope, range, and filter and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the useTimelineLineage hook wrapping the lineage projection for scope, range, and filter

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add the `useTimelineLineage(scope, range, filter)` TanStack hook to `queries.ts`, wrapping `engineClient.lineage`.
- Add an `engineKeys.lineage(scope, range, filter)` cache key folding the (scope, range, filter) triple, mirroring how `events` folds (range, bucket).
- Gate `enabled` on a non-null scope, following the `useGraphSlice`/`useEngineEvents` pattern.

## Outcome

The timeline surface (W03) consumes the lineage through this single selector; it never fetches the engine, reads the raw `tiers` block, or defines a lineage shape of its own (dashboard-layer-ownership). Two date ranges or two filters never collide on one cache entry.

## Notes

None.
