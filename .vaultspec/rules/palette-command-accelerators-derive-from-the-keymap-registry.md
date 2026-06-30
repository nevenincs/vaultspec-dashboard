---
name: palette-command-accelerators-derive-from-the-keymap-registry
---

# Palette command accelerators derive from the keymap registry; never hand-typed

## Rule

Every Cmd+K command's inline accelerator is resolved from the one keymap registry by shared
action `id` through the effective override map (`deriveCommandAccelerators` over
`getKeybinding` + `effectiveChord` + `chordToKeycaps` in
`frontend/src/stores/view/commandPaletteCommands.ts`); a command meant to be bindable
contributes exactly one `KeybindingDef` and its chord is authored once, never typed onto the
command descriptor. The palette, the `?` legend, and the live keydown handler therefore all
read the same source and cannot drift.

## Why

The `2026-06-21-command-palette-actions-adr` requires the palette to surface the keyboard
grammar it teaches, and the standing `keyboard-shortcuts-bind-through-the-one-keymap-registry`
rule already fences chord ownership to the one registry. Hand-typing an accelerator string on
a palette command would re-open exactly the legend-vs-handler drift that rule exists to
prevent — the displayed key and the key that actually fires would be free to diverge across a
rebind or an override. Deriving the accelerator from the registry by the command's own `id`
(which is also the keybinding id and the override-map key) makes the displayed chord the same
fact as the bound chord, override-aware for free.

## How

- **Good:** a bindable command shares its `id` with a `KeybindingDef` in the registry; the
  assembly hook derives its accelerator from the live override map and the row renders it as
  keycaps. A rebind updates the palette automatically.
- **Bad:** setting `accelerator: "Ctrl+K"` literally on a `CommandDescriptor`, or maintaining
  a second hand-written shortcut list — both can drift from the real handler.

## Status

Active. Promoted at the close of the `command-palette-architecture` campaign's first full
execution cycle. Closely related to (and a palette-surface corollary of)
`keyboard-shortcuts-bind-through-the-one-keymap-registry`; sibling of
`palette-commands-come-from-the-one-provider-registry`.

## Source

ADR `2026-06-21-command-palette-actions-adr` (codification candidate) and research
`2026-06-21-command-palette-architecture-research` (F3, F6).
