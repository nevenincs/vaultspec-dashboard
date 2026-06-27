---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S03'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Author the DTCG elevation source with the Figma three-level scale raised, overlay, and popover

## Scope

- `frontend/tokens/elevation.tokens.json`

## Description

- Authored a new DTCG elevation source under the tokens directory carrying the binding Figma three-level scale: raised, overlay, and popover.
- Each level is a shadow token holding an ink-tinted layered drop-shadow value that harmonises with the warm neutral ground (depth via soft elevation, never gradients or textures).
- Authored the base/light shadow values only, recording in the description that the per-theme dark and high-contrast shadow remaps stay hand-authored in the stylesheet per the tokens README scope boundary.

## Outcome

The elevation taxonomy is authored as DTCG faithful to the binding Figma three levels, collapsing the prior six-level flat/card/panel/float/dialog/deep scale. The raised/overlay/popover levels reuse the existing card/float/dialog drop-shadow geometries so the visual depth is preserved while the count drops to three. Consumed by the generator and Figma mirror extensions.

## Notes

Only the base shadow values are generated; the dark and high-contrast per-theme shadow overrides remain hand-authored in the stylesheet theme blocks because per-mode shadows are deliberately outside the generated set (the README scope boundary). This keeps warmth-lives-in-tokens satisfied: depth is a token, expressed as a soft ink-tinted shadow, with no decoration.
