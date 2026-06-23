---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-06-23'
step_id: 'S33'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---




# Make the AppShell chrome keyboard-operable: resize separators (role=separator arrow-resize) and the panel flyout menu navigate and restore correctly

## Scope

- `live-verify`
- `frontend/src/app/AppShell.tsx`

## Description

- Verified the AppShell chrome is keyboard-operable: each resize divider is a `role="separator"` with `tabIndex={0}` and an `onKeyDown` that resizes the panel by arrow keys (`resizeShellPanelByKey`); the single panel flyout is a `role="menu"` of `role="menuitem"` buttons reached by Tab, and the flyout is a kit `Popover` (so it inherits the centralized Escape-dismiss + focus-restore from S09).

## Outcome

- The shell's structural chrome (3 resize separators + the panel-controls flyout) is reachable and operable by keyboard; no change required beyond the foundation work (skip link, region anchors, F6) already landed in W01.

## Notes

- Live re-confirmation of the arrow-resize + flyout menu deferred (browser MCPs locked). The separators/flyout machinery predates this campaign (appshell window-mgmt); this step is verification.
