---
tags:
  - '#adr'
  - '#command-palette-actions'
date: '2026-06-21'
modified: '2026-07-12'
related:
  - "[[2026-06-21-command-palette-architecture-research]]"
---

# `command-palette-actions` adr: `UI action taxonomy, shortcuts, and backend verb feed` | (**status:** `accepted`)

## Problem Statement

The palette is missing most standard UI verbs. Research F5 inventoried the gap: focus
(node / filter-field), clear-filter, expand-tree, pin/unpin, open-island, save-body /
rename / edit-mode, reveal-in-file-manager, open-in-editor, copy-path/id, neighbor-cycle /
feature-cycle, the full reload/refresh family, and the full settings surface (only theme is
reachable) all exist as live handlers or keybindings *somewhere* but are not reachable as
palette commands, and the ones that are reachable carry no inline shortcut because the
keybinding association is hand-typed rather than derived. Separately, the backend already
started the actions/shortcuts work — the engine `keybindings` setting persists a sparse
`{action_id: chord}` override map, and ops/rag verbs reach the palette through a frontend
`OPS_WHITELIST` constant — but that work was never tied through to a complete, consistent
palette.

This is the third ADR of the `command-palette-architecture` cluster. It decides *what
commands must exist* (the taxonomy), *how they bind to shortcuts* (derive, never
hand-type), and *how the backend feeds verbs* (consolidated, not extended). It builds on the
`command-palette-providers` registry (every command is a contributed descriptor) and the
`command-palette-planes` open verb (one taxonomy entry).

## Considerations

- **A canonical taxonomy.** Every interactive surface must enroll its verbs under one of a
  fixed set of families: **navigate** (open, go-to, focus-node, jump), **window** (show /
  hide / collapse rails, timeline, tabs, reset-layout), **focus** (focus-filter-field,
  focus-node, focus-region — the discrete focus verbs, distinct from the
  `keyboard-navigation` campaign's Tab/F6 *spine*), **edit/CRUD** (new / rename / save /
  close / archive a document — the document lifecycle verbs), **reload/refresh** (reindex,
  refresh-graph, restart-rag, re-fetch — backed by existing ops/rag-control verbs),
  **settings** (open settings + the schema-driven quick-toggles), **search** (open the two
  search planes), and **help** (keyboard shortcuts, about). The taxonomy is the checklist
  the providers enroll against; a surface with a verb missing from the palette is a gap to
  close, not a default.
- **Shortcuts are derived, never hand-typed (research F3, F6).** Each command's inline
  accelerator is resolved from the keymap registry by shared `id` through the live override
  map (`effectiveChord`), so the legend and the palette cannot drift from the real handler —
  the exact drift the `keyboard-shortcuts-bind-through-the-one-keymap-registry` rule fences.
  A command that should be bindable contributes a `KeybindingDef` to the registry; the
  palette reads the chord, it is never authored twice.
- **Backend feeds verbs only (the decided direction).** The command *catalog* stays
  frontend-owned. The backend contributes (a) the persisted keybinding overrides through the
  engine `keybindings` setting and (b) the operational verbs through the existing `/ops` and
  rag-control wires. No new engine endpoint and no command-manifest wire is introduced
  (`engine-read-and-infer`). "Tying the backend's attempt through to completion" means: the
  ops/rag verbs become a *contributed provider* (not a hard-coded `OPS_WHITELIST` branch in
  `buildCommands`), the reload/refresh family is wired onto the existing rag-control +
  engine ops verbs, and the keybinding overrides drive every command's displayed accelerator.
- **Reload/refresh is real and was absent.** The campaign explicitly calls out missing
  "reload commands". The verbs exist on the wire (rag reindex / watcher control via
  `/ops/rag/*`, engine-side ops) but only four are whitelisted. A reload/refresh family
  surfaces refresh-graph (re-fetch the bounded slice), reindex-vault / reindex-code,
  restart-rag, and re-fetch-settings — each routed through `appDispatcher`, confirm-guarded
  where destructive, and time-travel-gated where mutating.
- **Settings beyond theme.** Only theme is reachable from the palette. The schema-driven
  settings registry (`settings-are-schema-driven-from-one-registry`) already declares every
  setting; a settings provider can surface the boolean/enum quick-toggles as commands derived
  from that one schema, so the palette gains settings coverage without hand-authoring each.

## Constraints

- **Parent stability.** The keymap registry + dispatcher, the engine `keybindings` setting,
  the `appDispatcher` ops seam, and the settings schema are all shipped and stable. Every
  addition is a new registry entry, a new provider, or a new `KeybindingDef` — additive, no
  wire-shape change, no storage migration.
