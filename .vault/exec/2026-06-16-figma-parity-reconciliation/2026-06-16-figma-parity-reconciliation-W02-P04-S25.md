---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S25'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the vault browser from its binding frame over the preserved vault-tree query and selection store

## Scope

- `frontend/src/app/left/VaultBrowser.tsx`

## Description

- Migrate the vault browser onto the W01.P01 Figma foundation: every deprecated dense-metadata type utility re-keys to the canonical caption role utility (the degraded banner, group counts, feature tag, freshness label) and every deprecated radius alias re-keys to the canonical xs radius utility (the retry control, degraded banner, group headers, document rows).
- Keep the browser a dumb projection over the preserved vault-tree query and selection store: it reads the listing through the vault-tree query hook for the active scope, reads degradation only through the vault-tree availability selector (never the raw tiers block), groups the already-fetched entries client-side by .vault subtree, joins selection on the stable doc node id, and emits select intent through the shared click handler.
- Preserve the four honest states (loading, error distinguished from degradation, degraded banner, empty and filtered-to-nothing), the roving-tabindex single-Tab-stop nav model, the grayscale-safe accent-bar selection cue, and the plan-status pip on plan rows; the true-circle accent bar and pip slots keep the full-round utility (they are dots/stadia, not pill containers).

## Outcome

The vault browser renders on the canonical Figma foundation utilities (caption type, xs radius) while staying a pure projection over the preserved vault-tree query and selection store. Degradation is read from the availability selector, not the raw tiers block; the in-rail filter narrows the already-fetched listing client-side with no wire request. No fetch, no model minted, no stores shape change. eslint, prettier, and tsc are all clean for this step's file, and the vault-browser test suite (21 tests across the render and unit files) stays green.

## Notes

Figma read tools were unavailable; the rebuild was grounded in the existing browser (restyled to its binding frame this cycle per research F3), the binding frame's shared row presentation, and the frozen contract reference. Gate caveat unchanged from the prior step: the aggregate frontend lint gate exits non-zero only because of the concurrent W03 scene agent's in-flight, untracked scorecard files under the scene layer (missing-module and unused-symbol errors), which are outside this phase's scope fence and were not touched. Scoping tsc, prettier, and eslint to this step's file confirms it is fully clean.
