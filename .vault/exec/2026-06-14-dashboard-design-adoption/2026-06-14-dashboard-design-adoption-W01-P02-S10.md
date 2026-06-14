---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S10'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---




# Verify the scene's three token-reading files resolve their colors from the rebuilt token layer via getComputedStyle

## Scope

- `frontend/src/scene/field/edgeMeshes.ts`

## Description

- Verify the scene's three token-reading files resolve their colors from the rebuilt token layer via getComputedStyle.
- Add a happy-dom verification test that applies the rebuilt token layer's literal scene-read hex onto the document element and asserts the edge-mesh group-color reader and the node-sprite state-color reader resolve them.
- Cover the light-to-dark theme flip so the readers re-resolve the new hex, and cover the ink-muted fallback path.

## Outcome

The cross-layer seam is proven against the new token values, not just the hardcoded fallbacks the node-env unit tests exercise. The readers parse the rebuilt hex correctly in light, fall back to ink-muted when a lifecycle is absent, and pick up the dark hex on a theme flip. All existing scene tests stay green.

## Notes

The production build confirms the scene-read tokens emit as literal hex (three renderings per token, one per theme) on the root selector, so the readers' parseInt(slice(1),16) contract holds. The readers themselves were not modified - the emission format was kept hex precisely to keep their blast radius zero.

## Revision (design review, batch 1)

Followed up on the independent design review of the foundation commit:

- HIGH-1: `--color-state-complete` and `--color-state-archived` were emitted as
  `oklch(...)`, but the `nodeSprites` reader parses only hex and silently fell through
  to the hardcoded light fallback in every theme (a `complete` node read ~1.79:1 on the
  dark canvas). Re-emitted both as literal hex in the scene-read subset of all three
  theme blocks, so all five lifecycle states are hex.
- MEDIUM-3: the minimap layer hardcoded a cold-blue second accent for feature dots and
  the viewport rect, and a gray for node dots. Routed feature/viewport through the
  accent-tone scene-read token and node dots through the muted-ink token via the
  existing getPropertyValue seam.
- Extended the scene token-read verification to cover all five lifecycle states,
  including a dark-theme case for complete/archived, and added a minimap colour-routing
  test that proves no off-palette literal survives and the accent re-resolves on a
  theme flip.
