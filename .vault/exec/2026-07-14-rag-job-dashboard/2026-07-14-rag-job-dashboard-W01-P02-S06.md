---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S06'
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
     The S06 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Derive the jobs table view (sort by recency or duration, text query, phase facets, served-bound truncation honesty) as pure functions with unit tests and ## Scope

- `frontend/src/stores/server/ragDashboardView.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Derive the jobs table view (sort by recency or duration, text query, phase facets, served-bound truncation honesty) as pure functions with unit tests

## Scope

- `frontend/src/stores/server/ragDashboardView.ts`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Derive the jobs table view as pure functions: recency/duration sort, case-insensitive id/step/kind text query, phase facets mapped through the existing `isJobTerminal`/`isJobFailed` interpreters (queued/running/done/failed), group counts computed over the text-filtered set so facet chips reflect the active search, and `truncated` read from served total vs served count - never a client re-count.

## Outcome

Green with unit vectors. Executed by rag-stores-coder; verified independently.

## Notes

Pure module (no hooks) so the chrome lane consumes it directly.
