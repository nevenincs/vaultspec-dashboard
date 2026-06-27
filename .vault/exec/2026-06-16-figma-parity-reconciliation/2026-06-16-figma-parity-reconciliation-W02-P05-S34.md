---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S34'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

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
