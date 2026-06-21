---
generated: true
tags:
  - '#index'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-21'
related:
  - '[[2026-06-21-keyboard-navigation-W01-P01-S01]]'
  - '[[2026-06-21-keyboard-navigation-W01-P01-S02]]'
  - '[[2026-06-21-keyboard-navigation-W01-P02-S03]]'
  - '[[2026-06-21-keyboard-navigation-W01-P02-S04]]'
  - '[[2026-06-21-keyboard-navigation-W01-P02-S05]]'
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

### plan

- `2026-06-21-keyboard-navigation-plan` - `keyboard-navigation` plan

### research

- `2026-06-21-keyboard-navigation-research` - `keyboard-navigation` research: `full-frontend keyboard traversal architecture`
