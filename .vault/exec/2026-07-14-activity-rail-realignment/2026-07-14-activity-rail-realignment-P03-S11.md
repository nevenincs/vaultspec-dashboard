---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S11'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace activity-rail-realignment with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Evict the Search service and Approvals SectionCards from the rail and retire the rag-ops, rag-ops:details, and authoring-review section ids and ## Scope

- `frontend/src/app/right/StatusTab.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Evict the Search service and Approvals SectionCards from the rail and retire the rag-ops, rag-ops:details, and authoring-review section ids

## Scope

- `frontend/src/app/right/StatusTab.tsx`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Delete the Search service and Approvals SectionCards and imports from `StatusTab`; retire `rag-ops` and `authoring-review` from the StatusSectionId union and STATUS_SECTION_IDS (keep `rag-ops:details`).

## Outcome

Rail is status-only; rail.test.ts needed no changes (it never pinned the evicted sections). Executed by rail-chrome-coder; verified independently.

## Notes

Persisted open-state for the retired ids drops on rehydrate via the existing normalizer - no migration shim, per the ADR.
