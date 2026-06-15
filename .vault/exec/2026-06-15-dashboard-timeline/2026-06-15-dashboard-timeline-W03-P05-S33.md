---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S33'
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
     The S33 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add unit tests for the phase-lane model and doc-type to lane mapping and ## Scope

- `frontend/src/app/timeline/phaseLanes.test.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add unit tests for the phase-lane model and doc-type to lane mapping

## Scope

- `frontend/src/app/timeline/phaseLanes.test.ts`

## Description

- Add co-located vitest unit tests for the phase-lane model.
- Assert the lane order (the six phases top-to-bottom in pipeline order) and `laneIndex` for each token plus null for non-lane tokens.
- Assert `phaseForDocType` for every pipeline doc-type (research, reference to research, adr, plan, exec, audit to review, rule to codify) and null for ambient/unknown/absent doc-types.
- Assert `laneOf` precedence: wire `phase` authoritative, `doc_type` the fallback, null for a node in no lane.
- Assert the lane geometry helpers (`laneY`, `laneCenterY`, `lanesHeight`).

## Outcome

The lane order and the phase-to-lane and doc-type-fallback mapping are proven for every phase by passing unit tests, and the geometry helpers are covered. The mapping mirrors the engine's `phase_for_doc_type` test on the frontend side.

## Notes

None.
