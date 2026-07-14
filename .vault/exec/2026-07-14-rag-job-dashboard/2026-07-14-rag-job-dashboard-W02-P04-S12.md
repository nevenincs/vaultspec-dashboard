---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S12'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace rag-job-dashboard with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S12 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Build the footer storage strip - storage rollup with lower-bound honesty, watcher state and toggle, refresh and ## Scope

- `frontend/src/app/panels/RagDashboardFooter.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the footer storage strip - storage rollup with lower-bound honesty, watcher state and toggle, refresh

## Scope

- `frontend/src/app/panels/RagDashboardFooter.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Build the footer storage strip: Entries / On disk / Projects (live-orphaned split) stat cells from the storage rollup, surveyed-slice lower-bound note when truncated, kit Switch watcher toggle through the existing seams (disabled-with-reason offline), Refresh invalidating the dashboard reads.

## Outcome

Green. Executed by rag-regions-coder; verified independently.

## Notes

Renders inside the Dialog pinned footer slot per the shell integration contract.
