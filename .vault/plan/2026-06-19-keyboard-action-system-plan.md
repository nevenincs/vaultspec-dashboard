---
tags:
  - '#plan'
  - '#keyboard-action-system'
date: '2026-06-19'
modified: '2026-06-25'
tier: L3
related:
  - '[[2026-06-19-keyboard-action-system-adr]]'
  - '[[2026-06-19-keyboard-action-system-research]]'
---

# `keyboard-action-system` plan

Build one keymap registry that binds configurable chords to the existing action plane, harden the settings schema to persist and customize bindings, then enroll every surface.

## Wave `W01` - keymap core: chord primitive, registry, and the one dispatcher

Land the stable binding core in the platform/stores layers that every later wave depends on: a normalized chord primitive, the keybinding registry (catalog, defaults, context model, conflict-check), and the single global keydown dispatcher owning the form-target/focus-context/time-travel gates. Backed by the keyboard-action-system ADR (decisions 1, 2, 4, 5, 6).

### Phase `W01.P01` - normalized chord primitive

A pure platform module defining the Chord type and parse/format/matches, with one canonical string form reused by catalog, overrides, dispatcher, legend, and accelerator hints.

- [x] `W01.P01.S01` - Define the normalized Chord type and parse/format/matches with one canonical string form; `frontend/src/platform/keymap/chord.ts`.
- [x] `W01.P01.S02` - Unit-test chord parse/format round-trip, modifier normalization, and matches-against-event; `frontend/src/platform/keymap/chord.test.ts`.

### Phase `W01.P02` - keybinding registry: catalog, defaults, context, conflict-check

The declarative catalog of bindable actions (id, defaultChord, label, group, context) resolving to ActionDescriptors, with effective bindings = defaults merged with overrides and a pure conflict-check.

- [x] `W01.P02.S03` - Define the keybinding entry shape (id, defaultChord, label, group, context) and the default catalog seed; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P02.S04` - Implement effective-bindings merge (defaults combined with sparse overrides) and a pure conflict-check; `frontend/src/platform/keymap/registry.ts`.
- [x] `W01.P02.S05` - Unit-test registry resolution, override merge, and conflict detection across contexts; `frontend/src/platform/keymap/registry.test.ts`.

### Phase `W01.P03` - the one global keydown dispatcher

A single window keydown listener owning the form-target/focus-context/time-travel gates and context precedence, resolving a chord to an ActionDescriptor and firing its run/dispatch lane.

- [x] `W01.P03.S06` - Implement the single global keydown dispatcher with form-target, focus-context, and time-travel gates and context precedence; `frontend/src/stores/view/keymapDispatcher.ts`.
- [x] `W01.P03.S07` - Mount the dispatcher once at the app root, subsuming the three duplicated form-target guards; `frontend/src/app/a11y/KeyboardNav.tsx`.
- [x] `W01.P03.S08` - Unit-test dispatcher chord resolution, context precedence, and gate short-circuits; `frontend/src/stores/view/keymapDispatcher.test.ts`.

## Wave `W02` - settings-schema hardening and legend convergence

Make bindings user-customizable and persisted through the one engine-owned settings registry, and converge the keyboard legend to derive from the registry. Depends on W01. Backed by the ADR (decisions 3, 6, 7 and the F4 shape-b ratification).

### Phase `W02.P04` - engine settings: keybindings value-type and SettingDef

Additive engine registry change: a new SettingType/ControlKind carrying a validated, size-capped sparse override map, declared as one keybindings SettingDef, served through the existing schema route.

- [x] `W02.P04.S09` - Add the keybindings SettingType and ControlKind with chord-parse and size-cap validation; `engine/crates/vaultspec-session/src/settings_schema.rs`.
- [x] `W02.P04.S10` - Declare the keybindings SettingDef and its group, served through the existing schema route; `engine/crates/vaultspec-session/src/settings_schema.rs`.
- [x] `W02.P04.S11` - Engine-test keybindings validation (well-formed, chord-parse, over-cap rejection) and schema serving; `engine/crates/vaultspec-session/src/settings_schema.rs`.

### Phase `W02.P05` - stores: override-map resolution and effective bindings

Mirror the new schema types and resolve effective bindings (registry defaults merged with the persisted sparse overrides) as a stores selector the dispatcher consumes.

- [x] `W02.P05.S12` - Mirror the new keybindings schema value-type and control kind in the client engine types; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P05.S13` - Resolve effective bindings (registry defaults merged with persisted sparse overrides) as a stores selector the dispatcher reads; `frontend/src/stores/server/settingsSelectors.ts`.
- [x] `W02.P05.S14` - Unit-test the override-map selector and the defaults-plus-overrides resolution; `frontend/src/stores/server/settingsSelectors.test.ts`.

### Phase `W02.P06` - keybinding settings control: recorder and conflict surfacing

A new keybinding control kind rendering the full frontend catalog as per-action chord recorders grouped by surface, writing back sparse overrides and surfacing conflicts inline.

