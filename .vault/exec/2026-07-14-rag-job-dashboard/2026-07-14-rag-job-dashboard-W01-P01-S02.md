---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S02'
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
     The S02 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Design the job table frames - column header row with sort marks, row states (queued, running with progress, done, failed), the filter query field, and the phase facet chips and ## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard jobs region` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Design the job table frames - column header row with sort marks, row states (queued, running with progress, done, failed), the filter query field, and the phase facet chips

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w RagJobDashboard jobs region`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Fill the JobsRegion: JOBS eyebrow, controls row (SearchField filter query, All/Running/Queued/Done/Failed chips, sort control), bordered table header (Job/Phase/Progress/Started/Duration with sort mark), four row states (running with progress bar, queued, done, failed with reason note), and the "Showing the 50 most recent jobs" truncation note.

## Outcome

Jobs region bound; row states legible in grayscale (dot + word, never hue alone).

## Notes

Minor row-height unevenness on rows with empty progress cells - cosmetic in the frame; code rows derive their own uniform height.
