---
tags:
  - '#plan'
  - '#editor-dock-workspace'
date: '2026-06-18'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-18-editor-dock-workspace-adr]]'
  - '[[2026-06-18-editor-dock-workspace-research]]'
---

# `editor-dock-workspace` plan

### Phase `P01` - Dependency and theming foundation

Add dockview as a frontend dependency and bind its --dv-* surface to the OKLCH token tier so the dock chrome is themed, not bespoke, before any workspace is built.

- [x] `P01.S01` - Add dockview to frontend dependencies and import its base stylesheet once; `frontend/package.json`.
- [x] `P01.S02` - Author the dockview theme remap binding every --dv-* variable to the OKLCH token tier for light, dark, and high-contrast; `frontend/src/app/styles.css`.

### Phase `P02` - Portal-pinned canvas seam

Mount the Pixi canvas once in a stable app-lifetime container and track a dockview placeholder rect, proving the WebGL context and SceneController survive docking and re-parenting.

- [x] `P02.S03` - Extract the Pixi canvas into a stable app-lifetime container decoupled from its current Stage DOM parent; `frontend/src/app/stage/Stage.tsx`.
- [x] `P02.S04` - Add a rect-tracking controller using getBoundingClientRect, ResizeObserver, and panel dimension events to position the fixed canvas overlay; `frontend/src/app/stage/canvasPin.ts`.
- [x] `P02.S05` - Build the graph dockview panel that renders only a transparent rect-reporting placeholder; `frontend/src/app/stage/GraphPanel.tsx`.
- [x] `P02.S06` - Verify the WebGL context and SceneController survive a dock, move, and float without re-parenting the canvas; `frontend/src/app/stage/canvasPin.test.ts`.

### Phase `P03` - Bounded tab model in the stores layer

Replace the single viewerTarget with a bounded open-document slice carrying provisional/permanent semantics, a cap, and LRU eviction, owning which content query each panel drives.

- [x] `P03.S07` - Add the bounded open-document slice with openDocs, activeDocId, and provisionalDocId plus a cap and LRU eviction; `frontend/src/stores/view/viewStore.ts`.
- [x] `P03.S08` - Implement provisional open replace-in-place and permanent promotion on double-click, edit, or drag as named seam operations; `frontend/src/stores/view/tabs.ts`.
- [x] `P03.S09` - Retire the single viewerTarget path and migrate its readers to the tab slice; `frontend/src/stores/view/viewer.ts`.
- [x] `P03.S10` - Add unit tests for the bounded slice covering cap, LRU, provisional replace, promotion, and scope-swap reset; `frontend/src/stores/view/tabs.test.ts`.

### Phase `P04` - Dock workspace host and open intents

Build the DockviewReact host with graph/markdown/code panels and the graph-right/documents-left default split, and route every open action through provisional/permanent intents.

- [x] `P04.S11` - Build the DockviewReact workspace host with the components map and onReady api wiring; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `P04.S12` - Implement the graph-right documents-left default split with group creation on first open and collapse on last close; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `P04.S13` - Wire the markdown and code panel components to their per-id useContentView query and the existing reader and viewer; `frontend/src/app/stage/DocPanel.tsx`.
- [x] `P04.S14` - Reconcile dockview geometry with the tab slice by panel id for add, remove, and activate; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `P04.S15` - Route left-rail, overview, inspector, and palette open actions through provisional single-click and permanent double-click intents; `frontend/src/app/left/browserSelection.ts`.
- [x] `P04.S16` - Replace the AppShell viewer overlay mount with the dock workspace host; `frontend/src/app/AppShell.tsx`.

### Phase `P05` - Markdown read and edit mounting with live write verification

Mount the existing editor backend as a view/edit toggle with a PROPERTIES card, save through the core verbs, and live-verify the engine to core 0.1.32 round-trip while keeping code read-only.

- [x] `P05.S17` - Add the view and edit mode toggle to the markdown panel; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [x] `P05.S18` - Build the raw-markdown editing surface bound to draftText with dirty tracking; `frontend/src/app/viewer/MarkdownEditor.tsx`.
- [x] `P05.S19` - Build the PROPERTIES card for tags, date, and related bound to the frontmatter write; `frontend/src/app/viewer/PropertiesCard.tsx`.
- [x] `P05.S20` - Wire save through the editor seam mapping the typed write result onto the status enum with conflict and refusal handling; `frontend/src/stores/server/editorMutations.ts`.
- [x] `P05.S21` - Live-verify the engine to core 0.1.32 write round-trip for save, conflict, and refusal against a fixture vault; `frontend/src/stores/server/editorMutations.test.ts`.
- [x] `P05.S22` - Restore the real write-seam tests trimmed during the mock-tautology removal; `frontend/src/stores/server/editorMutations.test.ts`.

### Phase `P06` - Workspace layout persistence

Persist and restore the serialized dock layout plus tab metadata in engine dashboard-state per scope, coalesced and size-capped, degrading cleanly to the default layout.

