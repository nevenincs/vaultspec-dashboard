---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S40'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the command palette from its binding frame over the preserved command registry

## Scope

- `frontend/src/app/palette/CommandPalette.tsx`

## Description

- Rebuilt the Ctrl/Cmd-K command palette faithfully to its binding Figma frame (17:1320) on the canonical Figma role-named type scale and radius/elevation, migrating the panel, the family headings, the result rows, and the shortcut-hint badge from the legacy alias shims.
- Migrated the panel to `rounded-fg-lg` + `shadow-fg-popover` (the modal/popover elevation step), the family headings and the shortcut-hint badge to `text-caption`, the result row to `rounded-r-fg-xs`, and the hint badge to `rounded-fg-xs`.
- Updated the header comment to name the canonical `shadow-fg-popover` elevation step in place of the prior `shadow-deep` alias.
- Left the palette's behavior and layer boundary unchanged: it is a dumb projection over the preserved command registry (`buildCommands` over the engine-enumerated feature/lens vocabulary and the ops whitelist), routes every ops verb through the `dispatchOps` seam, surfaces degradation inline, and never fetches or reads the raw tiers block.

## Outcome

The command palette now renders on the canonical Figma role-named type scale and radius/elevation foundation while staying a dumb projection over the committed command primitives. The full keyboard contract (combobox/listbox/option ARIA, focus trap, focus restore, arm-to-confirm on ops verbs, time-travel gating, live region) is unchanged. The palette's 23 tests (build/filter/group plus the interactive a11y/keyboard/confirm suite) pass, and the file is eslint-clean and prettier-clean.

## Notes

The live-status dot keeps `rounded-full` (a perfect circle, not the pill token) by design. The side-specific `rounded-r-fg-xs` mirrors the prior `rounded-r-vs-sm` form and resolves through the same Tailwind radius namespace; the rendering tests exercise it without error. The shared worktree's concurrent uncommitted scene WIP still fails the full-tree eslint/tsc steps, outside this scope and not introduced here.
