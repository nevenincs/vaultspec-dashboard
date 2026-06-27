---
tags:
  - '#research'
  - '#background-context-menus'
date: '2026-06-23'
modified: '2026-06-23'
related: []
---

# `background-context-menus` research: `rail and timeline background menus for the app-chrome escape hatches`

This is the named follow-up the `global-context-actions` ADR deferred (F5): give the left
rail, right rail, and timeline empty space a background context menu carrying the app-chrome
escape hatches, mirroring the graph canvas menu that already exists.

## Findings

This is the named follow-up the `global-context-actions` ADR deferred (finding F5): the
graph canvas has a background context menu, but the left rail, right rail, and timeline
empty space have none — so right-clicking "nothing" offers nothing, and the app-chrome
escape hatches (command palette, settings, keyboard shortcuts, reset layout) are reachable
only through the palette/chrome, never a background right-click.

### F1 — The canvas menu is the exact model to mirror

`frontend/src/app/stage/menus/canvasMenu.ts` registers a resolver for the `canvas` entity
kind (the empty-field background) returning camera/clear verbs with `run` lanes, sectioned
and time-travel gated like any resolver. A background menu for the rails/timeline is the
same shape: a new entity kind per background region + a resolver returning the app-chrome
verbs, registered in `registerAll`. The just-shipped global tail (Refresh) then appends to
these menus automatically (kind-agnostic), so a background right-click yields the chrome
verbs PLUS Refresh, with zero extra wiring.

### F2 — The app-chrome verbs already exist; they need shared builders

The escape hatches exist today only as palette command ids: `app:settings` (open settings),
`window:keyboard-shortcuts` (the legend), `window:reset-layout`, and the command-palette
toggle. Per `unified-action-plane` they must be authored ONCE as shared `ActionDescriptor`
builders (like `refreshDataAction`) and composed by both the palette provider AND the
background resolver, never re-implemented — otherwise the background menu drifts from the
palette. The intents behind them (open settings dialog, open palette, show shortcuts, reset
layout) are already wired in the `CommandContext.intents`; the builders wrap those intents.

### F3 — Three background surfaces, each needs an onContextMenu host

The left rail (`frontend/src/app/left/`), right rail (`frontend/src/app/right/`), and
timeline (`frontend/src/app/timeline/`) each have a background container that currently has
no `onContextMenu`. Each needs to emit a background entity on right-click at empty space —
but ONLY when the target is the background itself, not a row/mark (a right-click on a
vault-doc row must still open the vault-doc menu, not the background menu). The handler
guards on `event.target === event.currentTarget` (or a `data-rail-background` sentinel) so
row menus win.

### F4 — One kind or three?

Two viable shapes: (a) ONE `background` kind with a `region` field (left/right/timeline),
one resolver branching on region; or (b) THREE kinds (`rail-background`, etc.). The
app-chrome verbs are identical across all three backgrounds, so a single `background` kind
with an optional `region` discriminant is the lean choice — one resolver, one registration,
and the region only matters if a future region-specific verb is added.

### F5 — Accelerators derive from the registry (same discipline as Refresh)

The chrome verbs that carry chords (palette = Cmd+K, shortcuts = ?, reset-layout) surface
their accelerators in the background menu DERIVED from the keymap registry
(`palette-command-accelerators-derive-from-the-keymap-registry`), exactly as the global
tail's Refresh accelerator now does — never hand-typed.

## Open questions for the ADR

- **One `background` kind vs three.** Recommend ONE kind + optional `region` field (F4).
- **Membership of the background menu.** Command palette, settings, keyboard shortcuts,
  reset layout — and the global tail (Refresh) appends automatically. Whether to include
  rail/timeline visibility toggles (show/hide left rail, etc.) or keep it to the universal
  chrome set.
- **Background-detection guard.** `target === currentTarget` vs a `data-*-background`
  sentinel element, so a row/mark right-click never falls through to the background menu.
- **Section.** The chrome verbs sit in `navigate`/`app`; Refresh stays the trailing
  `global` tail — confirm the chrome verbs do not collide with the global section.
