---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S29'
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
     The S29 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the inspector tab from its binding frame over the preserved selection and enriched node-evidence query and ## Scope

- `frontend/src/app/right/Inspector.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the inspector tab from its binding frame over the preserved selection and enriched node-evidence query

## Scope

- `frontend/src/app/right/Inspector.tsx`

## Description

- Rebuild the inspector pane onto the new Figma role-named token foundation,
  binding to the RightRail inspector treatment.
- Confirm the inspector consumes the ENRICHED node-evidence projection unchanged:
  documents with path and doc_type, code locations keyed on path with state, and
  commits with subject and the correlating rule.
- Migrate the focus-ring containers and the per-tier edge-count badge from the
  legacy radius and dense type scales to the canonical `rounded-fg-xs` and the
  `caption` type role.

## Outcome

The inspector is a dumb projection over the preserved selection view store and the
preserved `useNodeDetail` / `useNodeEvidence` / `useNodeNeighbors` hooks; it
fetches nothing, reads no raw tiers block, mints no model, and routes only
selection intent back through the view store. The enriched-evidence fields (the
W01.P02.S13 GUI shape) render directly with no shape change. The preserved
node-unavailable and per-tier unfolding-edge states are kept verbatim.

## Notes

No store shape or query-key change; the evidence query and its enriched fields are
consumed as-is. The aggregate frontend gate is red on unrelated uncommitted
scene-layer WIP from a concurrent builder; the scoped file here passes eslint,
prettier, and tsc cleanly.
