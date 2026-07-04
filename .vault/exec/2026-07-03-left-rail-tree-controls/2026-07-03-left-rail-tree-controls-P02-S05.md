---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S05'
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
     The S05 and 2026-07-03-left-rail-tree-controls-plan placeholders are machine-filled by
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
     The Render leaf review signals: plan-status pip + done/total, ADR acceptance status token, authored `created` date as default date meta, size meta, full path+dates+size tooltip and ## Scope

- `frontend/src/app/left/TreeBrowser.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Render leaf review signals: plan-status pip + done/total, ADR acceptance status token, authored `created` date as default date meta, size meta, full path+dates+size tooltip

## Scope

- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- `TreeBrowser.tsx` row shell gains `signal` + `tooltip` slots (tooltip first line stays the path — the selection-join contract)
- Plan leaves: status pip + tabular done/total; ADR leaves: compact status mark with plain-language aria-label
- Leaf meta = the sorted field's ONE value (authored `created` date default; modified under a modified sort; word count under a Length sort); plan rows yield the date to their progress signal under default sorts
- Tooltip = path + Authored/Updated/Edited + words/bytes + status/tier/progress

## Outcome

Live-verified on the real corpus: 1472 leaves with weight, 88 plan pips, 117 ADR marks; title-first density regression found via screenshot and fixed (labels 55-77px).

## Notes

None.
