---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S36'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize activity-panel and shell-layout vocabulary

## Scope

- `frontend/src/stores/view/shellLayout.ts`
- `frontend/src/stores/view/shellLayout.test.ts`
- `frontend/src/stores/view/rightRailKeybindings.ts`
- `frontend/src/stores/view/commandPaletteCommands.ts`
- `frontend/src/app/stage/DockWorkspace.tsx`
- `frontend/src/app/stage/DockWorkspace.localization.render.test.tsx`
- `frontend/src/app/chrome/ShellResizeHandle.tsx`
- `frontend/src/app/chrome/ShellResizeHandle.render.test.tsx`
- `frontend/src/app/right/rightRailActions.test.tsx`
- `frontend/src/app/right/rail.test.ts`
- `frontend/src/app/palette/CommandPalette.test.ts`
- `frontend/src/locales/en/common.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Define frozen typed mappings for activity-panel tabs, actions, and keybindings.
- Localize shell toggle and resize messages at their React presentation boundaries.
- Preserve raw status and changes identifiers for state and callbacks.
- Replace right-rail terminology with clear activity-panel language.
- Add mock-free English, French, and Arabic behavior tests.
- Remove five obsolete localization exemptions.

## Outcome

Activity-panel tabs and shell controls now resolve catalog keys without exposing internal
right-rail terminology. Existing identifiers, ordering, callbacks, focus behavior, and
layout behavior remain unchanged. The localization scanner decreased from 1,181 to 1,176
findings with no new exemptions.

## Notes

The complete frontend lint recipe passed. Terra's affected suite passed 84 tests. Sol's
independent review passed 55 focused tests and 12 shell identity tests with no findings.
