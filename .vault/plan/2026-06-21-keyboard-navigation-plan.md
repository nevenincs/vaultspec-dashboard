---
tags:
  - '#plan'
  - '#keyboard-navigation'
date: '2026-06-21'
modified: '2026-06-24'
tier: L3
related:
  - '[[2026-06-21-keyboard-navigation-adr]]'
  - '[[2026-06-21-keyboard-navigation-research]]'
---


# `keyboard-navigation` plan

## Wave `W01` - Foundation - the focus spine before any enrollment

Build and live-verify the connective tissue the rest of the campaign enrolls against: the shared FocusZone primitive, the region traversal layer (F6 / skip link / guaranteed initial focus), and remediation of the three structural traps (filter flyout, dev crash-bar, timeline sr-only list). No component is enrolled until this wave passes its live gate.

### Phase `W01.P01` - FocusZone primitive

One pure, reusable primitive standardizes Class-B composite navigation (roving tabindex, arrow/Home/End/typeahead, orientation, wrap, entry memory, one tab stop), exposing both roving and aria-activedescendant modes. Composes the existing focus utilities; does not re-implement them.

- [x] `W01.P01.S01` - Build the FocusZone primitive (roving + activedescendant modes, arrow/Home/End/typeahead, orientation, wrap, entry-memory, single tab stop) composing the existing roving-focus and focus-restore utilities; `frontend/src/app/chrome/useFocusZone.ts`.
- [x] `W01.P01.S02` - Unit-test the FocusZone movement/wrap/entry-memory logic as pure functions, then live-verify it on one throwaway mount before any surface adopts it; `frontend/src/app/chrome/useFocusZone.render.test.tsx`.

### Phase `W01.P02` - Region traversal - F6, skip link, initial focus

A bounded, ordered focus-region registry over the existing landmarks, cycled by F6/Shift+F6 registered as global Class-A keybindings in the existing keymap registry (never a private listener). A skip-to-content link is the first tab stop, and focus is placed on load so document.activeElement is never body.

- [x] `W01.P02.S03` - Add the bounded ordered focus-region registry (left rail, stage dock, graph canvas, right rail, timeline) with visible-aware resolution and entry-memory hand-off to FocusZone; `frontend/src/app/chrome/focusRegions.ts`.
- [x] `W01.P02.S04` - Register F6 / Shift+F6 region-cycle as global Class-A keybindings in the keymap registry and wire the dispatcher action to advance/reverse focus to the next visible region; `frontend/src/app/chrome/regionCycleKeybindings.ts`.
- [x] `W01.P02.S05` - Add the visually-hidden skip-to-content link as first tab stop and place initial focus on load so a visible focused element always exists; `frontend/src/app/AppShell.tsx`.

### Phase `W01.P03` - Trap remediation and focus-restore discipline

Remove the three structural traps the diagnosis found and make focus restoration universal: no overlay drops focus to body; the filter flyout no longer auto-opens on focus or injects itself inline; the dev crash-bar leaves the production tab ring; the timeline sr-only list is contained behind one region entry.

- [x] `W01.P03.S06` - Stop the vault filter flyout auto-opening on field focus; `frontend/src/app/stage/FilterSidebar.tsx`.
- [x] `W01.P03.S07` - Remove the dev crash/degrade bar from the production tab ring (not rendered or tabindex -1 outside dev); `frontend/src/app/degradation/DebugSwitch.tsx`.
- [x] `W01.P03.S08` - Contain the timeline sr-only ~1000-button node list behind a single focusable region entry so it no longer enumerates 1000 tab stops; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W01.P03.S09` - Audit every overlay (dialog, menu, popover, flyout) to restore focus to its trigger on close and never drop to body; `frontend/src/app/kit/Popover.tsx`.

### Phase `W01.P04` - Foundation live-verification gate

Drive the running app with real key events and prove the spine works before any component enrolls: initial focus exists, F6/Shift+F6 cycle every visible region, the skip link works, no Tab trap remains, and Escape always restores focus rather than dropping to body.

- [x] `W01.P04.S10` - Live-drive the app (chrome-devtools real keys): verify initial focus, full F6 region cycle, skip link, no trap, and Escape focus-restore; `capture the focus trace as evidence; `frontend/src/app/AppShell.tsx`.

