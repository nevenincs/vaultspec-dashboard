---
tags:
  - '#plan'
  - '#dashboard-context-menus'
date: '2026-06-15'
modified: '2026-06-15'
tier: L3
related:
  - '[[2026-06-15-dashboard-context-menus-adr]]'
  - '[[2026-06-15-dashboard-context-menus-research]]'
  - '[[2026-06-14-dashboard-command-palette-adr]]'
---








# `dashboard-context-menus` plan

Build one standardised, project-wide context-menu system as app-chrome over the existing dispatch backend, making actions a native React concept across all four regions.

## Description

This plan implements the `dashboard-context-menus` ADR: a single in-place action surface
that standardises the commands, the command backend, the state system, and the per-surface
information context across the dashboard, and introduces actions as the native verb unit of
the React stack. It inherits the command-palette ADR's laws (object-then-action grammar,
dispatch through the `appDispatcher` seam, arm-to-confirm for destructive verbs, time-travel
gating, the focus-trap and live-region a11y contract) and the base design-language and
iconography ADRs (semantic elevation tier, motion law, Lucide and Phosphor mark split).

The work reuses, generalises, and projects rather than building a parallel engine. `W01`
delivers the spine: the shared Action descriptor promoted from `PaletteCommand`, the entity
descriptor union, the resolver registry keyed by entity kind, the menu open-state slice, and
the floating menu host. `W02` registers the new terminal verb families (copy, reveal,
open-in-editor) on the seam and makes time-travel gating a property of the descriptor. `W03`
and `W04` contribute the per-surface pure resolvers and wire each entity's right-click and
keyboard entry across the DOM regions and the graph stage (with its one additive scene
right-click seam). `W05` proves the a11y contract and the seam discipline with tests and
closes the gate. No new model, engine endpoint, or wire client is introduced.

## Wave `W01` - platform foundation: action descriptor, menu state, menu host

Deliver the reusable spine - the shared Action descriptor generalised from PaletteCommand, the menu open-state slice, the resolver registry, and the menu host surface (portal, positioning, dismiss, focus trap/restore, a11y). All later waves depend on this; backed by the context-menus ADR and the command-palette ADR.


### Phase `W01.P01` - shared Action descriptor and resolver registry

Promote PaletteCommand into a shared Action descriptor type and a resolver registry keyed by entity kind; refactor the palette to consume it so the two surfaces cannot drift.

- [x] `W01.P01.S01` - Define the shared Action descriptor type (id, label, section, icon, run or actionType, confirm, disabled, disabledInTimeTravel, accelerator); `frontend/src/platform/actions/action.ts`.
- [x] `W01.P01.S02` - Define the EntityDescriptor union covering every surface entity kind; `frontend/src/platform/actions/entity.ts`.
- [x] `W01.P01.S03` - Implement the resolver registry keyed by entity kind; `frontend/src/platform/actions/registry.ts`.
- [x] `W01.P01.S04` - Refactor the command palette to consume the shared Action descriptor; `frontend/src/app/palette/CommandPalette.tsx`.
- [x] `W01.P01.S05` - Unit-test the descriptor and resolver registry; `frontend/src/platform/actions/registry.test.ts`.

### Phase `W01.P02` - menu open-state slice

Add the global-singleton menu open-state concept (open, anchor, descriptor, items, armedItemId) in the view-store layer with open/close/disarm transitions.

- [x] `W01.P02.S06` - Add the menu open-state slice (open, anchor, descriptor, items, armedItemId); `frontend/src/stores/view/contextMenu.ts`.
- [x] `W01.P02.S07` - Implement open, close, and disarm transitions with a single-instance guard; `frontend/src/stores/view/contextMenu.ts`.
- [x] `W01.P02.S08` - Unit-test the menu slice transitions; `frontend/src/stores/view/contextMenu.test.ts`.

### Phase `W01.P03` - menu host surface

