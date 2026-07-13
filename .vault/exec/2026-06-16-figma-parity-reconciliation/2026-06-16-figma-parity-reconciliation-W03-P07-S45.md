---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S45'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rewrite the flat-grey edge mesh render faithful to the binding Hero frame connection treatment

## Scope

- `frontend/src/scene/field/edgeMeshes.ts`

## Description

- Rewrote the edge-mesh treatment to read faithfully as the binding graph/Hero thin flat-grey node-connection field: every group draws the single uniform `--color-scene-rule` grey (literal hex per theme via the getComputedStyle seam) at a low, near-uniform opacity sitting behind the nodes, so the canvas reads as clean category circles on a faint connective mesh, not a coloured web.
- Brought the per-treatment alpha closer to uniform (crisp line tiers 0.42, soft semantic-haze quad 0.32) so the wide soft haze body never blooms brighter than the hairline rule lines and the whole field reads as one connection mesh.
- Reframed the file header for the S45 binding-Hero rewrite: the flat-grey treatment is the on-canvas truth; the tier DATA and the per-treatment GEOMETRY (dashes / haze quads / meta ribbon / routed lineage chains) are preserved for off-canvas consumers, only the resolved tint flattens to the single grey.
- Preserved the full exported API and the proven static-topology / per-frame position-reupload buffer machinery (`groupColor`, `edgeGroupKey`, the geometry writers, `EdgeMeshLayer` and all its methods, `SCENE_RULE_FALLBACK`, the confidence/lightness helpers, the routed-lineage path, the incremental `updateEdge` fast path) so every consumer and the tightly-pinned test contract bind unchanged.

## Outcome

The edge mesh renders the binding Hero flat-grey connection field faithfully on the frozen contract. Scoped gate green: eslint exit 0, prettier --check clean, project tsc -b exit 0, and the edgeMeshes, token-read, salience-encoding, and field-assembly tests pass (50/50). Render-only; no graph compute moved, no LOD/ceiling change, the seam union unchanged.

## Notes

The edgeMeshes buffer machinery is load-bearing and its behaviour is tightly pinned by edgeMeshes.test.ts (flat-grey flatten, geometry partition, routed lineage, incremental fast path). The faithful improvement was therefore a clean retreatment (uniform flat-grey field, near-uniform alpha, reframed intent) over the proven machinery and the full export contract, not a destabilising wholesale rewrite of the buffer code under that contract. The tier-geometry partition is retained deliberately (data + off-canvas geometry preserved); flattening it would break both the pinned contract and the documented retire-tint-keep-data intent.

Figma MCP read remained unreachable in this executor session; proceeded on the ADR fallback. Scope isolated; the aggregate frontend gate was not used as the green signal due to the concurrent scene agent's live WIP.