## Wave `W02` - Left rail enrollment

Bring every left-rail interactive surface onto the two-tier model one-by-one, each enrolled onto the shared FocusZone and live-verified before it is marked done.

### Phase `W02.P05` - Left rail components

Worktree picker, filter facet list, browser-mode toggle, vault tree, and files tree each become a single tab stop with internal arrow navigation via FocusZone, with entry-memory and focus-restore.

- [x] `W02.P05.S11` - Enroll the worktree picker (trigger + popover list) onto FocusZone; `arrow-navigate rows, Enter select, Escape restores to trigger; live-verify; `frontend/src/app/left/WorktreePicker.tsx`.
- [x] `W02.P05.S12` - Enroll the filter facet list (KIND/doc-type/feature/STATUS/HEALTH) onto FocusZone as one contained zone; `live-verify it is no longer an inline trap; `frontend/src/app/stage/FilterSidebar.tsx`.
- [x] `W02.P05.S13` - Confirm the browser-mode toggle (Vault/Files SegmentedToggle) composes FocusZone roving radiogroup semantics; `frontend/src/app/kit/Segment.tsx`.
- [x] `W02.P05.S14` - Enroll the vault tree onto FocusZone (Up/Down rove rows, Left/Right collapse/expand, Home/End, typeahead, Enter open) as one tab stop with entry-memory; `live-verify; `frontend/src/app/left/TreeBrowser.tsx`.
- [x] `W02.P05.S15` - Enroll the files tree onto FocusZone with the same tree semantics; `live-verify parity with the vault tree; `frontend/src/app/left/CodeTree.tsx`.

## Wave `W03` - Stage enrollment

Bring the graph stage overlays, document dock, and the canvas focus contract onto the model one-by-one, each live-verified.

### Phase `W03.P06` - Stage components

Graph nav controls, the graph settings panel, the dock workspace tabs, the document/code viewers, and the canvas application-role focus contract each become reachable, internally navigable, and cleanly exitable.

- [x] `W03.P06.S16` - Enroll the graph nav controls (zoom/fit/reset toolbar) onto FocusZone horizontal roving as one tab stop; `live-verify; `frontend/src/app/stage/GraphControls.tsx`.
- [x] `W03.P06.S17` - Give the graph settings panel a correct focus order (folds, sliders, switches, reset) with trap-free containment and focus-restore to its opener; `live-verify slider arrow-adjust; `frontend/src/app/stage/GraphControls.tsx`.
- [x] `W03.P06.S18` - Enroll the dock workspace tab strip onto FocusZone tablist semantics (arrows switch tabs, Delete/close affordance reachable) as one tab stop; `live-verify; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `W03.P06.S19` - Define the document/code viewer focus model (scrollable region focusable, internal controls in order); `frontend/src/app/viewer/CodeViewer.tsx`.
- [x] `W03.P06.S20` - Verify the graph canvas application-role focus contract: single tab stop, in-canvas arrow-walk works, Escape/Tab exits to the shell region sequence; `live-verify focus-in and focus-out; `frontend/src/app/stage/Stage.tsx`.

## Wave `W04` - Right rail enrollment

Bring the activity/status rail folds, rows, and the plan step tree onto the model one-by-one, each live-verified.

### Phase `W04.P07` - Right rail components

Fold sections, list rows, the plan step tree, and the search/results surface each become reachable and internally navigable as single tab stops.

