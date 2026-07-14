---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S13'
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
     The S13 and 2026-07-14-activity-rail-realignment-plan placeholders are machine-filled by
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
     The Re-pin the rail guard tests and the status parity harness to the status-only composition and relocate the console and review-station tests beside their panels and ## Scope

- `frontend/src/app/right/rail.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Re-pin the rail guard tests and the status parity harness to the status-only composition and relocate the console and review-station tests beside their panels

## Scope

- `frontend/src/app/right/rail.test.ts`

## Description

<!-- Succinct line-by-line list of steps executed. Use imperative language, mirroring git commit summary lines. -->

## Outcome

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->

## Description

- Audit the suite for tests pinning the evicted rail composition: none existed (console/review tests exercise bodies standalone; the status parity harness mounts the already-clean StatusTab).
- Add the positive status-only guard to the rail suite: sections exactly Plans/Pull requests/Issues/Commits, retired ids normalize to null, CONTROL_PANEL_IDS is exactly the four cluster panels.

## Outcome

Green. Executed by rail-parity-coder; verified independently.

## Notes

No test relocation was needed - nothing was coupled to the old rail mounts.
