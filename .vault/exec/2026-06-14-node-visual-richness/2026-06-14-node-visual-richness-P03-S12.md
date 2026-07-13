---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S12'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# render the status-stamp channel mapping class to one treatment under LOD discipline

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

- Render the single status treatment per node (the rule of one) by mapping the stamp descriptor to one shape: a coarse outline ring (solid/dashed) and slash drawn as a `Graphics` just outside the silhouette, a ghost reading that drops the sprite fill to the archived token and dims to a ghost floor, and the fine severity-dot / tier-notch drawn through the glyph provider as a positioned tinted sprite (severity at 4-5 o'clock, tier at 7-8 o'clock).
- Split the treatment by LOD: the coarse ring/slash/ghost shows at all LOD beside the sprite, while the exact severity level and tier step unfold only in the near-LOD anatomy, mirroring the existing far/near split.
- Read the reinforcing tint through the existing `getCssColor` token seam, keep the progress ring intact so tiered and progress coexist, and make `textureForMark` an optional seam method so a provider lacking it skips only the fine stamp.

## Outcome

A node now carries exactly one status stamp: type stays on the silhouette, salience on size, status on the stamp. The coarse mark survives the far field; the magnitude unfolds on zoom/focus. Ghost dim, slash, and ring all track the recede and visibility passes so the stamp never desyncs from its sprite.

## Notes

`textureForMark` was promoted to an optional method on the glyph-provider interface (the placeholder fallback omits it); the fine dot/notch then no-ops on a provider without it while the coarse ring/slash/ghost still renders. The ghost dim is applied in the refresh and visibility alpha math, consistent with how recede is applied (not in the initial sync set).
