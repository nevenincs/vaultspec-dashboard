---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S14'
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
     The S14 and 2026-07-14-rag-job-dashboard-plan placeholders are machine-filled by
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
     The Re-anchor the retired console composition tests onto the dashboard regions and extend the panel guards and ## Scope

- `frontend/src/app/panels` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-anchor the retired console composition tests onto the dashboard regions and extend the panel guards

## Scope

- `frontend/src/app/panels`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Delete `RagOpsConsole.tsx` outright (ZERO code consumers after the W02 swap; no test file existed; figma:names stays green and the dashboard carries its own binding citation) - no bridge.
- Retire the now-orphaned `rag-ops:details` section id (the console was its only consumer); rail suite asserts it normalizes to null.
- Add the ControlPanels guard: the search-service panel renders the dashboard shell + all three regions, the retired console fold is absent, and nothing mounts while closed.

## Outcome

Green. Executed by rag-hardening-coder; verified independently.

## Notes

Figma inventory docs (frontend/figma/FRAMES.md) still list the retired console node 879:4125 - a docs-only cleanup flagged for the closing pass, not enforced by any gate.
