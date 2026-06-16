---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S19'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S19 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Finalize the component registry repointed to the live Figma file mapping code components to the Kit primitives at frame 135:2 and ## Scope

- `frontend/figma/component-map.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
