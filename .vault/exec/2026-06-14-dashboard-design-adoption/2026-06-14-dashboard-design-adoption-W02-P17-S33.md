---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S33'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Author the four bespoke abstract tier marks in-family on Phosphor's grid, each passing the 14px grayscale-by-shape gate

## Scope

- `frontend/src/scene/field/glyphs.ts`

## Description

- Authored the four abstract tier marks in-family on Phosphor's 256 grid in a new shared mark-source module `marks.ts`, carrying the redline geometry from the retired hand-drawn family: `declared` a solid filled diamond on center (the only filled tier mass), `structural` an even-odd open square frame plus one bold round-jointed accent corner-notch (the asymmetry that fixes the reading), `temporal` a dashed/segmented stroked ring with a center dot (the only non-continuous silhouette), and `semantic` three stacked sine waves grouped under one stroke style (the only multi-stroke field).
- Built the 14px grayscale-by-shape gate as a pure offline rasterizer (`svgRaster.ts` plus `markGate.ts`): a self-contained SVG-path flattener and ink-coverage sampler that paints true ink (fills with winding rule so a ring's hole stays empty, strokes within their band) over the 256 grid, then compares the resulting 14×14 bitmaps by Hamming distance within a family. The gate is pure (no Pixi, no DOM), so it runs in the default node env.
- Established the doc-type marks alongside the tier marks in the same source (adopted verbatim Phosphor regular-weight paths), so the whole silhouette inventory is one registry both the texture seam and the React chrome resolve against.
- Added `markGate.test.ts` asserting the four tier marks are mutually distinct at 14px above the squint-test floor, with named-pair assertions for the diamond-vs-framed-square separation, plus `svgRaster.test.ts` proving the rasterizer keeps hollow rings hollow and inks stroke bands (the property a fill-containment test loses).

## Outcome

The four abstract tier marks are authored in-family and pass the 14px grayscale-by-shape gate with a minimum pairwise Hamming distance of 38 over a 196-cell bitmap (floor 8); the closest pair is declared/semantic and the family clears the floor by a wide margin. Each tier carries a distinct silhouette AND a distinct treatment (filled mass / framed-square-with-notch / segmented ring / wave field), so identity never rests on hue. The marks are clean `currentColor` SVG on the 256 grid feeding the same texture seam the adopted marks use. The gate is a real, reusable test — not a TODO — and the rasterizer it runs on is the honest reproduction of what the eye sees at the legibility floor.

## Notes

The gate's first implementation sampled Pixi's `GraphicsContext.containsPoint`, which tests geometric fill containment and collapses a hollow ring into a solid disc — it reported `state:active` (a solid disc) and `state:complete` (a ring + check) as identical silhouettes, a false pass. Replaced it with a purpose-built pure rasterizer that honors winding-rule holes and stroke widths, which correctly separates them. This is the load-bearing correctness decision of the gate: a grayscale-shape gate must reproduce ink coverage, not fill geometry. No scaffolds left in code; the rasterizer and gate are production modules under `scene/field/`.