Build the floating menu-host app-chrome component: portal, pointer/keyboard positioning with viewport flip/clamp, light-dismiss, focus trap and restore, sectioned rendering, item states, motion, and the role=menu a11y contract.

- [x] `W01.P03.S09` - Build the floating menu-host portal with anchored positioning; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `W01.P03.S10` - Implement viewport flip and clamp plus scroll and resize dismiss; `frontend/src/app/menu/position.ts`.
- [x] `W01.P03.S11` - Implement light-dismiss on outside click, Escape, blur, and route change; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `W01.P03.S12` - Add focus trap and focus restore reusing the palette focusables helper; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `W01.P03.S13` - Render sectioned items with marks, accelerators, and item states; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `W01.P03.S14` - Wire arm-to-confirm for destructive items via useConfirmable; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `W01.P03.S15` - Add the role=menu a11y contract and polite live region; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [x] `W01.P03.S16` - Mount the menu host once in the app shell; `frontend/src/app/AppShell.tsx`.
- [x] `W01.P03.S17` - Render-test the menu host surface; `frontend/src/app/menu/ContextMenuHost.render.test.tsx`.

## Wave `W02` - verb families and gating: clipboard, reveal, open-in-editor, time-travel gate

Register the new terminal verb families on the appDispatcher seam (copy/reveal/open-in-editor) with a whitelist, and make time-travel gating a property of the Action descriptor applied by every resolver. Depends on W01; gates the per-surface menus in W03/W04.

### Phase `W02.P04` - clipboard and identity copy verbs

Register a copy terminal verb family on the seam for ids, titles, paths, stems, and summaries, whitelisted like ops.

- [x] `W02.P04.S18` - Register the copy terminal verb family on the appDispatcher seam; `frontend/src/platform/actions/clipboardActions.ts`.
- [x] `W02.P04.S19` - Define the copy whitelist (id, title, path, stem, summary); `frontend/src/platform/actions/clipboardActions.ts`.
- [x] `W02.P04.S20` - Unit-test the copy handler dispatch; `frontend/src/platform/actions/clipboardActions.test.ts`.

### Phase `W02.P05` - host-shell reveal and open-in-editor verbs

Register reveal-in-host and open-in-editor terminal verbs that degrade honestly when unavailable in a pure web context.

- [x] `W02.P05.S21` - Register the reveal-in-host terminal verb with honest degradation; `frontend/src/platform/actions/shellActions.ts`.
- [x] `W02.P05.S22` - Register the open-in-editor terminal verb with honest degradation; `frontend/src/platform/actions/shellActions.ts`.
- [x] `W02.P05.S23` - Unit-test shell-verb availability and degraded states; `frontend/src/platform/actions/shellActions.test.ts`.

### Phase `W02.P06` - time-travel gating on the descriptor

Express the time-travel gate as a descriptor flag applied uniformly by every resolver, replacing per-surface re-derivation.

- [x] `W02.P06.S24` - Add disabledInTimeTravel handling to the Action descriptor; `frontend/src/platform/actions/action.ts`.
- [x] `W02.P06.S25` - Apply the time-travel gate uniformly in the resolver registry pipeline; `frontend/src/platform/actions/registry.ts`.
- [x] `W02.P06.S26` - Unit-test that gating removes mutating actions in time-travel; `frontend/src/platform/actions/registry.test.ts`.

## Wave `W03` - DOM surface menus: left rail, right rail, timeline

Wire onContextMenu and the keyboard Menu-key entry plus a pure per-surface resolver for each DOM region entity (workspace, worktree, vault-doc, code-file; node, edge, event, search-result, changed-file/diff; timeline event-mark). Depends on W01/W02; parallel to W04.

### Phase `W03.P07` - left rail resolvers and entry wiring

Resolvers plus onContextMenu and Menu-key entry for workspace, worktree, vault-document, and code-file/dir rows.

