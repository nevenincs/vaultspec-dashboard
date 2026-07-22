---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S98'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Register the agent-service panel as a single modal identity while leaving the existing footer-chip set unchanged

## Scope

- `frontend/src/stores/view/controlPanels.ts`

## Description

- Registered `agent-service` as the fourth `ControlPanelId` in `CONTROL_PANEL_IDS` (cluster order), a MODAL identity only.
- Left the footer-chip set (`FOOTER_CHIP_IDS`) unchanged — the agent-service panel is deliberately not a footer chip.

## Outcome

`normalizeControlPanelId` and every registry consumer auto-cover the new id. Gate green.

## Notes

None.
