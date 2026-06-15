---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S07'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-pipeline-status with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S07 and 2026-06-14-dashboard-pipeline-status-plan placeholders are machine-filled by
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
     The Add the engineKeys.planInterior cache key (plan node id) and the usePlanInterior query hook that calls engineClient.planInterior, disabled until a plan row is expanded, following the useNodeNeighbors enabled-on-id pattern and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the engineKeys.planInterior cache key (plan node id) and the usePlanInterior query hook that calls engineClient.planInterior, disabled until a plan row is expanded, following the useNodeNeighbors enabled-on-id pattern

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added `engineKeys.planInterior(id)` and the `usePlanInterior` hook calling `engineClient.planInterior`, disabled until a plan row is expanded (the `useNodeNeighbors` enabled-on-id pattern).

## Outcome

The interior is fetched lazily, only for an expanded plan node, honoring graph-queries-are-bounded-by-default.

## Notes

None.
