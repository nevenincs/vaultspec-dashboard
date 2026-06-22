---
generated: true
tags:
  - '#index'
  - '#keyboard-navigation'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - '[[2026-06-21-keyboard-navigation-W01-P01-S01]]'
  - '[[2026-06-21-keyboard-navigation-W01-P01-S02]]'
  - '[[2026-06-21-keyboard-navigation-W01-P02-S03]]'
  - '[[2026-06-21-keyboard-navigation-W01-P02-S04]]'
  - '[[2026-06-21-keyboard-navigation-W01-P02-S05]]'
  - '[[2026-06-21-keyboard-navigation-W01-P03-S06]]'
  - '[[2026-06-21-keyboard-navigation-W01-P03-S07]]'
  - '[[2026-06-21-keyboard-navigation-W01-P03-S08]]'
  - '[[2026-06-21-keyboard-navigation-W01-P03-S09]]'
  - '[[2026-06-21-keyboard-navigation-W01-P04-S10]]'
  - '[[2026-06-21-keyboard-navigation-W02-P05-S13]]'
  - '[[2026-06-21-keyboard-navigation-W02-P05-S14]]'
  - '[[2026-06-21-keyboard-navigation-W02-P05-S15]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S16]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S17]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S20]]'
  - '[[2026-06-21-keyboard-navigation-adr]]'
  - '[[2026-06-21-keyboard-navigation-plan]]'
  - '[[2026-06-21-keyboard-navigation-research]]'
---

# `keyboard-navigation` feature index

Auto-generated index of all documents tagged with `#keyboard-navigation`.

## Documents

### adr

- `2026-06-21-keyboard-navigation-adr` - `keyboard-navigation` adr: `two-tier region focus model with a shared FocusZone and F6 pane cycling` | (**status:** `accepted`)

### exec

- `2026-06-21-keyboard-navigation-W01-P01-S01` - Build the FocusZone primitive (roving + activedescendant modes, arrow/Home/End/typeahead, orientation, wrap, entry-memory, single tab stop) composing the existing roving-focus and focus-restore utilities
- `2026-06-21-keyboard-navigation-W01-P01-S02` - Unit-test the FocusZone movement/wrap/entry-memory logic as pure functions, then live-verify it on one throwaway mount before any surface adopts it
- `2026-06-21-keyboard-navigation-W01-P02-S03` - Add the bounded ordered focus-region registry (left rail, stage dock, graph canvas, right rail, timeline) with visible-aware resolution and entry-memory hand-off to FocusZone
- `2026-06-21-keyboard-navigation-W01-P02-S04` - Register F6 / Shift+F6 region-cycle as global Class-A keybindings in the keymap registry and wire the dispatcher action to advance/reverse focus to the next visible region
- `2026-06-21-keyboard-navigation-W01-P02-S05` - Add the visually-hidden skip-to-content link as first tab stop and place initial focus on load so a visible focused element always exists
- `2026-06-21-keyboard-navigation-W01-P03-S06` - Stop the vault filter flyout auto-opening on field focus
- `2026-06-21-keyboard-navigation-W01-P03-S07` - Remove the dev crash/degrade bar from the production tab ring (not rendered or tabindex -1 outside dev)
- `2026-06-21-keyboard-navigation-W01-P03-S08` - Contain the timeline sr-only ~1000-button node list behind a single focusable region entry so it no longer enumerates 1000 tab stops
- `2026-06-21-keyboard-navigation-W01-P03-S09` - Audit every overlay (dialog, menu, popover, flyout) to restore focus to its trigger on close and never drop to body
- `2026-06-21-keyboard-navigation-W01-P04-S10` - Live-drive the app (chrome-devtools real keys): verify initial focus, full F6 region cycle, skip link, no trap, and Escape focus-restore
- `2026-06-21-keyboard-navigation-W02-P05-S13` - Confirm the browser-mode toggle (Vault/Files SegmentedToggle) composes FocusZone roving radiogroup semantics
- `2026-06-21-keyboard-navigation-W02-P05-S14` - Enroll the vault tree onto FocusZone (Up/Down rove rows, Left/Right collapse/expand, Home/End, typeahead, Enter open) as one tab stop with entry-memory
- `2026-06-21-keyboard-navigation-W02-P05-S15` - Enroll the files tree onto FocusZone with the same tree semantics
- `2026-06-21-keyboard-navigation-W03-P06-S16` - Enroll the graph nav controls (zoom/fit/reset toolbar) onto FocusZone horizontal roving as one tab stop
- `2026-06-21-keyboard-navigation-W03-P06-S17` - Give the graph settings panel a correct focus order (folds, sliders, switches, reset) with trap-free containment and focus-restore to its opener
- `2026-06-21-keyboard-navigation-W03-P06-S20` - Verify the graph canvas application-role focus contract: single tab stop, in-canvas arrow-walk works, Escape/Tab exits to the shell region sequence

### plan

- `2026-06-21-keyboard-navigation-plan` - `keyboard-navigation` plan

### research

- `2026-06-21-keyboard-navigation-research` - `keyboard-navigation` research: `full-frontend keyboard traversal architecture`
