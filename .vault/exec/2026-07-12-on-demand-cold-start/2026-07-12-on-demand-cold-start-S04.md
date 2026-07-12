---
tags:
  - '#exec'
  - '#on-demand-cold-start'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-12-on-demand-cold-start-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace on-demand-cold-start with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S04 and 2026-07-12-on-demand-cold-start-plan placeholders are machine-filled by
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
     The Test the progressive slice (cold fill, passthrough on data, asOf bypass, refreshing availability during fill) and the paced drain and ## Scope

- `frontend/src/stores/server/queries.test.ts + engine.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Test the progressive slice (cold fill, passthrough on data, asOf bypass, refreshing availability during fill) and the paced drain

## Scope

- `frontend/src/stores/server/queries.test.ts + engine.test.ts`

## Description

Test the progressive slice in `frontend/src/stores/server/queries.test.ts`: live cold fill (feature-only nodes held, isPending masked, refreshing availability derived true) then document swap; feature-granularity bypass fires no second query; time-travel issues only document bodies.

## Outcome

2 tests green against the live engine. Review caught one tautological waitFor assertion (isPending || true) - removed; the real gate (graphBodies.length > 0) already followed it.

## Notes

<!-- Incidents. Data loss. Difficulties; persistent failures. Skipped work. Scaffolds left in code. Failures. -->