- [x] `W04.P07.S21` - Give the right-rail fold sections a keyboard contract (twisty focusable, Enter/Space toggles, arrows move between folds) via FocusZone; `frontend/src/app/right/StatusTab.tsx`.
- [x] `W04.P07.S22` - Enroll the right-rail list rows (plans/PRs/issues/commits) onto FocusZone roving with Enter to open; `live-verify; `frontend/src/app/right/StatusTab.tsx`.
- [x] `W04.P07.S23` - Enroll the plan step tree onto FocusZone tree semantics (rove rows, expand/collapse) as one tab stop; `live-verify; `frontend/src/app/right/PlanStepTree.tsx`.
- [x] `W04.P07.S24` - Enroll the right-rail search/results surface onto the same model; `live-verify result arrow-navigation and open; `frontend/src/app/right/SearchTab.tsx`.

## Wave `W05` - Timeline enrollment

Replace the timeline's ~1000-button flat enumeration with a single focusable region carrying an aria-activedescendant mark cursor, and enroll the controls and minimap, each live-verified.

### Phase `W05.P08` - Timeline components

The mark cursor (activedescendant traversal), the timeline controls (playhead/range), and the minimap each become reachable and operable as single tab stops.

- [x] `W05.P08.S25` - Build the timeline mark cursor: one focusable region with aria-activedescendant, arrows/Home/End traverse marks, Enter selects, replacing the sr-only per-mark button enumeration; `live-verify; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W05.P08.S26` - Enroll the timeline controls (playhead step/nudge, range) onto the model with keyboard operation; `live-verify; `frontend/src/app/timeline/TimelineControls.tsx`.
- [x] `W05.P08.S27` - Give the timeline minimap a keyboard contract (focusable, arrows move the viewport band); `live-verify; `frontend/src/app/timeline/Minimap.tsx`.

## Wave `W06` - Overlays, kit primitives, and shell chrome enrollment

Bring the modal/overlay surfaces, the shared kit primitives, and the AppShell chrome onto the model one-by-one; verify trap+restore on every overlay and that every kit primitive composes FocusZone/restore correctly.

### Phase `W06.P09` - Overlay surfaces

Context menu, command palette, search palette, and settings dialog each trap focus while open, navigate internally, and restore focus to their trigger on close.

- [x] `W06.P09.S28` - Confirm the context menu host composes FocusZone menu semantics (arrows, Home/End, typeahead, Escape) and restores focus to the invoker; `live-verify keyboard-invoked menu (Shift+F10); `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `W06.P09.S29` - Verify the command palette traps focus, navigates via activedescendant, activates on Enter, and restores focus on close; `live-verify open/move/activate/Escape; `frontend/src/app/palette/CommandPalette.tsx`.
- [x] `W06.P09.S30` - Verify the search palette mirrors the command palette focus contract; `live-verify; `frontend/src/app/palette/SearchPaletteSurface.tsx`.
- [x] `W06.P09.S31` - Verify the settings dialog traps Tab, orders its controls, and restores focus on close; `live-verify each control kind is keyboard-operable including the keybinding recorder; `frontend/src/app/settings/SettingsDialog.tsx`.

### Phase `W06.P10` - Kit primitives and shell chrome

Every shared kit primitive composes FocusZone/restore correctly, and the AppShell chrome (resize separators, panel flyout menu) is keyboard-operable.

- [x] `W06.P10.S32` - Sweep the kit primitives (Tab, Segment, FoldSection, ListRow, Popover, Dialog, SearchField, Slider, Switch) to compose FocusZone/restore consistently; `live-verify each in situ; `frontend/src/app/kit`.
- [x] `W06.P10.S33` - Make the AppShell chrome keyboard-operable: resize separators (role=separator arrow-resize) and the panel flyout menu navigate and restore correctly; `live-verify; `frontend/src/app/AppShell.tsx`.

## Wave `W07` - End-to-end verification, review, and codify

Prove the whole frontend is keyboard-operable in one continuous live traversal, run the formal code review, and codify the durable rule if it has held.

### Phase `W07.P11` - Campaign close-out