- [x] `W03.P07.S27` - Implement the workspace entity resolver; `frontend/src/app/left/menus/workspaceMenu.ts`.
- [x] `W03.P07.S28` - Implement the worktree entity resolver; `frontend/src/app/left/menus/worktreeMenu.ts`.
- [x] `W03.P07.S29` - Implement the vault-document entity resolver; `frontend/src/app/left/menus/vaultDocMenu.ts`.
- [x] `W03.P07.S30` - Implement the code-file and directory entity resolver; `frontend/src/app/left/menus/codeFileMenu.ts`.
- [x] `W03.P07.S31` - Wire onContextMenu and Menu-key entry on workspace and worktree rows; `frontend/src/app/left/WorktreePicker.tsx`.
- [x] `W03.P07.S32` - Wire onContextMenu and Menu-key entry on vault-browser and code-tree rows; `frontend/src/app/left/VaultBrowser.tsx`.
- [x] `W03.P07.S33` - Unit-test the left-rail resolvers; `frontend/src/app/left/menus/leftMenus.test.ts`.

### Phase `W03.P08` - right rail resolvers and entry wiring

Resolvers plus entry wiring for inspector node, edge row, event, search result, and changed-file/diff-hunk.

- [x] `W03.P08.S34` - Implement the inspector node entity resolver; `frontend/src/app/right/menus/nodeMenu.ts`.
- [x] `W03.P08.S35` - Implement the edge entity resolver; `frontend/src/app/right/menus/edgeMenu.ts`.
- [x] `W03.P08.S36` - Implement the event entity resolver; `frontend/src/app/right/menus/eventMenu.ts`.
- [x] `W03.P08.S37` - Implement the search-result entity resolver; `frontend/src/app/right/menus/searchResultMenu.ts`.
- [x] `W03.P08.S38` - Implement the changed-file and diff-hunk entity resolver; `frontend/src/app/right/menus/changeMenu.ts`.
- [x] `W03.P08.S39` - Wire onContextMenu and Menu-key entry on inspector, search, and changes rows; `frontend/src/app/right/Inspector.tsx`.
- [x] `W03.P08.S40` - Unit-test the right-rail resolvers; `frontend/src/app/right/menus/rightMenus.test.ts`.

### Phase `W03.P09` - timeline resolver and entry wiring

Resolver plus entry wiring for the timeline event mark.

