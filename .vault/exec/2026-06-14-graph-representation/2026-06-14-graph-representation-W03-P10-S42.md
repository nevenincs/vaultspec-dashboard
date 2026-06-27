---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S42'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Render overlays as a layer toggled by set-overlays without re-layout

## Scope

- `frontend/src/scene/field/fieldAssembly.ts`

## Description

## Outcome

Added `overlayLayer.ts` (Pixi): draws hulls at document LOD and country labels at overview, behind the field, toggled by set-overlays WITHOUT re-layout; tokens for colour (faint low-chroma, no second accent). Wired into fieldAssembly position/camera frames.

## Notes
