---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
body_hash: 'sha256:54ffde0bec89deba729d2196936392592872e9a5785d4f668ffcc3ca6159d20d'
step_id: 'S34'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Make the left browser panel subscribe to canonical selection, filter, and scope state

## Scope

- `frontend/src/app/left/TreeBrowser.tsx`

## Description

- Route vault and code browser row selection through dashboard-state mutations.
- Remove legacy browser row handlers that wrote `viewStore` selection.
- Remove left-browser highlight fallback to legacy `viewStore.selectedId`.
- Route the left rail filter input through canonical dashboard filter text.

## Outcome

Closed S34. The mounted left browser now reads active scope through the shared active-scope hook, subscribes to dashboard selection for row highlight, and writes text filter changes to dashboard-state instead of browser-local state.

## Notes

Viewer open targets remain local view state because they are not part of the backend dashboard-state schema.
