---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Build the dark theme as a [data-theme=dark] remap of the semantic tier with warm-tinted near-black neutrals, as an equal peer to light

## Scope

- `frontend/src/styles.css`

## Description

- Build the dark theme as a `[data-theme=dark]` remap of the semantic tier, an equal peer to light.
- Remap surfaces to warm-tinted near-black neutrals (the warm hue carried into dark, not a cold blue-black), inks to the light end of the warm ramp, and accent/state roles to their dark-ground renderings.
- Override the scene-read hex tokens with their dark renderings and deepen the elevation shadows against the dark ground.

## Outcome

Dark is a full peer remap; no component knows it is active. Warmth survives into dark as a warm near-black ground (ADR layer 3 and 9). The scene-read hex flips with the theme so the canvas and minimap re-ground.

## Notes

The dark scene-read hex values are the OKLCH dark renderings of the same semantic steps, contrast-proven in the S17 block.
