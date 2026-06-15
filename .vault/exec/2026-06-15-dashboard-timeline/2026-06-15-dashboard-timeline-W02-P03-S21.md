---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S21'
related:
  - "[[2026-06-15-dashboard-timeline-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-timeline with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S21 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add an adapter unit test covering the lineage slice reconciliation and ## Scope

- `frontend/src/stores/server/liveAdapters.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add an adapter unit test covering the lineage slice reconciliation

## Scope

- `frontend/src/stores/server/liveAdapters.test.ts`

## Description

- Add an `adaptLineageSlice` unit-test block to `liveAdapters.test.ts` feeding a captured live-shaped lineage sample through the adapter.
- Assert node fields (id, phase, created string, numeric epoch-ms modified tick, title, degree), the derivation-fallback arc (no `derivation`), self-consistency of the arc endpoints, and the present-only semantic tier riding through.
- Assert the truncated honesty block is carried when present, and that a sparse/non-object body degrades to safe empties without throwing.

## Outcome

Three tests cover the reconciliation, the truncated path, and tolerance. They pin the optional-field handling and the numeric `modified` typing as regression guards.

## Notes

None.
