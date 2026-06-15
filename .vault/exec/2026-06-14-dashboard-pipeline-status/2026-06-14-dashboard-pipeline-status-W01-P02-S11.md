---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S11'
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
     The S11 and 2026-06-14-dashboard-pipeline-status-plan placeholders are machine-filled by
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
     The Add the PlanInteriorView interface and the derivePlanInteriorView selector exposing rolled-up completion, the ordered tree, and the truncated honesty block so the step tree reads bounded-interior truncation as a designed state, never a silent partial result and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the PlanInteriorView interface and the derivePlanInteriorView selector exposing rolled-up completion, the ordered tree, and the truncated honesty block so the step tree reads bounded-interior truncation as a designed state, never a silent partial result

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Added the `PlanInteriorView` interface and the `derivePlanInteriorView` selector: per-container rolled-up completion attached bottom-up (steps to phase to wave to plan), the ordered tier-honest tree, and the truncated honesty block.

## Outcome

The step tree reads rolled-up completion and bounded-interior truncation as designed state, never a silent partial.

## Notes

None.
