---
tags:
  - '#exec'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-17'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
---

# `keyboard-shortcut-conflict-review` `P02` summary

Phase complete: 3/3 Steps (S04-S06).
- Created: `frontend/src/platform/keymap/reservedChords.ts`, `stores/view/reservedKeybindingDenylist.guard.test.ts` (assembly later hoisted to `assembleDefaultKeybindings.testsupport.ts`)
- Modified: `stores/view/rightRailKeybindings.ts`, `stores/view/commandPalette.ts` and their tests

## Description

The platform/browser-reserved denylist is codified with per-entry citations and a has-teeth CI guard, and the dead or unreliable defaults moved into the structural family: right-rail tabs Mod+1/Mod+2 -> Mod+Alt+1/Mod+Alt+2, search Mod+P -> Mod+Alt+S, document-search Mod+Shift+O -> Mod+Alt+F, editor draft-diff Mod+Shift+D -> Mod+Alt+G (the last three shaped by three review rounds - see the P04 summary). The denylist grew through review to cover the chrome-level Mod+Shift class, the devtools openers, and the macOS Dock/window class.
