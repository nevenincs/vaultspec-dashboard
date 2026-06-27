---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S19'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Finalize the component registry repointed to the live Figma file mapping code components to the Kit primitives at frame 135:2

## Scope

- `frontend/figma/component-map.json`

## Description

- Verify the component registry `figma/component-map.json` is repointed to the live design file `SlhonORmySdoSMTQgDWw3w` (the retired seed file `8WDmXNOURdRQwdefWNGsBb` appears nowhere).
- Confirm 13 design-surface components carry live-file `figmaNodeId`/`figmaUrl` bindings to the Kit primitives under frame `135:2`: `WorkTab`, `TreeBrowser`, `Timeline`, `TextControl`, `SwitchControl`, `RailTabs`, `NumberControl`, `LeftRail`, `HoverCard`, `FacetChipGroup`, `EnumControl`, `ContextMenuHost`, `CodeTree`.
- Validate the registry against `figma/registry.schema.json` and the source-drift gate by running `npm run figma:registry`.

## Outcome

The registry is finalized and validated: `figma:registry` reports OK with 58 components mapped (51 design surfaces, 7 non-visual exports) and 13/51 design surfaces bound to live-file Figma nodes. Every binding resolves against the live file; no node id references the retired seed file. The registry is the node-to-code record of record consumed by the Code Connect parse in S22.

## Notes

This phase finalizes and records a prior repoint rather than authoring it fresh; the registry already carried the live-file bindings and validated clean on inspection, so no mutation to `component-map.json` was required.
