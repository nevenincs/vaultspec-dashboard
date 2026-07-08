---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S13'
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
     The S13 and 2026-07-03-left-rail-tree-controls-plan placeholders are machine-filled by
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
     The Add `docs` and `weight` sort keys: option registry, projection comparators, feature `weightBytes` aggregate + `totalCorpusBytes` denominator and ## Scope

- `frontend/src/stores` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add `docs` and `weight` sort keys: option registry, projection comparators, feature `weightBytes` aggregate + `totalCorpusBytes` denominator

## Scope

- `frontend/src/stores`

## Description

- Add `docs` and `weight` to `RailSortKey` + `RAIL_SORT_OPTIONS` ("Document Count", "Corpus Weight") in `railSort.ts`
- `queries.ts`: `weight` compares served bytes (documents) / summed `weightBytes` (features, absent-last); `docs` is the explicit count order for feature folders while document lists keep recency
- `VaultTreeFeatureGroup.weightBytes` aggregate + `VaultRailView.totalCorpusBytes` denominator (unfiltered listing, so a narrow never inflates shares)
- Palette/menu enrollment is automatic (options derive the shared descriptors); guard expectation arrays updated
- Unit tests: weight order with unweighed-last + denominator, docs count order

## Outcome

Suites green (75 across sort/menus/palette/guards).

## Notes

None.
