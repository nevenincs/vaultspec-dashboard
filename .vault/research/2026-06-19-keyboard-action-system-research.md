---
tags:
  - '#research'
  - '#keyboard-action-system'
date: '2026-06-19'
modified: '2026-06-22'
related: []
---



# `keyboard-action-system` research: `global keyboard shortcuts and centralized action triggering`

The campaign goal is a designed, centralized, **global action backend** powering every
front-end UI element, triggerable through **global and configurable keyboard shortcuts**,
covering every surface: filter controls, command navigation, the left and right rails, the
timeline, and graph navigation. The coupled obligation is to **harden the settings schema**
so standardized schemas can register for keyboard events and mapping (i.e. bindings are
user-customizable and persisted, not hardcoded).

This document maps what already exists, names the architectural seams the campaign builds
on, inventories the scattered keyboard-handling sites that must converge, and frames the
open decisions for the ADR. The headline finding: **most of the action backend already
exists** — the work is a new *binding layer* over two mature seams plus a settings-schema
extension, not a green-field action framework.

## Findings

### F1 — The action backend already exists as two mature seams

The application already speaks one declare-once verb vocabulary. Two substrate modules under
`frontend/src/platform/` are the backbone:

- **`platform/actions/action.ts` — the `ActionDescriptor`.** The one verb unit the whole app
  speaks. It generalizes the palette's command shape so the command palette and the context
  menu consume the *same* descriptor and cannot drift. A descriptor carries an `id` (stable
  within its surface), a `label`, an optional `icon`/`section`/`confirm`/`disabled` set,
  and — critically — an **`accelerator`** field already reserved for an inline shortcut hint.
  Its terminal effect has exactly one runnable lane: a store-only `run()` intent
  (select / pin / filter / open) **or** a `dispatch` body routed through the dispatcher seam.
  The module's own header comment names the trajectory: an action is "reachable from more than
  one affordance (palette today, context menu now, **keybindings later**)." This is the exact
  seam the campaign plugs into.

- **`platform/dispatch/dispatch.ts` — the dispatcher.** A thin typed middleware pipeline
  (`log → trace → guard`) with handler registration by action `type`. It is the single place
  a user intent is logged, traced, guarded, and (later) rolled back. Mutating actions flow
  through it; the arm-to-confirm guard short-circuits here.

Together these mean the "centralized action backend" the goal asks for is **already built**.
A keybinding does not need a new effect channel: it resolves to an `ActionDescriptor` and
fires its existing `run()` or `dispatch`. The campaign's job is the *binding* layer (key →
action id) and the *catalog* of bindable actions — not a new backend.

### F2 — Keyboard handling today is scattered, hardcoded, and undiscoverable

A full inventory found **~29 distinct keyboard-handling sites**. They fall into two classes
that the design must keep separate:

**Class A — true command shortcuts (the migration targets, should become configurable):**

| Keys | Effect | Site | Scope |
| --- | --- | --- | --- |
| `Ctrl/Cmd+K` | open/toggle command palette | `app/palette/CommandPalette.tsx` | global window |
| `?` | show keyboard-shortcuts legend | `stores/view/keyboardShortcuts.ts` | global window |
| `← →` | cycle selected node's neighbours | `app/a11y/KeyboardNav.tsx` | global window |
| `↑ ↓` | cycle feature constellations | `app/a11y/KeyboardNav.tsx` | global window |
| `[ ]` | step the timeline playhead | `app/a11y/KeyboardNav.tsx` + `app/timeline/Playhead.tsx` | global + slider |
| `← →` (arrows) | nudge playhead; `Home` → live | `app/timeline/Playhead.tsx` | slider |
| `Arrow/Tab/Enter/e/Esc` | graph-walk: walk ego edges, open, expand, clear | `app/stage/graphWalk.ts` | canvas host |

Every key in Class A is hardcoded inside a handler conditional. There is no registry, no
chord-resolution, and — the honesty defect — the `?` legend's `KEYBOARD_SHORTCUT_GROUPS` is a
**hand-transcribed list** maintained separately from the real handlers, so it *can and will*
drift from what the app actually does. Several effects are also duplicated across sites: the
playhead `[ ]` step is implemented both in the global `KeyboardNav` listener and again in the
`Playhead` slider; neighbour cycling lives in `keyboardNavigation.ts` while a richer ego-walk
lives in `graphWalk.ts`.

**Class B — widget-intrinsic ARIA interaction (stays in components, NOT globally rebindable):**

- **Focus traps** (`app/chrome/focusTrap.ts` `trapTabFocus`) — `Tab`/`Shift+Tab` wrapping in
  the palette and dialogs.
