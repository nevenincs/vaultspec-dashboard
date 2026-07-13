---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

# add sprite-layer tests for the class-to-treatment mapping and token reads

## Scope

- `frontend/src/scene/field/nodeSprites.test.ts`

## Description

- Add sprite-layer unit tests for the class-to-treatment selection: `coarseStamp` (the far-LOD ring/slash/ghost) and `fineStampMarkId` (the near-LOD severity-dot / tier-notch mark id), covering every class including the compound superseded case and the rule-of-one mutual exclusion.
- Extend the cross-layer token-read test with a `stampColor` assertion that each new `--color-status-*` token resolves to its literal hex through the scene `getComputedStyle` seam, mirroring the existing state-token literal-hex contract.
- Add `nodeStatusFromWire` derivation tests covering tier/severity ordinal derivation, out-of-vocabulary class dropping, the both-absent undefined case, and the round-trip through `stampFor`.

## Outcome

The class-to-treatment mapping and the token reads are pinned GPU-free, exactly the field discipline used for `nodeRadius`/`stateColor`. All status-related test files pass, including the ink-coverage gate.

## Notes

The render-side selection is exercised through the pure `coarseStamp`/`fineStampMarkId` helpers (what the Pixi layer maps), so no GPU is needed to assert the mapping. Expected values were derived from the spec status table, never copied from output.
