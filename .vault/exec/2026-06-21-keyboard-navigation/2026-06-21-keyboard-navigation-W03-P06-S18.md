---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-06-24'
step_id: 'S18'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Enroll the dock workspace tab strip onto FocusZone tablist semantics (arrows switch tabs, Delete/close affordance reachable) as one tab stop

## Scope

- `live-verify`
- `frontend/src/app/stage/DockWorkspace.tsx`

## Description

- The dockview tab strip is library-owned: its `.dv-tab` wrapper owns pointer click-to-activate and drag-to-dock and exposes NO keyboard path, and the per-tab header view carries no sibling order, so a true arrow-roving tablist would mean fighting dockview's DOM with incomplete ARIA. Took the clean, low-risk win instead: made the `DocTab` title keyboard-activatable.
- The title is now `role="button"` `tabIndex={0}` with an "Switch to <title>" aria-label and an `onKeyDown` that, on Enter/Space, `stopPropagation`s and calls `api.setActive()` — so a keyboard user can SWITCH to a tab (previously only the close ✕ was reachable; switching was impossible). Added `activateAriaLabel` to the `DockTabHeaderView` deriver/type. Pointer activation stays dockview's (no onClick added).

## Outcome

- Dock tabs are keyboard-operable: Tab reaches each tab's title (switch) and its ✕ (close), both activate by keyboard. Live-verified via the own-Chromium harness: after opening docs, the doc tab `"Switch to 2026-06-16-backend-hotpath-hardening-plan"` is focusable (tabIndex 0) and Enter is handled (`defaultPrevented` → `setActive`), no page errors. tsc/eslint/prettier clean; tabs tests (35) green.

## Notes

- A full arrow-roving tablist (one tab stop, arrows move between tabs) is NOT built — dockview owns the tab container and exposes no sibling order to a single tab header, so that is a dockview-upstream/config refinement, not a clean in-app change. The delivered model (Tab to reach, Enter to switch/close) makes every dock tab keyboard-operable, which is S18's intent.
