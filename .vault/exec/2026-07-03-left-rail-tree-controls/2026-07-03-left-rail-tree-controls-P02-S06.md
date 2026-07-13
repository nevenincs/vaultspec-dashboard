---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Extend render tests: status token, progress pip, created-date meta, size meta, honest absence on undated/sizeless entries

## Scope

- `frontend/src/app/left/VaultBrowser.render.test.tsx`

## Description

- Extend `VaultBrowser.render.test.tsx` with the review-signals test over the live fixture vault (pip 1/2, `decision accepted` mark, authored-date meta, tooltip card)
- Stamp the beta fixture ADR H1 with `(**status:** \`accepted\`)` so the live path exercises status
- Adapt the reveal test to the tooltip's first-line path contract

## Outcome

Left-rail suites 100/100 green against the live engine.

## Notes

None.