- **No new private global listeners.** Discrete focus verbs and reload verbs are Class-A
  commands in the one keymap registry, never a per-surface `window.addEventListener`
  (`keyboard-shortcuts-bind-through-the-one-keymap-registry`); within-widget arrow motion
  stays Class-B in components (the `keyboard-navigation` campaign's territory).
- **Coordinate with `keyboard-navigation`.** That campaign owns the focus *spine* (Tab/F6/
  region cycle) and registers its own region-cycle `KeybindingDef`s. This campaign's discrete
  *focus-this-thing* verbs must not duplicate those entries; the boundary is spine
  (keyboard-navigation) vs discrete-focus-command (here).
- **Honest disabled, never a lie.** A verb the backend genuinely cannot perform is removed,
  not shipped permanently disabled (`unified-action-plane`'s remove-non-capabilities
  finding); a verb that is real but inapplicable in context is disabled-with-reason.
- **Bounded + seam-routed.** Any verb list a provider derives from the corpus-free schema is
  bounded; every mutating verb dispatches through `appDispatcher`
  (`palette-ops-dispatch-through-the-seam`).

## Implementation

The taxonomy is encoded as the fixed `family` set the providers ADR already groups by,
extended to cover the full standard set (navigate / window / focus / edit / reload /
settings / search / help). Each owning surface's provider enrolls its verbs under the right
families; the research gap list (F5) is the concrete backlog of verbs to add — focus-field,
clear-filter, expand-tree, pin/unpin, open-island, save / rename / edit-mode, reveal,
open-in-editor, copy, neighbor/feature-cycle, the reload family, and the settings toggles.

Shortcut derivation: the provider attaches each command's `id`; the assembly host resolves
the effective chord from the live keymap override map (carried in `CommandContext`) and the
presentation view renders it inline. A command meant to be bindable also contributes a
`KeybindingDef` so it is rebindable and legend-listed; the two share the `id` and the chord
is authored exactly once.

The backend verb feed: an **ops provider** replaces the `OPS_WHITELIST` branch in
`buildCommands`, contributing the whitelisted core/rag verbs (and the new reload/refresh
family) as descriptors that dispatch through the seam. The whitelist remains the bounded
source of *which* verbs are exposed; the provider is how they enter the palette. A
**settings provider** derives quick-toggle commands from the served settings schema. The
keybinding overrides (engine setting) continue to flow through the existing stores binding
into `effectiveChord`, now consumed by every command's inline accelerator.

The verb-by-verb enrollment list, the new `KeybindingDef`s, the reload-family verb mapping,
and the settings-schema-to-command derivation are reference-document and plan detail.

## Rationale

The taxonomy turns "the palette is missing basically every UI action" into a finite,
enrollable checklist instead of an open-ended wish: the providers ADR gives the mechanism,
this ADR gives the *coverage contract*. Deriving shortcuts from the one keymap registry is
the standing rule, and it is what makes the inline accelerators true. Keeping the backend a
verb feeder rather than a catalog owner honors `engine-read-and-infer` and the user's chosen
direction, while still "tying together" the backend's started shortcuts/actions work — the
keybinding setting drives the accelerators, the ops/rag verbs become a provider, and the
reload family finally surfaces verbs that already exist on the wire. Removing
non-capabilities rather than shipping disabled lies follows the `unified-action-plane`
finding.

## Consequences

- **Gains.** A complete, checklist-backed UI-verb surface in Cmd+K; inline accelerators that
  cannot drift; reload/refresh and full settings coverage; the backend's keybinding + ops
  work tied through to a coherent palette; every mutating verb seam-routed and gated.
- **Costs / difficulties.** The enrollment is broad — many surfaces gain provider verbs, and
  each must be live-verified (a verb that fires the wrong intent is worse than a missing one).
  Some verbs are component-coupled today (editor save / edit-mode) and need a store-reachable
  intent before they can be enrolled. Coordinating focus verbs with the `keyboard-navigation`
  spine needs care to avoid duplicate registry entries.
- **Pitfalls.** Hand-typing an accelerator instead of deriving it re-opens legend drift. A
  reload verb not routed through the seam re-opens the bypass. A permanently-disabled verb
  implying a missing backend capability is the lie the rule forbids. Duplicating the
  keyboard-navigation campaign's region-cycle bindings would double-fire.
- **Pathways opened.** A new surface inherits the taxonomy as its enrollment checklist; the
  ops provider is the template for any future backend verb family; the settings provider
  generalizes to every schema-declared toggle.

## Codification candidates

- **Rule slug:** `palette-command-accelerators-derive-from-the-keymap-registry`.
  **Rule:** Every Cmd+K command's inline accelerator is resolved from the one keymap registry
  by shared action `id` through the effective override map; a command meant to be bindable
  contributes exactly one `KeybindingDef` and its chord is authored once, never hand-typed on
  the command — so the palette, the legend, and the live handler can never drift.

  *(Promote only after it holds across one full execution cycle; closely related to the
  existing `keyboard-shortcuts-bind-through-the-one-keymap-registry`.)*
