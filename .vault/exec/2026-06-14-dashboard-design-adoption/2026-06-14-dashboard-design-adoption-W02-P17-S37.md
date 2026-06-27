---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S37'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Wire the authored domain marks through both the React chrome and the Pixi GlyphTextureProvider texture seam so both planes consume the same currentColor marks

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

- Implemented `DomainGlyphs`, the new `GlyphTextureProvider` for the Pixi texture seam, rasterizing each mark through the spike-proven path: resolve `currentColor` to a tintable white ink, parse with `GraphicsContext.svg()` to a Pixi `Graphics`, upload through the same `renderer.generateTexture` call the placeholder provider makes, caching white silhouettes the sprite layer tints with state colour. It resolves a node kind to its species mark and falls back to a real mark for unknown kinds (never blank).
- Implemented the React chrome plane (`markComponents.tsx`) as thin SVG components — `DocTypeMark`, `EventMark`, `TierMark`, `StateMark`, `MarkById` — rendering the SAME mark bodies the texture seam consumes, inheriting hue through `currentColor` (no ink substitution on the chrome plane, which lives in a real cascade) and carrying the decorative-vs-labeled a11y contract.
- Swapped the provider in the field assembly: the live scene now constructs `DomainGlyphs` behind the unchanged `GlyphTextureProvider` seam, typed to the interface so the swap touched no sprite, edge, or browse code. Kept `ProgrammaticGlyphs` in `glyphs.ts` fully intact as the GPU-free placeholder/fallback, and made the seam's `destroy` optional so either provider plugs in.
- Added a happy-dom texture-seam test proving every species mark parses to real Pixi geometry within the 256 grid (GPU upload untested, like the spike), and a chrome render test proving the DOM components draw the same source geometry as the seam and inherit `currentColor`.

## Outcome

The authored and adopted domain marks now feed BOTH planes from one source: the Pixi texture seam through `DomainGlyphs` (a provider swap, not a rendering change) and the React chrome through `markComponents.tsx`, both resolving against the single `marks.ts` registry. Adopting the family was a one-line provider construction change in the field assembly; the placeholder provider remains the node-test/no-GPU fallback. Chrome and canvas are guaranteed to render the same silhouette per species because they share the same `currentColor` mark bodies.

## Notes

The mark source split into three modules to keep the layering honest: `markInk.ts` (the `MarkDef` shape, the 256-grid SVG wrapper, and the `currentColor`-to-ink resolution the seam needs), `marks.ts` (the pure geometry inventory), and `markComponents.tsx` (the React plane). The component file was named `markComponents.tsx` rather than sharing the `marks` stem with `marks.ts`, because TypeScript module resolution would otherwise resolve `./marks` to the data module and never reach the components. No skipped work; the `ProgrammaticGlyphs` fallback path is preserved, not deleted.

Revision (design review, MEDIUM + LOW): the reviewer flagged that `textureForMark(id)` can turn ANY mark into a silhouette texture, so a cross-family collision is as real as a within-family one — yet the gate only compared within families, and `tier:declared` (a filled diamond) sat exactly at the floor (distance 8) against `state:active` (a filled disc), untested. Fixed by exporting `TEXTURABLE_MARK_DEFS` (every id-deduplicated mark `textureForMark` can resolve) and adding a CROSS-FAMILY gate assertion over the whole set, plus giving `tier:declared`'s points the full safe-area extents (24/232) so it reads as an unmistakable rhombus rather than a near-disc — declared-vs-active rose from 8 to 28, and the cross-family global minimum is now 12 (the event file-pair, the intended thinnest pair) rather than that 8. Addressed the LOW dead-surface note by extracting the `textureForMark` id-resolution into a pure exported `markForId` and unit-testing it (tier and state ids resolve to their own defs; an unknown id falls back to a real species), and added a specific doc-created/doc-modified pair-distance assertion (interior is the sole distinguishing channel). The ink-coverage gate, provider-swap transparency, `ProgrammaticGlyphs` fallback, `currentColor`-to-ink substitution, and the parametric progress ring were cleared by the reviewer and left untouched.
