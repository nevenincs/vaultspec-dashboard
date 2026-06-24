---
tags:
  - '#adr'
  - '#background-context-menus'
date: '2026-06-23'
modified: '2026-06-23'
related:
  - "[[2026-06-23-background-context-menus-research]]"
  - "[[2026-06-22-global-context-actions-adr]]"
---



# `background-context-menus` adr: `background context menus for the rail and timeline app-chrome escape hatches` | (**status:** `accepted`)

## Problem Statement

The `global-context-actions` ADR deferred (F5) the rail/timeline background menus. Today only
the graph canvas answers a right-click on empty space; the left rail, right rail, and timeline
backgrounds offer nothing, and the app-chrome escape hatches (command palette, settings,
keyboard shortcuts, reset layout) live only behind the palette/chrome. This ADR brings those
backgrounds into the unified action plane as the third layer the global-context-actions model
named: bespoke per-kind menus on rows, the global tail on every menu, and now a background
menu for empty space.

## Considerations

The canvas menu (`canvasMenu.ts`, registered for the `canvas` kind) is the exact model: a
resolver keyed on a background entity kind, returning verbs with `run` lanes, sectioned and
time-travel gated. The new background menus mirror it. Because the just-shipped global tail is
kind-agnostic, Refresh appends to a background menu automatically — the background resolver
need only contribute the chrome verbs.

The chrome verbs already exist as palette command ids (`app:settings`,
`window:keyboard-shortcuts`, `window:reset-layout`, the palette toggle) over intents already
wired in `CommandContext.intents`. Per `unified-action-plane` they become shared
`ActionDescriptor` builders composed by BOTH the palette and the background resolver, so the
two surfaces cannot drift; their accelerators derive from the keymap registry
(`palette-command-accelerators-derive-from-the-keymap-registry`), like Refresh's.

## Constraints

No frontier risk — this composes mature in-tree machinery (the resolver registry, the canvas
menu pattern, the `CommandContext.intents`, the keymap registry, the global tail just shipped
by `global-context-actions`, which is the load-bearing parent and is verified live). The one
real hazard is event-target discrimination: a right-click on a row/mark must open that row's
bespoke menu, never fall through to the background menu. This is solved with an explicit
`data-*-background` sentinel host so only a right-click whose target IS the background element
emits the background entity.

## Implementation

- **D1 — One `background` entity kind, optional `region`.** A single `BackgroundEntity {kind:
  "background", id, region?: "left-rail" | "right-rail" | "timeline"}` with one resolver,
  rather than three kinds. The chrome verb set is identical across regions, so region is
  carried only for future region-specific verbs and for telemetry/labels.
- **D2 — Membership: the universal chrome set.** The background menu offers: open command
  palette, open settings, show keyboard shortcuts, reset layout. The global tail appends
  Refresh automatically. Region-specific visibility toggles (show/hide a given rail) are NOT
  included — the rails own those affordances, and the background menu stays the universal
  escape-hatch set, not a per-region control panel.
- **D3 — Shared builders.** Each chrome verb is one `ActionDescriptor` builder (e.g.
  `openSettingsAction`, `openCommandPaletteAction`, `showKeyboardShortcutsAction`,
  `resetLayoutAction`) composed by both the palette provider and the background resolver;
  accelerators derive from the keymap registry. `reset layout` is a layout MUTATION, so it
  carries `disabledInTimeTravel` (consistent with the canvas clear verbs).
- **D4 — Background hosts.** The left rail, right rail, and timeline background containers
  carry a `data-*-background` sentinel and an `onContextMenu` that emits the `background`
  entity with the region ONLY when `event.target` is the sentinel (empty space), so a row or
  mark right-click resolves to its own bespoke menu.
- **D5 — Sections.** Chrome verbs render in `navigate`/`app`; Refresh stays the trailing
  `global` tail, so the background menu reads chrome-verbs-then-Refresh under the global
  divider — consistent with every other menu.

## Rationale

This is the `global-context-actions` three-layer model completed: the background layer it
named but deferred. Mirroring the canvas menu keeps a new surface from inventing a parallel
mechanism, and composing the chrome verbs as shared builders (rather than re-implementing the
palette's run handlers) is the `unified-action-plane` discipline that keeps the background menu
and the palette in lockstep. The sentinel-based target guard is the robust answer to the one
real failure mode (a row right-click falling through), chosen over `target === currentTarget`
because nested row markup can make `currentTarget` checks brittle.

## Consequences

- **Gains.** Right-clicking empty rail/timeline space now offers the escape hatches; the
  chrome verbs become rebindable, palette-, and background-reachable from one definition;
  the global-context-actions three-layer model is complete and documented.
- **Difficulties / pitfalls.** The target-discrimination guard must be correct or the
  background menu shadows row menus — the sentinel approach plus a guard test is the
  mitigation. Adding three new `onContextMenu` hosts touches three surface components
  (left/right/timeline), each a small, isolated edit. The new `background` kind widens the
  entity union (and the per-kind resolver count), but that is the intended growth.
- **Pathways opened.** The shared chrome-verb builders are reusable anywhere (a future
  "more" overflow menu, an empty-state CTA); the `region` field leaves room for a
  region-specific background verb without a new kind.

## Codification candidates


