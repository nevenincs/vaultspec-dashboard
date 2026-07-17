---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S08'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Build the four modal control panels over the Dialog primitive gated on the open-state store - re-mount RagOpsConsoleBody and ReviewStationSection bodies, mount the host once in the shell

## Scope

- `frontend/src/app/panels/ControlPanels.tsx`

## Description

## Outcome

## Notes

## Description

- Build the `ControlPanels` host: four Dialogs gated on `useOpenControlPanel()`; a closed panel mounts no body (mount-gating law).
- Re-mount `RagOpsConsoleBody` and `ReviewStationSection` unchanged; mount the host beside `SettingsDialog` in both shell branches.

## Outcome

Green. Executed by rail-chrome-coder; verified independently.

## Notes

`rag-ops:details` section id KEPT - the re-mounted console body still drives its Details fold through it.
