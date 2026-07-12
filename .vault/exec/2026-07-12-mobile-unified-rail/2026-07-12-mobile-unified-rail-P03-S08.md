---
tags:
  - '#exec'
  - '#mobile-unified-rail'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S08'
related:
  - "[[2026-07-12-mobile-unified-rail-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace mobile-unified-rail with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S08 and 2026-07-12-mobile-unified-rail-plan placeholders are machine-filled by
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
     The Run the full frontend lint gate and vitest suite and drive to green and ## Scope

- `frontend/` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Run the full frontend lint gate and vitest suite and drive to green

## Scope

- `frontend/`

## Description

- Run the full frontend lint gate (`just dev lint frontend`: eslint, px guard, prettier, tsc, tokens, figma:names) and confirm exit 0.
- Run the full vitest suite twice: first surfaced one guard failure, the second confirmed a clean pass after the fix.

## Outcome

Full lint gate exit 0. Full vitest suite green: 314 files, 2854 tests passing. The change is regression-free.

## Notes

The first full suite run failed exactly one guard — `filterConsolidation.guard.test.ts` — because the S03 draft mounted `FilterSidebar` in `app/shell/`; the guard binds every filter mount to `app/left/`. Fixed by rehoming the mount into `CompactFilterSheet` (`app/left/`), rendered from the rail's top level. The re-run passed all 2854 tests. (The suite's console shows expected negative-path 400s and one ECONNRESET from live-wire error-path tests; all 314 files passed.)
