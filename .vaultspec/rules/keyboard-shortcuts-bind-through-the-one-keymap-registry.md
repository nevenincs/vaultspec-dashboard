---
name: keyboard-shortcuts-bind-through-the-one-keymap-registry
---

# Keyboard command shortcuts bind through the one keymap registry

## Rule

Every command keyboard shortcut (Class A) is declared once in the central keybinding
registry (`frontend/src/platform/keymap/registry.ts`) as a `KeybindingDef`
(`id`, `defaultChord`, `label`, `group`, `context`) and resolves to an
`ActionDescriptor` fired by the single global dispatcher
(`frontend/src/stores/view/keymapDispatcher.ts`). No `frontend/src/app/` or
`frontend/src/scene/` surface may grow its own global `keydown` listener for a command
shortcut, and the `?` legend is derived from the registry, never hand-transcribed.
Widget-intrinsic ARIA key interaction (Class B) — focus traps, dismiss-on-escape,
roving-tabindex tree/tab/segment navigation, menu/listbox cursoring — stays in its
component and is never routed through the registry. Bindings are persisted and
customized only through the engine-owned `keybindings` setting (a bounded, validated
sparse `action_id -> chord` override map); the frontend registry owns the catalog and
the default chords, the engine never learns action ids.

## Why

The `2026-06-19-keyboard-action-system-adr` settled this after the campaign found
keyboard handling scattered across ~29 hardcoded sites, including a `?` legend whose
keycaps were a hand-transcribed list free to drift from the real handlers, and (during
enrollment) a concrete **double-fire** bug: the graph canvas's own host `keydown`
listener fired ego-walk while the global dispatcher *also* fired the colliding
neighbour-cycle binding, because the canvas listener only `preventDefault`ed and never
left the registry. Centralizing every command shortcut behind one registry + one
dispatcher is what makes a chord rebindable, a conflict detectable, the legend
incapable of lying, and the form-target / focus-context / time-travel gates live in one
place instead of three copies. Keeping Class B in components respects the WAI-ARIA
widget contracts (rebinding `ArrowDown` inside a listbox would break the widget) and
preserves the accessibility floor (no-keyboard-trap, live-region announcements, instant
non-animated selection). The constraint held across the full multi-wave enrollment
(core, settings, command nav, graph, timeline, both rails, filters) and an adversarial
code review confirmed no surface retained a private global listener.

## How

- **Good:** a surface needs a new command shortcut — it adds a `KeybindingDef` to the
  registry (with its `context`) and a `registerKeyAction(id, () => ActionDescriptor)`
  thunk in a `useEffect` with disposers (the pattern in `leftRailKeybindings.ts` /
  `graphWalkKeybindings.ts`); the descriptor fires through its existing `run`/`dispatch`
  lane. A surface-scoped key uses a surface `context` and the surface region carries
  `data-keymap-context="<surface>"`, so most-specific-context-wins resolves collisions
  with global bindings.
- **Good:** a colliding key in two contexts (canvas ego-walk vs global neighbour-cycle
  on the arrows) is resolved by registering the canvas verb as `context: "canvas"` and
  deleting the surface's own listener — the dispatcher fires exactly one binding.
- **Good:** a customizable binding is one sparse entry in the engine `keybindings`
  override map (bounded at `MAX_KEYBINDING_OVERRIDES`, each chord byte-capped, validated
  with typed errors); the dispatcher reads `defaults <- overrides`.
- **Bad:** a component adding `window.addEventListener("keydown", …)` for a command, a
  per-component hardcoded `e.key === "k"` shortcut, or a second hand-maintained legend
  list — that re-scatters the failure modes (drift, double-fire, three form-target
  guards) this rule exists to prevent.
- **Bad:** routing a Class-B widget key (roving-tabindex arrows, focus-trap Tab,
  dismiss-on-escape) through the registry — it breaks the ARIA widget contract; those
  keys stay in the component.

## Status

Active. Promoted from the `2026-06-19-keyboard-action-system-adr` codification candidate
at the close of the campaign's first full enrollment cycle, in which every command
surface converged onto the one registry + dispatcher and the boundary held under review.

## Source

ADR `2026-06-19-keyboard-action-system-adr` and research
`2026-06-19-keyboard-action-system-research` (the scattered-handler inventory, the
Class A vs Class B split, the persistence shape-b decision). The double-fire convergence
that validated the canvas/global precedence model landed in the graph enrollment.
Sibling rules `settings-are-schema-driven-from-one-registry` (the keybindings setting is
one honest consumed setting), `dashboard-layer-ownership` and
`views-are-projections-of-one-model` (the registry/dispatcher live in platform/stores,
surfaces only contribute and consume), `bounded-by-default-for-every-accumulator` (the
override map is capped on both ends).
