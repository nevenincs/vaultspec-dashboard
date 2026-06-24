---
generated: true
tags:
  - '#index'
  - '#keyboard-navigation'
date: '2026-06-24'
modified: '2026-06-24'
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
  - '[[2026-06-21-keyboard-navigation-W02-P05-S11]]'
  - '[[2026-06-21-keyboard-navigation-W02-P05-S12]]'
  - '[[2026-06-21-keyboard-navigation-W02-P05-S13]]'
  - '[[2026-06-21-keyboard-navigation-W02-P05-S14]]'
  - '[[2026-06-21-keyboard-navigation-W02-P05-S15]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S16]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S17]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S18]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S19]]'
  - '[[2026-06-21-keyboard-navigation-W03-P06-S20]]'
  - '[[2026-06-21-keyboard-navigation-W04-P07-S21]]'
  - '[[2026-06-21-keyboard-navigation-W04-P07-S22]]'
  - '[[2026-06-21-keyboard-navigation-W04-P07-S23]]'
  - '[[2026-06-21-keyboard-navigation-W04-P07-S24]]'
  - '[[2026-06-21-keyboard-navigation-W05-P08-S25]]'
  - '[[2026-06-21-keyboard-navigation-W05-P08-S26]]'
  - '[[2026-06-21-keyboard-navigation-W05-P08-S27]]'
  - '[[2026-06-21-keyboard-navigation-W06-P09-S28]]'
  - '[[2026-06-21-keyboard-navigation-W06-P09-S29]]'
  - '[[2026-06-21-keyboard-navigation-W06-P09-S30]]'
  - '[[2026-06-21-keyboard-navigation-W06-P09-S31]]'
  - '[[2026-06-21-keyboard-navigation-W06-P10-S32]]'
  - '[[2026-06-21-keyboard-navigation-W06-P10-S33]]'
  - '[[2026-06-21-keyboard-navigation-W07-P11-S34]]'
  - '[[2026-06-21-keyboard-navigation-W07-P11-S35]]'
  - '[[2026-06-21-keyboard-navigation-W07-P11-S36]]'
  - '[[2026-06-21-keyboard-navigation-adr]]'
  - '[[2026-06-21-keyboard-navigation-plan]]'
  - '[[2026-06-21-keyboard-navigation-research]]'
  - '[[2026-06-24-keyboard-navigation-audit]]'
---

# `keyboard-navigation` feature index

Auto-generated index of all documents tagged with `#keyboard-navigation`.

## Documents

### adr

- `2026-06-21-keyboard-navigation-adr` - `keyboard-navigation` adr: `two-tier region focus model with a shared FocusZone and F6 pane cycling` | (**status:** `accepted`)

### audit

- `2026-06-24-keyboard-navigation-audit` - `keyboard-navigation` audit: `keyboard navigation review`

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
- `2026-06-21-keyboard-navigation-W03-P06-S19` - Define the document/code viewer focus model (scrollable region focusable, internal controls in order)
- `2026-06-21-keyboard-navigation-W04-P07-S21` - Give the right-rail fold sections a keyboard contract (twisty focusable, Enter/Space toggles, arrows move between folds) via FocusZone
- `2026-06-21-keyboard-navigation-W04-P07-S22` - Enroll the right-rail list rows (plans/PRs/issues/commits) onto FocusZone roving with Enter to open
- `2026-06-21-keyboard-navigation-W04-P07-S23` - Enroll the plan step tree onto FocusZone tree semantics (rove rows, expand/collapse) as one tab stop
- `2026-06-21-keyboard-navigation-W04-P07-S24` - Enroll the right-rail search/results surface onto the same model
- `2026-06-21-keyboard-navigation-W06-P09-S28` - Confirm the context menu host composes FocusZone menu semantics (arrows, Home/End, typeahead, Escape) and restores focus to the invoker
- `2026-06-21-keyboard-navigation-W06-P09-S29` - Verify the command palette traps focus, navigates via activedescendant, activates on Enter, and restores focus on close
- `2026-06-21-keyboard-navigation-W06-P09-S30` - Verify the search palette mirrors the command palette focus contract
- `2026-06-21-keyboard-navigation-W06-P09-S31` - Verify the settings dialog traps Tab, orders its controls, and restores focus on close
- `2026-06-21-keyboard-navigation-W06-P10-S32` - Sweep the kit primitives (Tab, Segment, FoldSection, ListRow, Popover, Dialog, SearchField, Slider, Switch) to compose FocusZone/restore consistently
- `2026-06-21-keyboard-navigation-W06-P10-S33` - Make the AppShell chrome keyboard-operable: resize separators (role=separator arrow-resize) and the panel flyout menu navigate and restore correctly
- `2026-06-21-keyboard-navigation-W02-P05-S11` - Enroll the worktree picker (trigger + popover list) onto FocusZone
- `2026-06-21-keyboard-navigation-W02-P05-S12` - Enroll the filter facet list (KIND/doc-type/feature/STATUS/HEALTH) onto FocusZone as one contained zone
- `2026-06-21-keyboard-navigation-W03-P06-S18` - Enroll the dock workspace tab strip onto FocusZone tablist semantics (arrows switch tabs, Delete/close affordance reachable) as one tab stop
- `2026-06-21-keyboard-navigation-W05-P08-S25` - Build the timeline mark cursor: one focusable region with aria-activedescendant, arrows/Home/End traverse marks, Enter selects, replacing the sr-only per-mark button enumeration
- `2026-06-21-keyboard-navigation-W05-P08-S26` - Enroll the timeline controls (playhead step/nudge, range) onto the model with keyboard operation
- `2026-06-21-keyboard-navigation-W05-P08-S27` - Give the timeline minimap a keyboard contract (focusable, arrows move the viewport band)
- `2026-06-21-keyboard-navigation-W07-P11-S34` - Run the full-shell live keyboard traversal (load to every region via F6, arrow within each, all overlays trap+restore, canvas in/out, timeline cursor) proving every interactive element is reachable
- `2026-06-21-keyboard-navigation-W07-P11-S35` - Run the full lint gate (just dev lint frontend) and a vaultspec-code-review of the campaign diff for the Class A/B split, layer ownership, bounded accumulators, and no private global listeners
- `2026-06-21-keyboard-navigation-W07-P11-S36` - If it held across the enrollment, codify the every-composite-navigates-through-the-one-focuszone rule via the codify pipeline

### plan

- `2026-06-21-keyboard-navigation-plan` - `keyboard-navigation` plan

### research

- `2026-06-21-keyboard-navigation-research` - `keyboard-navigation` research: `full-frontend keyboard traversal architecture`
