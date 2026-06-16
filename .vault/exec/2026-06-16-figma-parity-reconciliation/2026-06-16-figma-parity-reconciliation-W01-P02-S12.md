---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S12'
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
     The S12 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Freeze and document the SceneController command and event contract as the canvas rewrite API surface and ## Scope

- `frontend/src/scene/sceneController.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Freeze and document the SceneController command and event contract as the canvas rewrite API surface

## Scope

- `frontend/src/scene/sceneController.ts`

## Description

- Document the locked `SceneController` command/event channel as the canvas rewrite API surface in the figma-parity-reconciliation contract reference.
- Enumerate the data shapes the controller carries (the node-data visual-anatomy input, the edge input, the delta op, the screen-space anchor) and which fields the rewrite reads.
- Enumerate the frozen inbound command union and the frozen outbound event union member-by-member, plus the anchor and lifecycle surface.
- Record that the rewrite plugs a new field renderer behind the seam without widening either union, and routes selection/hover back through the existing events.

## Outcome

The `SceneController` command and event contract is frozen as documentation only; the command union, event union, and lifecycle surface are unchanged. The canvas rewrite (Wave W03) builds against exactly this seam. No surface change was made, honoring the W01.P01.S04 lock discipline.

## Notes

Documentation only, no code. Any future surface change to this seam is an ADR-flagged redline, not a drive-by edit, as the seam header already mandates.
