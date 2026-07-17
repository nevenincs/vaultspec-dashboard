---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S06'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Enroll one ActionDescriptor per panel toggle across the palette and keymap planes and extend the action-coverage guard

## Scope

- `frontend/src/stores/view/chromeActions.ts`

## Description

## Outcome

## Notes

## Description

- Add CONTROL_PANEL_ACTION_IDS + toggle-action builders to the chrome actions plane; register the new `controlPanelsCommandProvider` in the real registration path.
- Extend the action-coverage and command-palette guards with the four panel ids.

## Outcome

Four descriptors (`panel:search-service`, `panel:approvals`, `panel:backend-health`, `panel:vault-health`) resolve in the palette under shared ids; guards green. Executed by rail-stores-coder; verified independently.

## Notes

PALETTE-ONLY by convention: the Settings analogue has no keymap chord and the registry rejects chord-less defs, so no keymap entries were added.
