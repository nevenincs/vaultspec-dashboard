---
tags:
  - '#exec'
  - '#dashboard-pipeline-status'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S39'
related:
  - "[[2026-06-14-dashboard-pipeline-status-plan]]"
---




# Add roving-tabindex keyboard navigation across rows and an accessible expand/collapse control (aria-expanded, aria-controls) for the plan row's step tree, deriving the focus order from the DOM at event time per the in-repo roving pattern

## Scope

- `frontend/src/app/right/WorkTab.tsx`

## Description

- Added roving-tabindex keyboard navigation across the top-level rows and an accessible expand/collapse control (aria-expanded, aria-controls) for the plan row step tree, deriving the focus order from the DOM at event time per the in-repo roving pattern.

## Outcome

Rows are keyboard-navigable and the disclosure is an accessible control bound to its tree.

## Notes

None.
