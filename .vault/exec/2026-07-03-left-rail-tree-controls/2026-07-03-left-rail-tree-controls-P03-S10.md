---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S10'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace left-rail-tree-controls with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S10 and 2026-07-03-left-rail-tree-controls-plan placeholders are machine-filled by
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
     The Rail-top sort control beside the filter field (Vault mode only) and `vault-section` menu enrollment of sort, reset-sorting, reset-filters, clear-filter, toggle-facets verbs and ## Scope

- `frontend/src/app/left` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rail-top sort control beside the filter field (Vault mode only) and `vault-section` menu enrollment of sort, reset-sorting, reset-filters, clear-filter, toggle-facets verbs

## Scope

- `frontend/src/app/left`

## Description

- Rail-top `VaultTreeOptionsButton` in `BrowserRegion.tsx` (Vault mode only) opening the SAME vault-section menu — zero new entity kind
- `vaultSectionMenu` enrolls sort options, reset-sorting, toggle-facets, reset-filters, clear-filter (new imperative `clearDashboardFilters` seam in `dashboardState.ts`, `setDashboardFeatureFilter(scope, "")` for clear) + expand/collapse + new document

## Outcome

Live-verified: Sort by Name reorders the tree; Reset Sorting restores the default; code tree offers no sort control.

## Notes

None.