- [x] `P06.S23` - Add a bounded workspace_layout field to the engine dashboard-state schema with a migration; `engine/crates/vaultspec-session/src/session.rs`.
- [x] `P06.S24` - Serve and accept workspace_layout through the dashboard-state route via the shared envelope; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [x] `P06.S25` - Persist the serialized dock layout and tab metadata via the dashboard-state mutation on a coalesced layout-change event; `frontend/src/stores/server/dashboardState.ts`.
- [x] `P06.S26` - Restore the layout on load with fromJSON and rehydrate panels by id, degrading to the default layout on parse or oversize; `frontend/src/app/stage/DockWorkspace.tsx`.
- [x] `P06.S27` - Add tests for the persist and restore round-trip and the degrade-to-default path; `frontend/src/stores/server/dashboardState.test.ts`.

### Phase `P07` - Integration, gate, and verification

Wire the workspace into the shell, run the full lint gate and vitest green, and verify behaviour against the mandate without regressing the open figma-frontend-rewrite surfaces.

- [x] `P07.S28` - Run the full lint gate for frontend and the engine change to exit zero; `frontend/`.
- [x] `P07.S29` - Run the vitest suite green and fix regressions from the viewerTarget retirement; `frontend/`.
- [x] `P07.S30` - Verify behaviour against the mandate for provisional and permanent tabs, dock survival, persist and restore, edit and save, and code read-only in the live app; `frontend/`.
- [x] `P07.S31` - Confirm no regression to the open figma-frontend-rewrite surfaces and reconcile the shared AppShell touch; `frontend/src/app/AppShell.tsx`.

## Description

Build the dockable tabbed editor workspace decided in the `editor-dock-workspace` ADR:
replace the single-document, full-cover viewer overlay with a `dockview` 6.6.1 workspace
inside the stage column, default graph-right / documents-left, fully walkable, tabbable,
movable, and hot-dockable, with VS Code-style provisional/permanent tabs, full Markdown
read+edit (code read-only), and a layout persisted in engine dashboard-state. The work is
sequenced by risk: theming foundation first (`P01`), then the load-bearing portal-pinned
canvas seam that keeps the Pixi WebGL context and the `SceneController` alive across
docking (`P02`), then the bounded tab model in the stores layer (`P03`), then the dock
workspace host and open intents (`P04`), then mounting the already-built editor backend as
a live-verified edit mode (`P05`), then persistence (`P06`), then integration and the full
gate (`P07`). Every part holds the four-layer law: tab/dock state is bounded view-local
state, the host and canvas seam are dumb `app/` chrome over the unchanged stores and
`SceneController` contracts, content still flows through the single `useContentView` query,
and writes still route through `/ops/core/*` to `vaultspec-core`. The editor backend
(`document-editor-backend`, audit PASS) is mounted, not rebuilt, now that core 0.1.32 ships
the edit verbs.

## Steps

## Parallelization

Phases carry mostly hard ordering because each builds on the prior layer. `P01` (deps and
theming) is the precondition for everything and lands first. `P02` (portal-pinned canvas)
and `P03` (the stores tab slice) are independent of each other and MAY run in parallel:
`P02` touches the scene/canvas seam, `P03` touches the stores layer, with no shared files.
`P04` (the dock host) depends on BOTH `P02` and `P03` (it mounts the graph panel from `P02`
and reconciles geometry against the slice from `P03`) and must follow them. `P05` (editor
mounting) depends on `P04` (the markdown panel must exist to gain an edit mode) but its
sub-work splits: the live write verification and test restoration (`S21`, `S22`) are
independent of the edit-UI steps (`S17`-`S20`) and may proceed alongside them. `P06`
(persistence) depends on `P04` (a workspace to serialize) and its engine steps (`S23`,
`S24`) may be built in parallel with the `P05` editor work since they share no files. `P07`
(integration and gate) is strictly last. Within a phase, steps that touch the same file
(`DockWorkspace.tsx` in `P04`) are sequential; steps on distinct files may parallelize.

## Verification

The plan is complete when every Step is closed and these criteria hold:

- Opening a document single-click shows one provisional (preview) tab that the next
  single-click open replaces in place; double-click (or an edit) promotes it to a permanent
  tab; multiple permanent tabs coexist. Proven by the `tabs.test.ts` unit suite.
- The graph is a dockview panel that can be moved, split, floated, and re-docked, and its
  Pixi WebGL context and `SceneController` survive every such operation with no reload or
  blank canvas. Proven by the `canvasPin` survival check and live observation.
- The default layout is graph-right / documents-left; closing the last document returns the
  graph to full width.
- The dock layout plus tab metadata persist to engine dashboard-state and restore on
  reload; an unparseable or oversize blob degrades to the default layout, never an error.
  Proven by the `dashboardState.test.ts` round-trip and degrade tests.
- A Markdown document opens in a view/edit toggle; editing the body and the PROPERTIES card
  and saving round-trips to `vaultspec-core` 0.1.32 with honest conflict and refusal
  handling; the code viewer has no edit affordance. Proven by the restored live write-seam
  tests against a fixture vault.
- The open-document set is bounded (cap + LRU); content flows only through `useContentView`;
  no `app/` or `scene/` surface adds a `fetch` or reads raw `tiers`; dockview is themed only
  by the `--dv-*` to OKLCH remap.
- `just dev lint frontend` (and `just dev lint all` for the engine change) exits 0 including
  prettier and rustfmt, the vitest suite is green, and the open `figma-frontend-rewrite`
  surfaces are not regressed.
- A `vaultspec-code-review` pass over the completed work returns PASS (revisions landed).
