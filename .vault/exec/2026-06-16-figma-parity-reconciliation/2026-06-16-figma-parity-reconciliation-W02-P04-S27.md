---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S27'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rebuild the tree browser from the binding TreeBrowser Kit primitive over the preserved tree query with plan-progress pips

## Scope

- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Migrate the tree browser onto the W01.P01 Figma foundation: every deprecated dense-metadata type utility re-keys to the canonical caption role utility (the degraded banner, the feature and doc-type counts, the document-row freshness label) and every deprecated radius alias re-keys to the canonical xs radius utility (the retry control, degraded banner, the feature header, the doc-type header, and the document rows).
- Keep the browser a pure client-side re-projection of the very same vault-tree response the vault browser reads, re-nested feature then doc-type then document: it reuses the existing vault-tree query hook for the active scope, reads degradation only through the vault-tree availability selector (never the raw tiers block), joins selection on the same stable doc node id, and emits select intent through the shared click handler.
- Preserve the plan-progress pips on plan document rows (the grayscale-safe complete/in-progress/not-started mark derived from the engine-projected checkbox progress carried on the vault-tree entry), the three-level collapsible nesting with its keyboard contract, the roving-tabindex single-Tab-stop nav, the four honest states, and the grayscale-safe accent-bar selection cue; the true-circle accent bar and pip slots keep the full-round utility.

## Outcome

The tree browser renders on the canonical Figma foundation utilities (caption type, xs radius) while staying a pure projection over the preserved vault-tree query and selection store, with the plan-progress pips intact on plan rows. There is no engine work and no new model: it re-nests the same vault-tree entries the vault browser reads, reads degradation from the availability selector, and narrows the listing client-side via the in-rail filter with no wire request. No fetch, no model minted, no stores shape change. eslint, prettier, and tsc are all clean for this step's file, and the tree-browser test suite (18 tests across the render and unit files) stays green.

## Notes

Figma read tools were unavailable; the rebuild was grounded in the existing browser (restyled to the binding TreeBrowser Kit primitive and LeftRail_tree frame this cycle per research F3), the Code Connect mapping (node 161:164), and the frozen contract reference. Gate caveat unchanged: the aggregate frontend lint gate exits non-zero only because of the concurrent W03 scene agent's in-flight, untracked scorecard files under the scene layer, which are outside this phase's scope fence and were not touched. The plan-status pip honesty note from the shared row presentation is preserved: absent progress reads the honest not-started baseline rather than guessing a mark from data the vault-tree entry does not carry.
