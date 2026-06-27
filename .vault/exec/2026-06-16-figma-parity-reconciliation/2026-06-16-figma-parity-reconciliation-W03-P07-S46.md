---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S46'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rebuild the scene token reads to the regenerated literal-hex foundation tokens

## Scope

- `frontend/src/scene/field/tokenReads.ts`

## Description

- Rebuilt `tokenReads.ts` as the single scene token-read seam over the REGENERATED literal-hex foundation: documented that the scene-read tokens are emitted as flat `#rrggbb` into the `vaultspec:generated:colors` region of `styles.css` by the Style Dictionary build, and enumerated the exact scene-read subset the readers resolve (canvas-bg, scene-rule, the eight scene-category hues, ink/ink-muted/rule, and the off-canvas tier/state/status marks).
- Stated the literal-hex contract precisely on `cssColorNumber`: getComputedStyle does not flatten a var() chain (nor an oklch() value) for a custom property, so any non-hex value falls through to the caller's fallback rather than mis-painting — the defensive guarantee the scene depends on.
- Clarified `cssColorString` (the canvas-2D / minimap consumer path) and its optional pre-resolved declaration for reading many tokens from one getComputedStyle pass on a hot path.
- Preserved both exports' signatures and runtime behaviour byte-for-byte so the out-of-scope consumers (`minimapLayer.ts`, `overlayLayer.ts`) and the in-scope ones (categoryColor, nodeSprites, edgeMeshes, pixiField) bind unchanged.

## Outcome

The scene token-read seam is rebuilt cleanly against the regenerated literal-hex foundation. Scoped gate green: eslint exit 0, prettier --check clean, project tsc -b exit 0, and the full dependent scene suite (tokenReads, categoryColor, edgeMeshes, nodeSprites unit + draw, salience-encoding, field-assembly, minimapLayer, overlays) passes (92/92). Render-only; no compute, no LOD/ceiling change.

## Notes

The seam is consumed by `minimapLayer.ts` and `overlayLayer.ts`, which are outside this Phase's scope and the concurrent scene agent's fence; the export signatures and behaviour were therefore preserved exactly (a documentation + framing rebuild, not an API change). The canvas-bg read stayed local to `pixiField.ts` (S41) rather than being hoisted into this seam, to keep one commit per step; it is a single private consumer and the literal-hex discipline is identical.

Figma MCP read remained unreachable in this executor session; proceeded on the ADR fallback. Scope isolated; the aggregate frontend gate was not used as the green signal due to the concurrent scene agent's live WIP.
