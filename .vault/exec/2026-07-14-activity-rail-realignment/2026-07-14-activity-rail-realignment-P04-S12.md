---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S12'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Join the cluster to the compact unified rail footer and verify the panels open compact-safe

## Scope

- `frontend/src/app/shell/CompactUnifiedRail.tsx`

## Description

## Outcome

## Notes

## Description

- Restructure the compact unified rail: inner scroll region for the Status/Browse folds, `FrameworkStatusCluster` + filter sheet pinned as shrink-0 footer siblings - the same component as desktop, no fork.
- Apply the 2.75rem coarse-pointer touch floor to the shared chip via the existing `usePointerCoarse` convention; verify ControlPanels already mounts in the compact shell branch.
- New online composition guard for the compact rail.

## Outcome

Green. Executed by rail-parity-coder; verified independently (112 tests across the touched dirs).

## Notes

Sticky fold headers now pin to the inner scroll region above the footer; single scrollbar on Home.