- **Dismiss-on-escape** (`app/chrome/useDismissOnEscape.ts`) — already centralized (ADR F-S2,
  consolidated ~12 reimplementations); `Esc` to dismiss dialogs/popovers/menus/tooltips.
- **Keyboard context menu** (`app/chrome/keyboardContextMenu.ts`) — `ContextMenu`/`Shift+F10`,
  already a shared utility used by four surfaces.
- **Roving-tabindex navigation** inside composite widgets: the vault tree
  (`app/left/TreeBrowser.tsx`), code tree (`app/left/CodeTree.tsx`), worktree picker, search
  results, the activity-rail tabs (`app/right/RailTabs.tsx`), and every segmented control
  (`app/kit/Segment.tsx`, `LensSelector`, `EnumControl`) — arrow-walk within the widget,
  `Home`/`End`, `Enter`/`Space` to activate.
- **Menu/listbox navigation** inside the command palette and context menu host
  (`app/menu/ContextMenuHost.tsx`) — arrow cursor, `Home`/`End`, arm-to-confirm on `Enter`.

Class B follows the WAI-ARIA Authoring Practices for each widget pattern and is **correct
where it lives**. These are not "shortcuts"; they are the intrinsic keyboard interaction model
of a focused composite widget, and the ARIA spec fixes their keys. The campaign must **not**
route them through a rebindable global registry (rebinding `ArrowDown` inside a listbox would
break the widget contract). The line between A and B is the single most important design
boundary in this work.

**Form-target guards** are implemented three times (`KeyboardNav`, `keyboardShortcuts`,
`graphWalk`), each re-checking `INPUT|TEXTAREA|SELECT`/`contentEditable`. A central dispatcher
should own this guard once.

### F3 — The settings system is engine-owned, schema-driven, and string-valued

A setting flows end to end through one declared-once registry:

- **Engine registry** (`engine/crates/vaultspec-session/src/settings_schema.rs`). Each setting
  is a `SettingDef { key, value_type, default, scope_eligible, control, label, description,
  group, order, step?, unit?, placeholder? }`. Value types are
  `Enum{members} | Bool | String{max_len} | Integer{min,max}`. Control kinds (UI hints) are
  `Segmented | Switch | Text | Slider`. Five settings ship today (`theme`, `reduce_motion`,
  `default_granularity`, `confidence_floor`, `label_filter`). `validate(key,value,scoped)`
  rejects unknown keys, disallowed scope overrides, and out-of-constraint values with typed
  errors; `GET /settings/schema` serves the registry; values persist **string-valued** through
  a `settings(scope,key,value)` table behind a `{global, scoped}` envelope.
- **Stores** (`frontend/src/stores/server/settingsSelectors.ts`, `settingsControls.ts`,
  `settingsRowIntent.ts`) mirror the schema types and resolve the effective value
  (scope → global → default) with provenance.
- **UI** (`frontend/src/app/settings/`) dispatches `def.control` through a control registry
  (`segmented→EnumControl`, `switch→SwitchControl`, `text→TextControl`, `slider→NumberControl`)
  with an unknown-kind fallback to text.

The governing rule `settings-are-schema-driven-from-one-registry` requires every setting to be
declared once with a **real consumer** — no dead controls — and forbids any setting hand-wired
beside the registry. Any customizable-keybinding surface must obey this: it must be a declared
setting that the dispatcher actually reads.

### F4 — Two shapes for persisting customizable bindings

The registry's `String{max_len}` type plus a new `control` kind can carry a binding override.
Two shapes are viable, and the choice is an ADR decision:

- **(a) One SettingDef per bindable action** (`keybind.command_palette`,
  `keybind.graph_walk_forward`, …). Maximally schema-honest (each row has its own label,
  group, default, validation) and reuses the existing per-row UI directly. **But** it forces
  the *engine* to enumerate every frontend action id — coupling the engine to the
  `ActionDescriptor` catalog it knows nothing about today, and growing the registry by dozens
  of entries that all really belong to one feature.
- **(b) One SettingDef holding a sparse override map** (a single `keybindings` setting whose
  value is a validated JSON object `{action_id: chord}`, defaulting to `"{}"`). The engine
  validates the value is well-formed and that each chord parses, **without** needing to know
  which action ids exist. The **frontend keybinding registry owns the catalog and the default
  chords** (where action ids naturally live), and the settings UI gets one new `keybinding`
  control kind that renders the full catalog with per-action chord recorders, writing back only
  the sparse overrides. The dispatcher reads `defaults ⊕ overrides`.

Shape (b) keeps the engine free of frontend action-id coupling (consistent with the existing
boundary — the engine does not know `ActionDescriptor` ids), keeps the registry to one honest
setting that is genuinely consumed, and places the action catalog where the actions already
live. It is the recommended direction; the ADR should ratify it and define the override-map
validation contract (chord grammar, max size — the bound an accumulator-rule surface needs).

