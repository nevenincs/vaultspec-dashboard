---
tags:
  - '#exec'
  - '#dashboard-timeline'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S32'
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
     The S32 and 2026-06-15-dashboard-timeline-plan placeholders are machine-filled by
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
     The Add the phase-lane model with the doc-type to lane mapping as a pure helper and ## Scope

- `frontend/src/app/timeline/phaseLanes.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the phase-lane model with the doc-type to lane mapping as a pure helper

## Scope

- `frontend/src/app/timeline/phaseLanes.ts`

## Description

- Add the phase-lane model as a pure helper: `PHASE_LANES` (the six pipeline phases in fixed top-to-bottom order: research, adr, plan, exec, review, codify) and the `PhaseLane` type.
- Add `phaseForDocType` mirroring the engine's canonical `phase_for_doc_type` mapping exactly (research/reference to research, adr, plan, exec, audit to review, rule to codify; commit/index/unknown to null).
- Add `laneOf(node)` taking the authoritative wire `phase` first and falling back to the `doc_type` mapping; `laneIndex` for the vertical order; and lane geometry helpers `laneY`, `laneCenterY`, `lanesHeight` with `LANE_HEIGHT`.
- Reconcile to one source of truth: move the canonical lane list and type here and re-export `PHASE_LANES`/`PhaseLane` from the timeline component, which now imports them from this module for its store typing and visibility defaults.

## Outcome

There is now a single lane vocabulary: the phase-lane model owns the list, type, doc-type fallback, and geometry, and the timeline component re-exports the list and type so prior import sites keep working. No duplicated lane list remains. Commits are handled as not-a-phase-lane (null), matching the ADR's ambient/off-by-default treatment.

## Notes

The doc-type fallback is kept byte-for-byte aligned with the engine mapping so the client never invents a phase the pipeline does not own.