- [x] `W02.P06.S15` - Build the KeybindingControl chord-recorder component and its view deriver; `frontend/src/app/settings/controls/KeybindingControl.tsx`.
- [x] `W02.P06.S16` - Register the keybinding control kind and render the catalog grouped by surface; `frontend/src/app/settings/controls/registry.tsx`.
- [x] `W02.P06.S17` - Surface binding conflicts inline in the recorder and unit-test the control view and conflict path; `frontend/src/app/settings/controls/KeybindingControl.test.tsx`.

### Phase `W02.P07` - legend convergence: derive from the registry

Delete the hand-transcribed KEYBOARD_SHORTCUT_GROUPS and render the ? legend from the registry so keycaps can never drift from live bindings.

- [x] `W02.P07.S18` - Derive the keyboard-shortcuts legend groups from the registry; `frontend/src/stores/view/keyboardShortcuts.ts`.
- [x] `W02.P07.S19` - Delete the hand-transcribed KEYBOARD_SHORTCUT_GROUPS and point the legend dialog at the derived groups; `frontend/src/stores/view/keyboardShortcuts.ts`.
- [x] `W02.P07.S20` - Update legend tests to assert the legend matches the live registry bindings; `frontend/src/stores/view/keyboardShortcuts.test.ts`.

## Wave `W03` - enrollment: command navigation, graph, timeline

Enroll the command-palette/global openers, graph navigation, and timeline surfaces: each contributes its ActionDescriptor catalog with stable bindable ids and replaces (never bridges) its scattered Class-A handler. Depends on the W01+W02 core. Backed by the ADR implementation section step 6.

### Phase `W03.P08` - enroll command navigation and global openers

Move the Ctrl+K and ? openers and palette navigation into global registry bindings; delete the hardcoded palette/legend window listeners.

- [x] `W03.P08.S21` - Register the Ctrl+K palette opener and the ? legend opener as global registry bindings; `frontend/src/platform/keymap/registry.ts`.
- [x] `W03.P08.S22` - Route the openers through the dispatcher and delete the hardcoded palette and legend window listeners; `frontend/src/app/palette/CommandPalette.tsx`.
- [x] `W03.P08.S23` - Keep the palette listbox and legend dialog internal navigation as widget-intrinsic ARIA (Class B), documenting the boundary; `frontend/src/app/palette/CommandPalette.tsx`.

### Phase `W03.P09` - enroll graph navigation

Converge graphWalk verbs and neighbour/feature cycling plus lens/layout and fit/reset onto the canvas-context registry bindings, preserving the no-keyboard-trap and live-region floor; delete the old handlers.

- [x] `W03.P09.S24` - Contribute graph ActionDescriptors (walk forward/back, open, expand, clear, neighbour/feature cycle, fit/reset, lens) under the canvas context; `frontend/src/app/stage/graphActions.ts`.
- [x] `W03.P09.S25` - Route graph verbs through the dispatcher canvas context and delete the graphWalk private listener and the KeyboardNav neighbour/feature path; `frontend/src/app/stage/graphWalk.ts`.
- [x] `W03.P09.S26` - Preserve the accessibility floor (no-keyboard-trap on Tab, live-region announcements, instant non-animated selection) under the new path and test it; `frontend/src/app/stage/graphActions.test.ts`.

### Phase `W03.P10` - enroll timeline

Converge playhead step/nudge/jump-to-live and range select/clear onto timeline-context registry bindings; remove the duplicated KeyboardNav playhead path.

- [x] `W03.P10.S27` - Contribute timeline ActionDescriptors (playhead step/nudge, jump-to-live, range clear) under the timeline context; `frontend/src/app/timeline/timelineActions.ts`.
- [x] `W03.P10.S28` - Route timeline verbs through the dispatcher and remove the duplicated KeyboardNav playhead path, keeping the Playhead slider ARIA intact; `frontend/src/app/timeline/Playhead.tsx`.
- [x] `W03.P10.S29` - Unit-test the timeline action contributions and the removal of the duplicated handler; `frontend/src/app/timeline/timelineActions.test.ts`.

## Wave `W04` - enrollment: left rail and filters, right rail, then review and codify

Enroll the left rail (mode switch, expand/collapse, reveal) and its unified filter controls, and the right rail (tab switch, search focus, work-tree step), each replacing its old handler; then the campaign review and codify pass. Depends on the W01+W02 core. Backed by the ADR.

### Phase `W04.P11` - enroll left rail and filter controls

Contribute left-rail and unified filter ActionDescriptors (focus, mode switch, expand/collapse, reveal, KIND/TOPIC/STATUS/HEALTH/EDITED toggles, clear-all) as left-rail/filters-context bindings; delete old handlers.

- [x] `W04.P11.S30` - Contribute left-rail nav ActionDescriptors (focus rail, mode switch, expand/collapse, reveal in tree) under the left-rail context; `frontend/src/app/left/leftRailActions.ts`.
- [x] `W04.P11.S31` - Contribute filter ActionDescriptors (KIND/TOPIC/STATUS/HEALTH/EDITED toggles, clear-all, focus glob/regex) under the filters context; `frontend/src/app/left/filterActions.ts`.
- [x] `W04.P11.S32` - Route both through the dispatcher, keep the tree roving-tabindex as Class B, and test the contributions; `frontend/src/app/left/leftRailActions.test.ts`.

