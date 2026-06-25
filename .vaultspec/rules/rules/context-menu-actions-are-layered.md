---
name: context-menu-actions-are-layered
---

# A context-menu action belongs to exactly one of three layers

## Rule

Every context-menu action is authored on exactly ONE of three layers, by what its
payload depends on — never duplicated across them:

- **Bespoke per-kind resolver** (`frontend/src/platform/actions/registry.ts` +
  `app/menus/registerAll.ts`) — when the verb's payload depends on WHAT was right-clicked
  (a node, a commit, a PR): the action is built from the clicked `entity` in that kind's
  pure `(entity, ctx) => ActionDescriptor[]` resolver.
- **The one global tail** (`registerGlobalTailActions` → `resolveGlobalTail`, appended
  registry-side inside `resolveActions` AFTER per-kind resolution and BEFORE the single
  time-travel filter, rendered last under the terminal `global` section) — when the verb
  is IDENTICAL regardless of the target (Refresh data). The always-on tail is capped at
  the minimum (today: Refresh only); copy/label is still kind-specific and stays in the
  resolver.
- **The background (empty-space) menu** (`app/menus/backgroundMenu.ts` resolving the
  `background` entity via `backgroundContextMenuHandler`) — when NOTHING was clicked: the
  app-chrome escape hatches (command palette, settings, keyboard shortcuts, reset layout)
  plus the global-tail Refresh.

A verb is never forced onto a layer it does not belong to: a target-relative verb is not
a standing global-tail entry; a chrome escape-hatch is not a per-entity resolver verb; a
feature-scoped verb is not in the always-on tail. Shared verbs (the chrome escape hatches,
Refresh) are authored ONCE as a shared `ActionDescriptor` builder
(`stores/view/chromeActions.ts`, `reloadKeybindings.ts`) and COMPOSED by the planes they
are eligible for under one shared action `id`, so an accelerator and the `?` legend derive
from the keymap and cannot drift.

## Why

The `2026-06-22-global-context-actions-adr` settled this three-layer split: the prior model
re-appended "universal" actions per-resolver, so a global verb's presence and copy drifted
across kinds, and there was no single place for the always-on Refresh. The ADR's D2 attaches
the tail registry-side (inside `resolveActions`, after per-kind resolution and the
time-travel filter) so EVERY menu inherits it with the injected `ActionContext` and the same
time-travel gating — reaching 100% of menus with no per-surface bypass — and D1 gives it a
terminal `global` section so it always renders last under its own divider. D3 caps the
always-on tail at exactly one verb (Refresh) to prevent the bloat that "add it to every row"
produces; the heavier escape hatches belong to the background menu, not every entity row.
The `2026-06-23-background-context-menus-adr` then added the empty-space menu as the third
layer (the chrome escape hatches + Refresh), and the enrollment proved the load-bearing
disciplines the hard way: the keyboard-shortcuts verb shipped under two ids
(`window:keyboard-shortcuts` in the palette vs `app:keyboard-shortcuts` in the keymap), so
its `?` accelerator could not derive — fixed by composing the one shared
`showKeyboardShortcutsAction` builder under the single `app:keyboard-shortcuts` id, with the
`actionCoverage` dual-plane guard as the structural backstop. The model held across both
cycles (research → ADR → plan → execute → live-verify), which is what makes it codifiable.

## How

- **Good:** a new target-relative verb (relate, archive, open-pr) is a shared builder
  composed into the right entity kind's resolver; it reads the clicked `entity`. It is NOT
  a standing global-tail or background entry.
- **Good:** a new always-on verb that is identical for every target is added to the global
  tail via `registerGlobalTailActions` under one `id`, rendered in the `global` section; if
  it is also a chord, it composes the same `id` keybinding so the accelerator derives.
- **Good:** an app-chrome escape hatch (settings, command palette, keyboard shortcuts, reset
  layout) is authored once in `chromeActions.ts` and composed by the background menu AND its
  other eligible planes (palette, keymap) under ONE shared `id`; the background host fires it
  only on an empty-space click (`target === currentTarget`, or the timeline's SVG-aware
  predicate) so a row's own resolver always wins on a deeper target.
- **Bad:** re-appending a "universal" action inside each per-kind resolver (drifts per kind);
  putting a target-relative or feature-scoped verb in the always-on tail (bloat / wrong
  payload); hand-typing a palette accelerator that differs from the verb's keymap `id`
  (legend drift — the dual-plane guard is the backstop); a background escape-hatch
  re-implemented inline instead of composing the shared `chromeActions` builder.

## Status

Active. Promoted at the close of the `background-context-menus` cycle, after the three-layer
model (bespoke per-kind / one global tail / background empty-space menu) held across both the
`2026-06-22-global-context-actions` and `2026-06-23-background-context-menus` cycles and the
shared-id / accelerator-derivation discipline was found and fixed the hard way (the
keyboard-shortcuts two-id split). Sibling of `unified-action-plane`,
`keyboard-shortcuts-bind-through-the-one-keymap-registry`,
`palette-command-accelerators-derive-from-the-keymap-registry`,
`palette-commands-come-from-the-one-provider-registry`, and
`action-verbs-enroll-on-their-eligible-planes-by-shared-id`.

## Source

ADRs `2026-06-22-global-context-actions-adr` (D1 terminal `global` section, D2
registry-side tail attachment reaching 100% of menus, D3 tail capped at Refresh) and
`2026-06-23-background-context-menus-adr` (the empty-space menu as the third layer).
Guards: `actionCoverage.guard.test.ts` (dual-plane shared-id coverage),
`chromeActions.test.ts` (the reset-layout bridge + registry-derived accelerators),
`backgroundContextMenu.test.ts` (empty-space-target gating).