A full-shell live keyboard pass, a vaultspec-code-review, and the discretionary rule codification gate the campaign as done only when every interactive element is reachable and operable.

- [x] `W07.P11.S34` - Run the full-shell live keyboard traversal (load to every region via F6, arrow within each, all overlays trap+restore, canvas in/out, timeline cursor) proving every interactive element is reachable; `capture evidence; `frontend/src/app/AppShell.tsx`.
- [x] `W07.P11.S35` - Run the full lint gate (just dev lint frontend) and a vaultspec-code-review of the campaign diff for the Class A/B split, layer ownership, bounded accumulators, and no private global listeners; `.vault/audit/2026-06-21-keyboard-navigation-audit.md`.
- [x] `W07.P11.S36` - If it held across the enrollment, codify the every-composite-navigates-through-the-one-focuszone rule via the codify pipeline; `.vaultspec/rules/rules/every-composite-navigates-through-the-one-focuszone.md`.

## Description

This plan makes the entire dashboard frontend operable by keyboard, implementing the two-tier
region focus model accepted in the `keyboard-navigation` ADR and grounded in the live diagnosis in
the `keyboard-navigation` research. The diagnosis proved the app is keyboard-unreachable past the
left-rail header: the filter flyout is an unintentional trap, `Escape` drops focus to body, ~1,100
elements sit in a flat tab order, and no mechanism cycles the panes. The remedy is a connective
spine - a shared `FocusZone` primitive, an ordered region registry cycled by `F6` (bound through
the existing Class-A keymap registry, not a new backend), a skip link, and universal focus
restoration - followed by enrolling every interactive component onto that spine one-by-one.

Wave W01 builds and live-verifies the foundation; no component is enrolled until it passes its live
gate. Waves W02-W06 enroll each surface's components individually (left rail, stage, right rail,
timeline, then overlays/kit/chrome), each step verified by driving the running app with real key
events. Wave W07 proves the whole shell in one continuous live traversal, runs the formal review,
and codifies the durable rule. The work preserves the prior cycle's Class A (command) / Class B
(widget) split: command affordances (`F6`, skip) bind through the keymap registry; within-region
arrow navigation lives in `FocusZone`. No engine endpoint, wire shape, or storage migration is
introduced.

## Steps







## Parallelization

W01 (foundation) is a hard prerequisite for every later wave and must land and pass its live gate
first - `FocusZone`, the region registry, and trap remediation are the substrate every enrollment
consumes. W02-W06 are sequenced by default but are internally parallelizable at the step level: the
component steps within an enrollment phase touch mostly disjoint files and may be enrolled in any
order, provided each is individually live-verified before being checked. W07 runs last, after every
enrollment step is closed. Within W01, P01 (FocusZone) precedes P02-P03 (which consume it); P04 is
the gate after P01-P03.

## Verification

The plan is complete only when every Step is closed (`- [x]`) AND the following hold, each proven by
driving the running app with real key events (not programmatic tests alone):

- **No trap, always-focused.** From a cold load, `document.activeElement` is never `<body>`; a
  visible focus indicator is always present; no `Tab` sequence is inescapable except an intentional,
  `Escape`-able modal.
- **Two-tier traversal works.** `F6`/`Shift+F6` cycle every visible region in order; each region is a
  single tab stop entered then navigated internally with arrows/`Home`/`End`; the skip link is the
  first tab stop and works.
- **Every interactive element is reachable and operable** by keyboard alone - every component step's
  live-verify passed and is reproducible in the W07 full-shell traversal.
- **Focus restoration is universal.** Every overlay (dialog, menu, popover, flyout) restores focus to
  its trigger on close; no close drops focus to `<body>`.
- **Architecture conformance.** The full lint gate (`just dev lint frontend`) is green; the
  vaultspec-code-review confirms the Class A/B split, `dashboard-layer-ownership`, bounded
  accumulators, relative units, and that no surface grew a private global `keydown` listener.
