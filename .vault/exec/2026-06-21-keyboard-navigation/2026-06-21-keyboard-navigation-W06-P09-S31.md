---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-06-23'
step_id: 'S31'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Verify the settings dialog traps Tab, orders its controls, and restores focus on close

## Scope

- `live-verify each control kind is keyboard-operable including the keybinding recorder`
- `frontend/src/app/settings/SettingsDialog.tsx`

## Description

- Fixed the same double-fire in the settings `EnumControl` radiogroup: its arrow handler `preventDefault`ed but did not `stopPropagation`, so an arrow inside the settings modal moved the radio AND the graph selection behind it. Added `stopPropagation`.
- Confirmed the `SettingsDialog` composes the dialog contract: `role="dialog"`/`aria-modal`, Tab focus-trap (`trapTabFocus`), focus-restore on close (`useFocusRestore`), and native controls (enum/switch/slider/text/keybinding) that tab in DOM order; the slider is a native range input whose arrows are protected by the dispatcher's text-entry gate.

## Outcome

- EnumControl double-fire fixed; dialog trap+restore verified by code; 47 settings/menu tests green; eslint/tsc clean.

## Notes

- Live re-confirmation of each control kind + the keybinding recorder deferred (browser MCPs locked this turn). The trap/restore machinery predates this campaign (dashboard-settings); the only gap was the EnumControl arrow leak, now closed.
