---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S14'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Display the corpus-weight percent on feature rows under the weight sort, byte-size leaf meta, and verify compact-viewport parity live at phone width

## Scope

- `frontend/src/app/left`

## Description

- Feature rows show `corpusWeightLabel` percent in place of the member count while the weight sort is active; leaves show byte size under it
- Live parity verification at 390px phone viewport: compact shell mounts the same browser region — sort trigger, full dropdown (7 options + reset), and shares render identically; desktop re-verified at 1280px
- Reset Sorting restored the persisted default after verification

## Outcome

Mobile/desktop parity confirmed live; screenshots reviewed (features ranked 7.9% / 5.0% / 4.1% ...).

## Notes

None.
