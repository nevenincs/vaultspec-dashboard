---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S44'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rewrite the circle salience sizing to the engine-served degree-of-interest salience

## Scope

- `frontend/src/scene/field/salienceEncoding.test.ts`

## Description

- Rewrote `salienceEncoding.test.ts` cleanly to pin the circle salience sizing as the engine-served degree-of-interest encoding: salience in [0,1] is the size driver, monotonic for every species, capped at the documented band, and superseding member-count.
- Framed the salience source as the engine CPU degree-of-interest projection (personalized PageRank, betweenness, k-core, recency, lifecycle), keeping the size encoding render-side over an engine-served scalar (graph-compute-is-cpu).
- Added one spec-derived clamp assertion: an out-of-band salience is clamped to [0,1] so the circle never exceeds the cap nor shrinks below base — derived from the documented [0,1] band, not from any test-run output.
- Retained and clarified the salience -> label-priority (DOI cull) and the derivation -> lineage classification assertions that exercise the encoding map.
- Kept the sizing source (`nodeRadius`, `labelPriority`, `ambientLabelFloor` in `nodeSprites.ts`) as the unit under test; that source was rewritten under S42 and already encodes the engine-served salience faithfully.

## Outcome

The salience sizing is faithfully pinned to the engine-served degree-of-interest scalar. Scoped gate green: eslint exit 0, prettier --check clean, project tsc -b exit 0 (verified across the phase), and the salience-encoding test passes (10/10, up from 9 with the added clamp case).

## Notes

The added clamp test value is derived strictly from the documented [0,1] salience band (the `nodeRadius` clamp), never copied from a broken run's output. Figma MCP read remained unreachable in this executor session; proceeded on the ADR fallback. Scope isolated; the aggregate frontend gate was not used as the green signal due to the concurrent scene agent's live WIP.
