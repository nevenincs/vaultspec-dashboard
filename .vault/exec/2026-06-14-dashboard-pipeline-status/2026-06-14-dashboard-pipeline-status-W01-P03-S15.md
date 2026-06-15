---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S15'
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
     The S15 and 2026-06-14-dashboard-pipeline-status-plan placeholders are machine-filled by
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
     The Add the adaptPipelineStatus and adaptPlanInterior adapters that unwrap the envelope and tolerate the live wire shape, mirroring adaptGraphSlice, so one client path serves both mock and live origins and ## Scope

- `frontend/src/stores/server/liveAdapters.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the adaptPipelineStatus and adaptPlanInterior adapters that unwrap the envelope and tolerate the live wire shape, mirroring adaptGraphSlice, so one client path serves both mock and live origins

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Verified the `adaptPipeline` and `adaptPlanInterior` tolerant adapters unwrap the envelope and tolerate the live shape; extended `adaptPipelineArtifact` to forward `feature_tags` and `dates` on truthful absence.

## Outcome

One client path serves both mock and live origins for the pipeline capabilities.

## Notes

Satisfied by the sibling `dashboard-pipeline-wire` plan; verified the deliverable exists and is consumed by this plan's surface.
