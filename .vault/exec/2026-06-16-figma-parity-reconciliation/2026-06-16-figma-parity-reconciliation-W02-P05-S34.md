---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S34'
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
     The S34 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the stage minimap widget from its binding frame over the preserved scene viewport state and ## Scope

- `frontend/src/app/stage/MinimapWidget.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the stage minimap widget from its binding frame over the preserved scene viewport state

## Scope

- `frontend/src/app/stage/MinimapWidget.tsx`

## Description

- Rebuild the stage minimap widget onto the new Figma role-named token foundation.
- Migrate the panel shell from the legacy radius and six-level brand shadow to the
  canonical `rounded-fg-md` and the three-level raised elevation
  (`shadow-fg-raised`), the recenter/collapse controls to `rounded-fg-xs`, and the
  Map label to the `caption` type role.

## Outcome

The minimap stays app-chrome hosting a scene-drawn canvas: it registers the canvas
with the PRESERVED `SceneController.setMinimapCanvas` seam on mount and issues the
canonical `fit-to-view` camera command for the keyboard recenter affordance — it
fetches nothing, reads no raw tiers block, and the scene owns every pixel inside
the canvas and applies all camera changes. The collapse/recenter a11y, the
canvas-region aria wiring, and the unregister-while-collapsed frame discipline are
preserved verbatim. No SceneController command or event was widened.

## Notes

No SceneController contract change; the widget plugs into the same lifecycle/camera
seam unchanged. The aggregate frontend gate is red on unrelated uncommitted
scene-layer WIP from a concurrent builder; the scoped file here passes eslint,
prettier, and tsc cleanly.
