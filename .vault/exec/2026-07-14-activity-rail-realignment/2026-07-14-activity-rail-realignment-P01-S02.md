---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S02'
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
     The S02 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Design the Search service and Approvals panel frames as modal dialogs re-hosting the existing console layouts, replacing the stale search-console binding and ## Scope

- `Figma SlhonORmySdoSMTQgDWw3w SearchServicePanel ApprovalsPanel` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Design the Search service and Approvals panel frames as modal dialogs re-hosting the existing console layouts, replacing the stale search-console binding

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w SearchServicePanel ApprovalsPanel`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Create `SearchServicePanel` (1089:4344): 480-wide modal shell (chrome/paper-raised, radius 10, Elevation/Popover shadow), Title/15 title row with quiet close mark, body = clone of the existing `RagOpsConsole` frame content stretched to fill - the console layout re-hosts unchanged.
- Create `ApprovalsPanel` (1089:4437): same shell; review queue of bordered proposal rows, each with title, kit Badge (Waiting / Claimed), meta line, and kit Button instances Approve (Secondary) / Reject (Ghost).

## Outcome

Both panels are bound frames replacing the rail-section presentation; the stale RagOpsConsole rail binding (879:4125) is superseded by the panel frame for the code join.

## Notes

No ReviewStation frame existed in Figma; the Approvals queue is a fresh Kit composition.
