---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# render edges with the fixed tier treatments, solid, status-coloured, dotted, haze, and grayscale-safe confidence encoding per G3.c and G7.d

## Scope

- `frontend/src/scene/field/edgeMeshes.ts`

## Description

- Add `frontend/src/scene/field/edgeMeshes.ts`: `EdgeMeshLayer` batching
  edges into per-treatment meshes with the spike-proven geometry strategy
  (static topology per edge-set change, in-place position buffer re-upload
  per frame).
- Implement the four fixed treatments per G3.c: declared = solid ink;
  structural = solid, status-coloured (resolved/stale/broken); temporal =
  dotted via a fixed dash count per edge (buffers never resize per frame);
  semantic = light haze drawn as triangle-list quads with width by score
  (GL lines have no width).
- Encode confidence as LIGHTNESS - quantized buckets mixed toward the paper
  ground - never transparency-only, per the Guo et al. channel-interference
  findings the ADR cites; treatment is the primary channel so the encoding
  reads in grayscale (G7.d).
- Resolve audit finding spike-tier-wrap-003: unknown tiers raise
  `UnknownTierError`, collected and returned from `setEdges` as rejected
  edges for the caller to surface - never silently re-bucketed. Guard test
  included.
- Add `frontend/src/scene/field/edgeMeshes.test.ts` covering group keying,
  the unknown-tier guard, confidence bucketing/lightness, and all three
  geometry writers.

## Outcome

The product-wide tier encoding renders in the field with grayscale-safe
confidence and a truthful failure mode for malformed data. Gates green:
typecheck, eslint, vitest (54 passed), prettier.

## Notes

The haze is currently an untextured light quad; the textured grain the ADR
sketches arrives with the visual-language pass (S47/G7.a) - lightness
already carries the confidence channel, so the gap is aesthetic, not
semantic. Relation verb labels at high zoom belong to the camera work and
unfold-on-selection (S12, W03 inspector).
