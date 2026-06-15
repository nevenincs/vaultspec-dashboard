---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S17'
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
     The S17 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the LineageNode wire type carrying stable id, doc-type, derived phase, blob-true dates, title, and degree and ## Scope

- `frontend/src/stores/server/engine.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the LineageNode wire type carrying stable id, doc-type, derived phase, blob-true dates, title, and degree

## Scope

- `frontend/src/stores/server/engine.ts`

## Description

- Add the `LineageNode` wire type carrying the stable `doc:{stem}` id, doc-type, derived phase lane, blob-true dates, optional title, and degree.
- Add a `LineagePhase` union (`research|adr|plan|exec|review|codify`) mirroring the engine `PipelineLanePhase` kebab-case wire tokens.
- Type `dates.modified` as a NUMBER (the engine `Timestamp` is i64 epoch-ms), not a string, to match the live wire exactly.

## Outcome

`LineageNode` and `LineagePhase` are exported from `engine.ts`. The `modified` epoch-ms-number typing is the load-bearing fidelity detail, confirmed against `engine-model` `Dates { modified: Option<i64> }`.

## Notes

`title` is optional (engine `skip_serializing_if = Option::is_none`); the type forwards it only when present.
