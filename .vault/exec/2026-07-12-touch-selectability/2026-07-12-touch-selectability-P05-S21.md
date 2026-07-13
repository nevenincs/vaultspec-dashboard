---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S21'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---

# Author the row-selectability sweep assertion over menu-bearing surfaces and the island predicate suite alongside the guard matrix

## Scope

- `frontend/src/app/menus/guardedContextMenu.test.ts`

## Description

- Extend the guard suite with the D4 law sweep: a file-walk fence failing on any surface pairing `onContextMenu` with `openContextMenu` without the shared guard, a select-text presence fence over every audited data surface (including the stores-side derived row-class sources), and a D3 fence requiring the coarse-pointer disclosure wherever the resolver menu opens (reasoned exemptions inline)
- Add the island target-predicate suite with real DOM fixtures

## Outcome

Fifteen tests engrave the three laws; a new hijack, a stripped select-text, or a menu-online surface without a touch entry now fails loudly in the suite.

## Notes
