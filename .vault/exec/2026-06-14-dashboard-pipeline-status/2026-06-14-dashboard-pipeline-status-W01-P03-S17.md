---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S17'
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
     The S17 and 2026-06-14-dashboard-pipeline-status-plan placeholders are machine-filled by
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
     The Add a selector unit test asserting derivePipelineStatusView reports degraded when the pipeline tier is absent or unavailable in the served block and reads a fresh error envelope's tiers over a stale held success and ## Scope

- `frontend/src/stores/server/queries.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add a selector unit test asserting derivePipelineStatusView reports degraded when the pipeline tier is absent or unavailable in the served block and reads a fresh error envelope's tiers over a stale held success

## Scope

- `frontend/src/stores/server/queries.test.ts`

## Description

- Added the selector unit tests for `derivePipelineStatusView`: degraded when the structural tier is unavailable or absent, not degraded on a wholly absent block (transport fault), and the fresh error tier winning over a stale held success; plus `derivePlanInteriorView` rollup and truncation coverage.

## Outcome

The degradation honesty law is proven by unit test for the new pipeline-status selector.

## Notes

None.
