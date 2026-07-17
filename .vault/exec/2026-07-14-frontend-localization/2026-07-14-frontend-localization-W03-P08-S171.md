---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S171'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize left-rail loading, degraded, empty, and partial state blocks

## Scope

- `frontend/src/app/left/railStates.tsx`

## Description

- `RailMessage`/`RailDegradedNotice` already required localized `label` props.
- `RailSkeleton` carried a raw English default parameter `label = "Loading…"`,
  scanner-blind for the same reason as `Spinner.tsx`/`RowMenuDisclosure.tsx`
  (`W03.P07.S162`/`S165`).
- The coding lane (opus-l10n) made `RailSkeleton`'s `label` a required prop; both live
  callers (`CodeTree.tsx`, `TreeBrowser.tsx`) already pass a localized label.
- Independently confirmed via `git diff` and `npx tsc --noEmit` (clean).

## Outcome

All three left-rail state blocks carry no unlocalized copy.

## Notes

Same scanner-blind defect class (raw English default-parameter initializer) recurring
in a rail-level wrapper, not just leaf kit components — confirms the pattern needs a
tree-wide grep (`(label|title|name)\s*=\s*"`), not a spot check. Fixed by opus-l10n,
independently reverified — not a fresh implementation on my part.
