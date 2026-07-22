---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S102'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Prove lifecycle queries mount only with the agent-service dialog and localization changes preserve panel identity

## Scope

- `frontend/src/app/panels/ControlPanels.guard.test.tsx`

## Description

- Extended the ControlPanels guard: proved the lifecycle panel and its machine-global status read mount ONLY when the agent-service dialog is open (query-cache + DOM assertions), and that a closed panel performs no lifecycle read.
- Added the agent-service dialog to the in-place localization identity `it.each` (dialog + heading identity stable across a language change).

## Outcome

Mount-gating and identity preservation proven against the production `ControlPanels` host and the real localization runtime. Added the agent-service label to the LTR/RTL test locales for the identity swap.

## Notes

None.
