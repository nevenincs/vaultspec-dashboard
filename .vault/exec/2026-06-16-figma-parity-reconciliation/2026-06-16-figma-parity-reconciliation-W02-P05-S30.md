---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S30'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S30 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the work tab from the binding WorkTab Kit primitive over the preserved pipeline-status query and ## Scope

- `frontend/src/app/right/WorkTab.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the work tab from the binding WorkTab Kit primitive over the preserved pipeline-status query

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Rebuild the work tab onto the new Figma role-named token foundation, binding to
  the WorkTab Kit primitive (Figma node 137:40).
- Migrate all dense counts and metadata from the legacy dense type scale to the
  `caption` role, and all rows, pills, and status badges from the legacy radius
  and rounded-full scales to the canonical `rounded-fg-xs` and `rounded-fg-pill`.
- Keep the grayscale-safe progress ring, status pill, step check mark, pipeline
  arc, and the lazily-loaded bounded plan step tree intact.

## Outcome

The work tab is a dumb projection over the preserved `usePipelineStatusView` and
`usePlanInteriorView` selectors; it fetches nothing, reads no raw tiers block, and
emits navigation intent only through the existing selection seam. Degradation is
read from the selector's interpreted tiers truth (the designed degraded / loading
/ empty states are preserved verbatim), and the plan interior stays bounded with
honest truncation. The shared `ProgressRing` and `PlanStepTree` exports the Status
overview reuses are unchanged.

## Notes

No store shape or query-key change. The aggregate frontend gate is red on
unrelated uncommitted scene-layer WIP from a concurrent builder; the scoped file
here passes eslint, prettier, and tsc cleanly.
