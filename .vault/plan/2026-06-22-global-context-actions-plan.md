---
tags:
  - '#plan'
  - '#global-context-actions'
date: '2026-06-22'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-22-global-context-actions-adr]]'
  - '[[2026-06-22-global-context-actions-research]]'
---

# `global-context-actions` plan

### Phase `P01` - The global-tail seam and the terminal global section

Add the registry-side global-tail seam and a new terminal global section so a single registered action appends to every context menu, last, under its own divider, inheriting the time-travel gate (D1, D2).

- [x] `P01.S01` - Add a terminal global section to ACTION_SECTION_ORDER and the ActionSection type; `frontend/src/platform/actions/action.ts`.
- [x] `P01.S02` - Add registerGlobalTailActions and invoke the tail inside resolveActions after the per-kind resolution and the time-travel filter; `frontend/src/platform/actions/registry.ts`.
- [x] `P01.S03` - Confirm the menu groups and renders the global section last under its own divider; `frontend/src/stores/view/contextMenu.ts`.
- [x] `P01.S04` - Test the seam: the global tail renders last, reaches every entity kind, and inherits the time-travel gate; `frontend/src/platform/actions/registry.test.ts`.
- [x] `P01.S05` - Gate P01: run eslint, prettier, and tsc on the touched files and the registry tests; `frontend/src/platform/actions/registry.ts`.

### Phase `P02` - Refresh as one shared action across palette and keymap

Extract the light Refresh into one shared ActionDescriptor keyed on reload:refresh-data, composed by the reload palette provider and a new keybinding with a non-Mod+R chord, guarded by the dual-plane coverage test (D4).

- [x] `P02.S06` - Extract the refreshDataAction shared builder keyed on reload:refresh-data composing refreshAllEngineQueries; `frontend/src/stores/view/reloadKeybindings.ts`.
- [x] `P02.S07` - Refactor the reload command provider to compose refreshDataAction instead of the inline command; `frontend/src/stores/view/commandProviders/reloadCommandProvider.ts`.
- [x] `P02.S08` - Add the reload KeybindingDef with a non-Mod+R chord plus its registerKeyAction thunk and mount the hook at the shell; `frontend/src/stores/view/reloadKeybindings.ts`.
- [x] `P02.S09` - Add reload:refresh-data to the dual-plane action-coverage guard; `frontend/src/stores/view/actionCoverage.guard.test.ts`.
- [x] `P02.S10` - Gate P02: run eslint, prettier, tsc, and the reload and coverage tests; `frontend/src/stores/view/commandProviders/reloadCommandProvider.ts`.

### Phase `P03` - Enroll Refresh into the global tail and verify end to end

Register the shared Refresh as the sole global-tail action under the global section, then verify it surfaces on the palette, the chord, and every context menu while the heavy rag-reindex stays out of the tail (D3, D5, D6).

- [x] `P03.S11` - Register refreshDataAction as the sole global-tail action under the global section; `frontend/src/app/menus/globalTail.ts`.
- [x] `P03.S12` - Wire the global-tail registration into the menu registration entry point; `frontend/src/app/menus/registerAll.ts`.
- [x] `P03.S13` - Verify end to end: every context menu surfaces Refresh, the palette and chord fire it, and rag-reindex stays out of the tail; `frontend/src/platform/actions/registry.test.ts`.
- [x] `P03.S14` - Gate P03: run the full frontend lint gate; `frontend/src/app/menus/globalTail.ts`.

## Description

This plan implements the global-context-actions ADR: a layered context-menu model where
bespoke per-kind menus (unchanged) gain a minimal GLOBAL TAIL holding one always-on verb,
Refresh. P01 adds the seam and the terminal `global` section so a single registered action
appends to every menu, last, under its own divider, inheriting the time-travel gate. P02
turns the light Refresh (the existing `refreshAllEngineQueries` sweep, today inline in the
reload palette command) into one shared `ActionDescriptor` keyed on `reload:refresh-data`,
composed by the palette provider and a new keymap binding with a non-`Mod+R` chord, guarded
by the dual-plane coverage test. P03 enrolls that shared Refresh as the sole global-tail
action and verifies it surfaces on the palette, the chord, and every context menu while the
heavy rag-reindex stays a confirm-guarded ops verb out of the tail.

The work binds to `unified-action-plane` (Refresh is authored once and composed across the
three planes, never copied per resolver) and
`keyboard-shortcuts-bind-through-the-one-keymap-registry` (the chord is a registry
`KeybindingDef`, not a private handler). New rail/timeline background menus are out of
scope (deferred follow-up); the existing graph canvas menu is untouched.

## Steps

## Parallelization

The three Phases are sequenced: P01 (the seam + the `global` section) is a hard
predecessor of P03 (which registers an action into that section), and P02 (the shared
Refresh action) is a hard predecessor of P03 (which enrolls it). P01 and P02 touch
disjoint files (the registry/section model versus the reload provider/keybindings) and
share no interdependency, so they may be executed in parallel; P03 joins them and must
follow both. Within each Phase, the gate Step is the hard successor of the others.

## Verification

- Seam (P01): the registry tests pass - the global tail renders as the last group under
  its own divider, a registered tail action appears for every entity kind, and a
  `disabledInTimeTravel` tail action is filtered in time-travel exactly as per-kind
  actions are.
- Shared Refresh (P02): `reload:refresh-data` is one `ActionDescriptor` built once and
  composed by the palette provider and the keymap binding; the `actionCoverage` dual-plane
  guard passes with the shared id present on both planes; the chord is a registry
  `KeybindingDef` (not `Mod+R`) and fires `refreshAllEngineQueries`.
- Tail enrollment (P03): every context menu (verified across kinds) surfaces Refresh in
  the `global` section; the palette command and the chord invoke the same builder; the
  heavy rag-reindex remains a confirm-guarded ops verb and is absent from the tail.
- Gate: `just dev lint frontend` is green (eslint, prettier, tsc, tokens) and the touched
  module tests pass at each Phase gate.
- The plan is complete when every Step is closed (`- [x]`).
