---
tags:
  - '#plan'
  - '#background-context-menus'
date: '2026-06-23'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-23-background-context-menus-adr]]'
  - '[[2026-06-23-background-context-menus-research]]'
---

# `background-context-menus` plan

### Phase `P01` - The background entity, shared chrome-verb builders, and resolver

Add the background entity kind, author the app-chrome verbs as shared ActionDescriptor builders composed by both the palette and the new background resolver, and register the resolver (D1, D2, D3, D5).

- [x] `P01.S01` - Add the BackgroundEntity kind with an optional region field to the entity union, ENTITY_KINDS, and the normalizer; `frontend/src/platform/actions/entity.ts`.
- [x] `P01.S02` - Author the app-chrome verbs as shared ActionDescriptor builders over their module-level intents with registry-derived accelerators; `frontend/src/app/menus/chromeActions.ts`.
- [x] `P01.S03` - Create the background resolver composing the chrome builders and register it for the background kind; `frontend/src/app/menus/backgroundMenu.ts`.
- [x] `P01.S04` - Compose the shared chrome builders into the palette providers so the palette and background menu cannot drift; `frontend/src/stores/view/commandProviders/opsCommandProvider.ts`.
- [x] `P01.S05` - Wire the background resolver into the menu registration entry point; `frontend/src/app/menus/registerAll.ts`.
- [x] `P01.S06` - Test the background resolver, the shared builders, and the entity normalizer; `frontend/src/app/menus/backgroundMenu.test.ts`.
- [x] `P01.S07` - Gate P01: run eslint, prettier, tsc, and the new tests; `frontend/src/app/menus/backgroundMenu.ts`.

### Phase `P02` - Wire the rail and timeline background hosts and verify

Attach a sentinel-guarded onContextMenu to the left-rail, right-rail, and timeline backgrounds so empty-space right-clicks emit the background entity while row/mark menus still win, then verify live (D4).

- [x] `P02.S08` - Attach a sentinel-guarded onContextMenu to the left-rail background emitting the background entity at empty space; `frontend/src/app/left/LeftRail.tsx`.
- [x] `P02.S09` - Attach a sentinel-guarded onContextMenu to the right-rail background emitting the background entity at empty space; `frontend/src/app/right/RightRail.tsx`.
- [x] `P02.S10` - Attach a sentinel-guarded onContextMenu to the timeline background emitting the background entity at empty space; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `P02.S11` - Add a guard test that a row or mark right-click resolves to its bespoke menu, never the background menu; `frontend/src/app/menus/backgroundMenu.test.ts`.
- [x] `P02.S12` - Gate P02: run the full frontend lint gate and live-verify the three background menus; `frontend/src/app/menus/backgroundMenu.ts`.

## Description

This plan implements the background-context-menus ADR: the third layer of the
global-context-actions model. P01 adds a single `background` entity kind (with an optional
region field), authors the four app-chrome verbs (command palette, settings, keyboard
shortcuts, reset layout) as shared `ActionDescriptor` builders composed by BOTH the palette
and a new background resolver, and registers the resolver - so the chrome verbs cannot drift
across the two surfaces and their accelerators derive from the keymap registry. The global
tail (Refresh) appends to the background menu automatically. P02 wires a sentinel-guarded
`onContextMenu` onto the left-rail, right-rail, and timeline backgrounds so an empty-space
right-click emits the background entity while a row/mark right-click still resolves to its
bespoke menu, then verifies the three menus live.

The work binds to `unified-action-plane` (chrome verbs authored once, composed everywhere),
`keyboard-shortcuts-bind-through-the-one-keymap-registry` and
`palette-command-accelerators-derive-from-the-keymap-registry` (accelerators), and mirrors
the existing `canvasMenu` background pattern. It depends on the just-shipped global-tail seam.

## Steps

## Parallelization

P01 (the entity, builders, resolver) is a hard predecessor of P02 (which emits the entity
from the hosts). Within P01 the three host-independent steps (entity, builders, resolver) can
proceed together but converge before the registration + tests + gate. Within P02 the three
host wirings (left rail, right rail, timeline) touch disjoint files and may be parallelized;
the guard test and the gate are hard successors.

## Verification

- Builders (P01): each chrome verb is ONE shared `ActionDescriptor` built once and composed by
  both the palette provider and the background resolver under the same id; accelerators derive
  from the keymap registry; `reset layout` carries `disabledInTimeTravel`.
- Resolver (P01): `resolveActions` on a `background` entity returns the four chrome verbs PLUS
  the appended global-tail Refresh, in correct section order under the global divider.
- Hosts (P02): right-clicking empty space in each of the three regions opens the background
  menu; a right-click on a row/mark in the same region opens that row's bespoke menu (the
  sentinel guard holds) - covered by a guard test AND live-verified in the browser.
- Gate: `just dev lint frontend` green (eslint, prettier, tsc, tokens) and the touched-module
  tests pass at each phase gate.
- The plan is complete when every Step is closed (`- [x]`).