### Phase `W04.P12` - enroll right rail

Contribute right-rail ActionDescriptors (activity tab switch, focus search, work-tree step) as right-rail-context bindings; delete old handlers.

- [x] `W04.P12.S33` - Contribute right-rail ActionDescriptors (activity tab switch, focus search, work-tree step) under the right-rail context; `frontend/src/app/right/rightRailActions.ts`.
- [x] `W04.P12.S34` - Route right-rail verbs through the dispatcher, keeping RailTabs and SearchTab roving navigation as Class B, and test the contributions; `frontend/src/app/right/rightRailActions.test.ts`.

### Phase `W04.P13` - campaign review and codify

Full-gate verification, live chord verification in the running app, code review of the converged system, and codification of the one-keymap-registry rule after it holds across enrollment.

- [x] `W04.P13.S35` - Run the full lint gate (just dev lint all) and the frontend and engine test suites to exit 0; `frontend/package.json`.
- [x] `W04.P13.S36` - Live-verify representative chords and a customized binding in the running app via chrome-devtools; `frontend/src/app/AppShell.tsx`.
- [x] `W04.P13.S37` - Run a code review of the converged keyboard-action system and address findings; `.vault/audit/2026-06-19-keyboard-action-system-audit.md`.
- [x] `W04.P13.S38` - Codify the one-keymap-registry rule once it holds across enrollment; `.vaultspec/rules/rules/keyboard-shortcuts-bind-through-the-one-keymap-registry.md`.

## Description

This plan implements the accepted `keyboard-action-system` ADR: a centralized, global,
configurable keyboard layer over the *already-mature* action backend (the `ActionDescriptor`
verb unit and the dispatcher middleware seam). The research found the backend already exists and
is consumed by the command palette and context menu; the missing piece is a *binding* layer
(chord to action id) plus a settings-schema extension that makes bindings user-customizable
through the one engine-owned registry, never hardcoded.

Wave `W01` lands the stable core in the `platform`/`stores` layers: a normalized chord
primitive, the keybinding registry (catalog, defaults, context model, conflict-check), and the
single global dispatcher that owns the form-target, focus-context, and time-travel gates today
reimplemented three times. Wave `W02` hardens the settings schema for customization end to end
(engine value-type + `keybindings` SettingDef, stores override-map resolution, a `keybinding`
settings control with a chord recorder and conflict surfacing) and converges the `?` legend to
*derive* from the registry, deleting the hand-transcribed list that can drift. Waves `W03`-`W04`
enroll every surface named in the goal, each contributing its `ActionDescriptor` catalog with
stable bindable ids and *replacing* (never bridging) its scattered Class-A handler: command
navigation, graph navigation, timeline, the left rail and its filter controls, and the right
rail. The whole campaign honors the dashboard layer-ownership boundaries, the
`settings-are-schema-driven-from-one-registry` honesty rule (no dead controls), the no-deprecation-bridge preference, bounded-by-default accumulators, and the full lint gate before any
green claim.

## Steps

## Parallelization

Waves are sequenced: `W01` (core) must land before anything binds; `W02` (settings hardening +
legend) depends on the `W01` registry; `W03`-`W04` (per-surface enrollment) depend on the full
`W01`+`W02` core. Within `W01`, the chord primitive (`P01`) is the root dependency; the registry
(`P02`) and dispatcher (`P03`) build on it and are best done in order because the dispatcher
consumes the registry's context model. Within `W02`, the engine value-type (`P04`) precedes the
stores resolution (`P05`) which precedes the settings control (`P06`); the legend convergence
(`P07`) depends only on the registry and can run alongside `P05`/`P06`. Within the enrollment
waves, each surface phase is independent of the others (they touch disjoint files) and may be
parallelized once the core is stable; each must delete its old handler in the same phase.

## Verification

- Every Step closed (`- [x]`) and the plan's review phase signs off.
- The full lint gate (`just dev lint all`) exits 0 - eslint + prettier + tsc and Rust
  fmt + clippy - and the frontend + engine test suites pass, per `declaring-green-runs-the-full-gate`.
- Exactly one global `keydown` dispatcher exists; no `app/`/`scene/` surface retains a private
  global key listener for a Class-A command (verified by grep + review).
- The `?` legend renders from the registry; the hand-transcribed `KEYBOARD_SHORTCUT_GROUPS` is
  deleted (no drift possible).
- A user-set binding persists through the settings wire and is honored live by the dispatcher;
  the `keybindings` setting has a real consumer (no dead control), validated and size-capped.
- Every goal surface (filter controls, command navigation, left/right rail, timeline, graph) is
  keyboard-operable through the registry, with the existing accessibility floor preserved
  (graph arrow-walk, no-keyboard-trap, live-region announcements, instant non-animated selection).
- Live verification in the running app (chrome-devtools) confirms representative chords fire the
  right actions and a customized binding takes effect after a settings change.
