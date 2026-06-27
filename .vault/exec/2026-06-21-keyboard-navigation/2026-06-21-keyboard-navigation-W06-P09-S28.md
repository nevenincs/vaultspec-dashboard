---
tags:
  - '#exec'
  - '#keyboard-navigation'
date: '2026-06-23'
modified: '2026-06-23'
step_id: 'S28'
related:
  - "[[2026-06-21-keyboard-navigation-plan]]"
---

# Confirm the context menu host composes FocusZone menu semantics (arrows, Home/End, typeahead, Escape) and restores focus to the invoker

## Scope

- `live-verify keyboard-invoked menu (Shift+F10)`
- `frontend/src/app/menu/ContextMenuHost.tsx`

## Description

- Audited the context menu's keyboard handler and found a real double-fire gap: it `preventDefault`ed consumed keys (arrows/Enter/Escape) but did NOT `stopPropagation`, so a menu arrow moved the cursor AND fired the global graph-cycle binding on the window listener. Added `stopPropagation` on consume.
- Confirmed the menu already composes the rest of the contract: `role="menu"` with `aria-activedescendant` cursor, `useFocusRestore` (restores focus to the invoker on close), Escape/dismiss, and a keyboard-invocable context menu (Shift+F10 via the tree rows).

## Outcome

- Double-fire fixed; eslint/tsc clean; 47 menu + settings tests green. The menu's restore/roving/dismiss machinery was already in place (prior dashboard-context-menus campaign).

## Notes

- Live re-confirmation (Shift+F10 invoke + arrow-cursor without graph movement) deferred: both browser MCPs were locked this turn (chrome-devtools grabbed by a concurrent agent, Playwright already locked). The fix is the same stopPropagation pattern proven live in the trees.