- [x] `W03.P09.S41` - Implement the timeline event-mark entity resolver; `frontend/src/app/timeline/menus/eventMarkMenu.ts`.
- [x] `W03.P09.S42` - Wire onContextMenu and Menu-key entry on timeline event marks; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W03.P09.S43` - Unit-test the timeline resolver; `frontend/src/app/timeline/menus/eventMarkMenu.test.ts`.

## Wave `W04` - graph stage menus and scene right-click seam

Add the additive context-menu SceneEvent variant, emit it from the PixiJS field on node/edge right-click, consume it in Stage, and resolve graph node/meta-edge/island/empty-canvas menus. Depends on W01/W02; parallel to W03.

### Phase `W04.P10` - scene right-click seam

Add the additive context-menu SceneEvent variant and emit it from the PixiJS field on node/edge right-click; consume it in Stage to open the menu slice.

- [x] `W04.P10.S44` - Add the context-menu SceneEvent variant to the scene event union; `frontend/src/scene/sceneController.ts`.
- [x] `W04.P10.S45` - Emit the context-menu event from the PixiJS field on node and edge right-click; `frontend/src/scene/field/interaction.ts`.
- [x] `W04.P10.S46` - Consume the context-menu event in Stage to open the menu slice; `frontend/src/app/stage/Stage.tsx`.
- [x] `W04.P10.S47` - Contract-test the scene right-click event flow; `frontend/src/scene/sceneController.test.ts`.

### Phase `W04.P11` - graph entity resolvers

Resolvers for graph node, meta-edge, island interior, and empty-canvas, including the empty-canvas DOM onContextMenu.

- [x] `W04.P11.S48` - Implement the graph node entity resolver; `frontend/src/app/stage/menus/graphNodeMenu.ts`.
- [x] `W04.P11.S49` - Implement the meta-edge entity resolver; `frontend/src/app/stage/menus/metaEdgeMenu.ts`.
- [x] `W04.P11.S50` - Implement the island-interior entity resolver; `frontend/src/app/islands/menus/islandMenu.ts`.
- [x] `W04.P11.S51` - Implement the empty-canvas resolver and DOM onContextMenu; `frontend/src/app/stage/menus/canvasMenu.ts`.
- [x] `W04.P11.S52` - Unit-test the graph entity resolvers; `frontend/src/app/stage/menus/graphMenus.test.ts`.

## Wave `W05` - hardening: a11y, reduced-motion, tests, lint gate, docs

Prove the a11y contract and seam discipline with tests (resolver units, interactive menu, seam-transit, time-travel gate), pass the full lint gate, and close the feature index. Depends on all prior waves.

### Phase `W05.P12` - a11y, tests, and gate closure

Resolver unit tests, interactive menu tests, seam-transit and time-travel-gate assertions, full lint gate, and feature index closure.

- [x] `W05.P12.S53` - Add the interactive menu test (open, keyboard nav, dismiss, focus restore); `frontend/src/app/menu/ContextMenuHost.interactive.test.tsx`.
- [x] `W05.P12.S54` - Add the seam-transit test asserting menu mutations dispatch through appDispatcher; `frontend/src/app/menu/seamTransit.test.ts`.
- [x] `W05.P12.S55` - Add the cross-surface time-travel-gate integration test; `frontend/src/app/menu/timeTravelGate.test.ts`.
- [x] `W05.P12.S56` - Run the full frontend lint gate and fix to exit 0; `frontend/`.
- [x] `W05.P12.S57` - Regenerate the feature index; `.vault/index/dashboard-context-menus.index.md`.

## Parallelization

Waves are sequenced by default. `W01` (the spine) is a hard prerequisite for everything:
no resolver, verb family, or surface wiring can land before the shared `Action` descriptor,
the resolver registry, the menu slice, and the menu host exist. `W02` depends on `W01` and
must precede the per-surface waves so resolvers can reference the copy/reveal/open-in-editor
verbs and the descriptor-level time-travel gate.

`W03` (DOM surfaces) and `W04` (graph stage) are mutually independent and may run in
parallel once `W01` and `W02` land - they touch disjoint files and share only the inherited
spine. Within `W03`, the three phases (left rail, right rail, timeline) are independent and
parallelizable; within `W04`, the scene seam phase `W04.P10` must precede the graph resolver
phase `W04.P11` because the resolvers are reached only through the new right-click event.
Within any phase, the resolver steps are independent of one another and may be parallelized;
the entry-wiring step depends on its phase's resolvers existing. `W05` (hardening) is last
and depends on every prior wave.

## Verification

The plan is complete when every Step is closed (`- [x]`) and:

- The full frontend lint gate (`just dev lint frontend`: eslint + prettier + tsc) exits 0,
  per the declaring-green discipline (`W05.P12.S56`).
- All unit and interactive tests pass: the descriptor/registry units, the menu-slice
  transitions, each surface's resolver units, the interactive menu test (open, keyboard nav,
  dismiss, focus restore), and the contract test for the scene right-click event flow.
- The seam-transit test proves every menu mutation dispatches through `appDispatcher` and no
  menu path calls `engineClient` directly (`W05.P12.S54`).
- The cross-surface time-travel-gate test proves mutating actions are removed from every
  surface's menu in time-travel mode (`W05.P12.S55`).
- The command palette consumes the shared `Action` descriptor (no second command shape
  remains) and continues to pass its existing unit and interactive tests.
- A context menu opens by right-click and by the keyboard (`Menu`/`Shift+F10`) on a focused
  entity in each of the four regions, renders sectioned actions, and restores focus on close.
- The feature index regenerates clean and `vaultspec-core vault check all` stays green.
