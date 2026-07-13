---
tags:
  - '#exec'
  - '#left-rail-tree-controls'
date: '2026-07-04'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-03-left-rail-tree-controls-plan]]"
---

# Add status/tier/size presentation helpers (plain-language status + tier labels, compact word-count label), delete the stale plan-progress honesty note

## Scope

- `frontend/src/app/left/vaultRowPresentation.ts`

## Description

- Add `adrStatusLabel` / `adrStatusToneClass` / `adrStatusMark` (shape+tone marks: tick/ring/cross/minus), `planTierLabel`, `wordCountLabel`, `byteSizeLabel`, `docTooltip` to `vaultRowPresentation.ts`
- Replace the stale plan-progress honesty note: progress IS served (dashboard-pipeline-wire W01)

## Outcome

Presentation helpers pure + unit-covered via the render suites.

## Notes

None.
