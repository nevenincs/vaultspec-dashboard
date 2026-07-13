---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

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