### F5 — Layer-ownership and contract constraints the design must honor

- **Layer ownership** (`dashboard-layer-ownership`, `views-are-projections-of-one-model`): the
  binding layer is shared intent. The dispatcher and keybinding registry belong in the
  **platform** substrate (alongside `action.ts`/`dispatch.ts`) and **stores** layers; the
  catalog of *what actions exist per surface* is contributed by each surface but resolved
  centrally. No `app/` or `scene/` component may grow its own global key listener or read the
  raw `tiers` block. Persisted bindings ride the existing settings wire — no new fetch.
- **No deprecation bridges** (user standing preference): the scattered Class-A handlers are
  **replaced**, not shimmed. `KeyboardNav`'s neighbour/feature/playhead keys, the palette's and
  legend's hardcoded listeners, and `graphWalk`'s verb table converge onto the registry; the
  old hand-transcribed `KEYBOARD_SHORTCUT_GROUPS` is **deleted** and the legend is *derived*
  from the registry so it can never drift again.
- **Bounded-by-default** (`bounded-by-default-for-every-accumulator`): the override map and any
  retained binding/event structures carry explicit caps at creation.
- **Settings honesty** (`settings-are-schema-driven-from-one-registry`): the keybinding setting
  ships *with* its consumer (the dispatcher) in the same change — no dead control.

### F6 — A normalized chord model is the missing primitive

No chord abstraction exists today; handlers compare raw `e.key` plus modifier booleans inline.
The binding layer needs a single normalized chord representation — a canonical string form
(modifier order fixed, key names normalized, platform `Cmd`/`Ctrl` reconciled) used identically
for: the default catalog, the persisted override map, the dispatcher's lookup key, the legend
keycaps, and the `accelerator` hint already on `ActionDescriptor`. This primitive (parse,
normalize, format, match-against-event) is small, pure, and unit-testable, and is the
foundation every other piece reuses. It belongs in the platform substrate next to `action.ts`.

## Decisions surfaced for the ADR

1. **Binding-layer placement and shape.** A central keybinding *registry* (chord → action id,
   defaults + sparse user overrides) plus **one** global keyboard *dispatcher* owning the
   form-target/focus-context/time-travel precedence gates, resolving a chord to an
   `ActionDescriptor` and firing its existing `run`/`dispatch`. Confirm placement in the
   `platform` substrate + `stores` consumer, per layer ownership.
2. **Class A vs Class B boundary.** Only command shortcuts are registry-driven and rebindable;
   widget-intrinsic ARIA interaction (focus trap, dismiss-on-escape, roving tabindex, menu/
   listbox nav) stays in components. Define the predicate that decides which class a key is in.
3. **Persistence shape (F4).** Ratify shape (b): one engine `keybindings` setting (sparse
   override map, validated) + a new `keybinding` control kind; the frontend registry owns the
   catalog and defaults. Define the override-map validation + size cap.
4. **Context/scope model.** How a binding declares the context it is active in (global vs
   canvas-focused vs a specific surface) so the same key can mean different things by focus
   without colliding — and how the dispatcher resolves precedence across contexts.
5. **Chord primitive (F6).** The normalized chord type and its canonical string form, shared by
   the catalog, overrides, dispatcher, legend, and `accelerator` hints.
6. **Convergence + legend.** Replace (not bridge) the scattered Class-A handlers; delete the
   hand-transcribed legend and derive it from the registry.
7. **Conflict handling + customization UX.** What happens when a user binds a chord already in
   use (reject / reassign / warn), and how the settings recorder surfaces it.

## Scope of enrollment (the campaign's breadth)

Every surface named in the goal becomes a contributor of `ActionDescriptor`s with stable,
bindable ids, resolved through the one dispatcher:

- **Command navigation** — palette open/close/next/prev/activate; already descriptor-based,
  needs its global open chord moved into the registry.
- **Filter controls** — the unified left-rail filter actions (KIND/TOPIC/STATUS/HEALTH/EDITED
  toggles, clear-all, glob/regex focus) become bindable verbs.
- **Left rail** — focus rail, switch tree/code/worktree modes, expand/collapse, reveal-in-tree.
- **Right rail** — switch activity tabs (Status/Changes/Search), focus search, step the work tree.
- **Timeline** — playhead step/nudge/jump-to-live, range select/clear, mode controls.
- **Graph navigation** — the `graphWalk` verbs (walk, open, expand, clear) plus neighbour/
  feature cycling, lens/layout switching, fit/reset view.

These produce the per-surface execution waves once the core registry, dispatcher, chord
primitive, and settings extension land first.
