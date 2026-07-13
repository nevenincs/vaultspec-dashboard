---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# create the placeholder programmatic glyph set for doc types, tiers, and states as sprite and SDF textures pending the commissioned family per G7.c

## Scope

- `frontend/src/scene/field/glyphs.ts`

## Description

- Add `frontend/src/scene/field/glyphs.ts`: one distinct placeholder
  polygon silhouette per doc-type/node kind (feature star, research circle,
  adr diamond, plan tabbed sheet, exec triangle, audit shield, reference
  spine, index chevron, code hex), with a default silhouette for unknown
  kinds - a node never renders blank.
- Export the tier mark vocabulary (the four marks the badges already use)
  and the state mark vocabulary as designed constants.
- Implement `polygonSdf`: a pure CPU signed-distance-field rasterizer
  (contour at 128, inside bright, outside dark) so glyphs exist in both
  GPU-renderable forms the ADR names - sprite and SDF.
- Implement `ProgrammaticGlyphs`, the `GlyphTextureProvider` the sprite
  layer consumes: supersampled white silhouette textures generated from the
  polygons and cached per kind; tinting stays the sprite layer's job
  (colour is reserved for state).
- Add `frontend/src/scene/field/glyphs.test.ts` covering silhouette
  distinctness, unknown-kind fallback, unit-box bounds, mark vocabulary
  coverage, point-in-polygon, and SDF sign/contour correctness.

## Outcome

The field has a complete interim glyph vocabulary behind the same provider
seam the commissioned family will fill - the swap is a texture swap, not a
rendering change. Gates green: typecheck, eslint, vitest (86 passed),
prettier.

## Notes

G7.c commissioning was human-approved (recorded in the foundation ADR);
these placeholders explicitly hold until the designed family arrives in SVG
+ SDF/sprite forms. The SDF path is computed but not yet consumed by a
shader; it exists so the commissioned family's SDF delivery slot is proven.
