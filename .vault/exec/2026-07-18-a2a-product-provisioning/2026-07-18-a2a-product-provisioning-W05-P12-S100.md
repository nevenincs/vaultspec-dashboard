---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S100'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Register one unified agent-service action id and icon for panel, palette, and keymap composition

## Scope

- `frontend/src/stores/view/chromeActions.ts`

## Description

- Registered one unified agent-service action id (`panel:agent-service`) in `CONTROL_PANEL_ACTION_IDS` and a Lucide `Bot` icon in the icon map.

## Outcome

The single descriptor composes across the palette, the keymap accelerator, and the footer plane under one shared id. TypeScript `Record<ControlPanelId, ...>` exhaustiveness forced both entries. Gate green.

## Notes

None.
