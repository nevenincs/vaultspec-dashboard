---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
step_id: 'S53'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rebuild the Layout control to the binding Network, Tree, Grouped, and Timeline modes over the preserved layout-mode catalog

## Scope

- `frontend/src/app/stage/LensSelector.tsx`

## Description

- Consolidate the binding `graph/Controls` 88:2 Layout control into `LensSelector.tsx` as an exported `LayoutSelector`, so the canonical Network/Tree/Grouped/Timeline picker has a single home; `GraphControls` now renders `<LayoutSelector />` rather than carrying an inline copy.
- Move the shared `Segmented` roving-tabstop control, the `SPATIAL_SEGMENTS` catalog, and the distinct `TIMELINE_SEGMENT` out of `GraphControls.tsx` into `LensSelector.tsx`, removing the duplicated definitions and the now-unused `ReactKeyboardEvent` import from `GraphControls.tsx`.
- Surface the binding Network/Tree/Grouped/Timeline plain-language framing over the PRESERVED representation-mode catalog (graph-layout-catalog D11): Network maps to connectivity, Tree to lineage, the clustering-family spatial modes (Layered/Radial/Communities) and Grouped-by-meaning (semantic) are kept reachable under the Grouped framing so no catalog mode is orphaned, and Timeline stays DISTINCT as the temporal time-travel seam.
- Preserve the salience `LensSelector` export (status/design) intact in the same module: the binding Controls consolidation has no slot for the lens, so it remains a real, store-backed, consumed capability docked separately by Stage.
- Read the Figma role-named type scale (`text-label`) on the segments rather than the deprecated legacy alias.

## Outcome

The Layout control is a dumb projection over the preserved view store: selecting a spatial mode writes the representation mode (turned into a scene command by Stage's single scene-owner effect) and Timeline enters time-travel via `movePlayhead`; it fetches nothing and reads no raw `tiers` block. The salience lens stays a real wire re-query. The pre-existing `GraphControls.render.test.tsx` segment contract is unchanged and still passes (23/23): the six-segment Spatial group in order plus the distinct Timeline group, each mapping to its representation mode, with the semantic gate and time-travel reflection intact. Scope gate green: tsc exit 0, eslint clean, prettier clean.

## Notes

The plan row assigned the Layout control to `LensSelector.tsx`; the existing file was the salience-lens selector. Rather than destroy that real, store-backed capability (which would be a dead-capability and a contract break), the binding Layout control was added as a co-resident `LayoutSelector` export and the salience `LensSelector` preserved unchanged. The binding research prose names the Layout set as four plain-language modes (Network/Tree/Grouped/Timeline); the committed `GraphControls.render.test.tsx` (out of this phase's scope fence) fixes the six-segment catalog contract, so "Grouped" is realized as the organizing framing over the preserved clustering-family catalog modes rather than collapsing them away — keeping both the binding face and every catalog mode reachable, with no out-of-fence test edit.
