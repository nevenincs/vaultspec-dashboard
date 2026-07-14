---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S10'
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
     The S10 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Build the jobs table region - sortable columns, filter query, phase chips, row selection joining the log pane, truncation note and ## Scope

- `frontend/src/app/panels/RagJobsTable.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the jobs table region - sortable columns, filter query, phase chips, row selection joining the log pane, truncation note

## Scope

- `frontend/src/app/panels/RagJobsTable.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Build the jobs table region over the pure derivations: capped filter query, phase facet toggles with counts, Newest/Longest sort with aria-pressed column marks, selectable rows joining the log pane, running-row progress + step, failed-row note, truncation bound note, designed loading/empty/offline states.

## Outcome

Green. Executed by the named Opus coder rag-regions-coder; verified independently.

## Notes

Jobs read widened to the engine clamp (50) so the table shows real history - the truncation note fires only when the machine total exceeds the served slice. Phase facet pills are a bespoke token-composed composite (kit FacetRow/Chip do not fit an interactive horizontal cluster).
