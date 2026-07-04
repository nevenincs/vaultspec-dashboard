---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S08'
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
     The S08 and 2026-07-03-left-rail-tree-controls-plan placeholders are machine-filled by
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
     The Thread the sort into `deriveVaultRailView`: document order inside category folders and feature-folder order derive from the one sort value and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Thread the sort into `deriveVaultRailView`: document order inside category folders and feature-folder order derive from the one sort value

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- `compareVaultEntriesBySort` in `queries.ts`: recency = historical comparator; name/created/modified/size fields with absent-last, path tiebreak
- `projectVaultDocTypeGroups` / `projectVaultTreeFeatureGroups` / `deriveVaultRailView` accept the sort; feature folders order by name / newest member date / summed words
- Default order preserved byte-for-byte (unit-asserted)

## Outcome

New sort-plane unit tests green; default-order regression test green.

## Notes

None.
