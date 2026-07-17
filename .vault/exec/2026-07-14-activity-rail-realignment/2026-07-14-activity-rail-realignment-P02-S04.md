---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S04'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Create the control-panel open-state view store - four non-persisted open flags plus open, close, toggle intents on the settingsDialog idiom, with unit tests

## Scope

- `frontend/src/stores/view/controlPanels.ts`

## Description

## Outcome

## Notes

## Description

- Create the control-panel open-state view store on the settingsDialog idiom: modal single-open (`open: ControlPanelId | null`), non-persisted, with open/close/toggle intents and a boundary normalizer.
- Unit-test transitions and normalization.

## Outcome

Store + tests green; selectors return primitives only (store-selector law). Executed by the named Opus coder rail-stores-coder; verified independently by the orchestrator.

## Notes

Opening one panel closes another by design (panels are modal).
