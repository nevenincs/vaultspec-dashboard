---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S09'
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
     The S09 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Build the dashboard shell and header bar mirroring the bound frame and mount it as the Search service panel body, retiring the re-hosted console composition and ## Scope

- `frontend/src/app/panels/RagJobDashboard.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Build the dashboard shell and header bar mirroring the bound frame and mount it as the Search service panel body, retiring the re-hosted console composition

## Scope

- `frontend/src/app/panels/RagJobDashboard.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Build the dashboard shell + header bar mirroring the bound frame: identity + health dot/word, pid/port meta, lifecycle verbs with eligibility (Start when down, Stop/Restart when running, Doctor; disabled-with-reason reindex when offline), inline reindex progress.
- Swap the Search service panel body to the dashboard (Dialog wide, footer slot carries the storage strip); create compiling skeletons for the three region files per the cross-lane integration contract.
- Header bar exported as a pure props-fed sub-component so verb eligibility and offline states are wire-free testable; 7 unit tests + 1 live smoke.

## Outcome

Green. Executed by rag-shell-coder; verified independently.

## Notes

Lifecycle label map re-created locally (console helpers are unexported; console file deliberately untouched pending W03 retirement decision). Console body import dropped from ControlPanels.
