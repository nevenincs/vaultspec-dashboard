---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S105'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Extend action coverage to require the agent-service lifecycle panel action on every eligible surface

## Scope

- `frontend/src/stores/view/actionCoverage.guard.test.ts`

## Description

- Extended the action-coverage guard to require the agent-service lifecycle panel action on the palette plane explicitly, alongside the existing loop over every control-panel action id.

## Outcome

A regression that drops the agent-service palette enrollment now fails the guard. Green.

## Notes

The guard's existing loop over `CONTROL_PANEL_ACTION_IDS` already required the new id structurally; the explicit assertion makes the requirement legible.
