---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S36'
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
     The S36 and 2026-06-14-dashboard-pipeline-status-plan placeholders are machine-filled by
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
     The Thread the active as-of playhead into usePipelineStatusView so the surface reflects the historical pipeline under a past playhead, consistent with the timeline ADR and ## Scope

- `frontend/src/app/right/WorkTab.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Thread the active as-of playhead into usePipelineStatusView so the surface reflects the historical pipeline under a past playhead, consistent with the timeline ADR

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Threaded the active as-of playhead (the view store time-travel mode) into `usePipelineStatusView` and the pipeline cache key so the surface reflects the historical pipeline under a past playhead, consistent with the timeline ADR.

## Outcome

The surface reads as-of the playhead; a historical view is a distinct cache entry from the live view.

## Notes

The live `pipeline(scope)` wire takes no as-of yet, so a past playhead reuses the live projection until the wire grows the parameter; the surface still degrades honestly via tiers.
