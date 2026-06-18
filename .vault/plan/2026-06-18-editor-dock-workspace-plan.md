---
tags:
  - '#plan'
  - '#editor-dock-workspace'
date: '2026-06-18'
modified: '2026-06-18'
tier: L2
related:
  - '[[2026-06-18-editor-dock-workspace-adr]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace editor-dock-workspace with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `editor-dock-workspace` plan

### Phase `P01` - Dependency and theming foundation

Add dockview as a frontend dependency and bind its --dv-* surface to the OKLCH token tier so the dock chrome is themed, not bespoke, before any workspace is built.


<!-- One-line headline summary plan. -->

- [x] `P01.S01` - Add dockview to frontend dependencies and import its base stylesheet once; `frontend/package.json`.
- [x] `P01.S02` - Author the dockview theme remap binding every --dv-* variable to the OKLCH token tier for light, dark, and high-contrast; `frontend/src/app/styles.css`.

### Phase `P02` - Portal-pinned canvas seam

Mount the Pixi canvas once in a stable app-lifetime container and track a dockview placeholder rect, proving the WebGL context and SceneController survive docking and re-parenting.

- [x] `P02.S03` - Extract the Pixi canvas into a stable app-lifetime container decoupled from its current Stage DOM parent; `frontend/src/app/stage/Stage.tsx`.
- [x] `P02.S04` - Add a rect-tracking controller using getBoundingClientRect, ResizeObserver, and panel dimension events to position the fixed canvas overlay; `frontend/src/app/stage/canvasPin.ts`.
- [x] `P02.S05` - Build the graph dockview panel that renders only a transparent rect-reporting placeholder; `frontend/src/app/stage/GraphPanel.tsx`.
- [ ] `P02.S06` - Verify the WebGL context and SceneController survive a dock, move, and float without re-parenting the canvas; `frontend/src/app/stage/canvasPin.test.ts`.

### Phase `P03` - Bounded tab model in the stores layer

Replace the single viewerTarget with a bounded open-document slice carrying provisional/permanent semantics, a cap, and LRU eviction, owning which content query each panel drives.

- [x] `P03.S07` - Add the bounded open-document slice with openDocs, activeDocId, and provisionalDocId plus a cap and LRU eviction; `frontend/src/stores/view/viewStore.ts`.
- [x] `P03.S08` - Implement provisional open replace-in-place and permanent promotion on double-click, edit, or drag as named seam operations; `frontend/src/stores/view/tabs.ts`.
- [ ] `P03.S09` - Retire the single viewerTarget path and migrate its readers to the tab slice; `frontend/src/stores/view/viewer.ts`.
- [x] `P03.S10` - Add unit tests for the bounded slice covering cap, LRU, provisional replace, promotion, and scope-swap reset; `frontend/src/stores/view/tabs.test.ts`.

### Phase `P04` - Dock workspace host and open intents

Build the DockviewReact host with graph/markdown/code panels and the graph-right/documents-left default split, and route every open action through provisional/permanent intents.

- [ ] `P04.S11` - Build the DockviewReact workspace host with the components map and onReady api wiring; `frontend/src/app/stage/DockWorkspace.tsx`.
- [ ] `P04.S12` - Implement the graph-right documents-left default split with group creation on first open and collapse on last close; `frontend/src/app/stage/DockWorkspace.tsx`.
- [ ] `P04.S13` - Wire the markdown and code panel components to their per-id useContentView query and the existing reader and viewer; `frontend/src/app/stage/DocPanel.tsx`.
- [ ] `P04.S14` - Reconcile dockview geometry with the tab slice by panel id for add, remove, and activate; `frontend/src/app/stage/DockWorkspace.tsx`.
- [ ] `P04.S15` - Route left-rail, overview, inspector, and palette open actions through provisional single-click and permanent double-click intents; `frontend/src/app/left/browserSelection.ts`.
- [ ] `P04.S16` - Replace the AppShell viewer overlay mount with the dock workspace host; `frontend/src/app/AppShell.tsx`.

### Phase `P05` - Markdown read and edit mounting with live write verification

Mount the existing editor backend as a view/edit toggle with a PROPERTIES card, save through the core verbs, and live-verify the engine to core 0.1.32 round-trip while keeping code read-only.

- [ ] `P05.S17` - Add the view and edit mode toggle to the markdown panel; `frontend/src/app/viewer/MarkdownReader.tsx`.
- [ ] `P05.S18` - Build the raw-markdown editing surface bound to draftText with dirty tracking; `frontend/src/app/viewer/MarkdownEditor.tsx`.
- [ ] `P05.S19` - Build the PROPERTIES card for tags, date, and related bound to the frontmatter write; `frontend/src/app/viewer/PropertiesCard.tsx`.
- [ ] `P05.S20` - Wire save through the editor seam mapping the typed write result onto the status enum with conflict and refusal handling; `frontend/src/stores/server/editorMutations.ts`.
- [ ] `P05.S21` - Live-verify the engine to core 0.1.32 write round-trip for save, conflict, and refusal against a fixture vault; `frontend/src/stores/server/editorMutations.test.ts`.
- [ ] `P05.S22` - Restore the real write-seam tests trimmed during the mock-tautology removal; `frontend/src/stores/server/editorMutations.test.ts`.

### Phase `P06` - Workspace layout persistence

Persist and restore the serialized dock layout plus tab metadata in engine dashboard-state per scope, coalesced and size-capped, degrading cleanly to the default layout.

- [ ] `P06.S23` - Add a bounded workspace_layout field to the engine dashboard-state schema with a migration; `engine/crates/vaultspec-session/src/session.rs`.
- [ ] `P06.S24` - Serve and accept workspace_layout through the dashboard-state route via the shared envelope; `engine/crates/vaultspec-api/src/routes/session.rs`.
- [ ] `P06.S25` - Persist the serialized dock layout and tab metadata via the dashboard-state mutation on a coalesced layout-change event; `frontend/src/stores/server/dashboardState.ts`.
- [ ] `P06.S26` - Restore the layout on load with fromJSON and rehydrate panels by id, degrading to the default layout on parse or oversize; `frontend/src/app/stage/DockWorkspace.tsx`.
- [ ] `P06.S27` - Add tests for the persist and restore round-trip and the degrade-to-default path; `frontend/src/stores/server/dashboardState.test.ts`.

### Phase `P07` - Integration, gate, and verification

Wire the workspace into the shell, run the full lint gate and vitest green, and verify behaviour against the mandate without regressing the open figma-frontend-rewrite surfaces.

- [ ] `P07.S28` - Run the full lint gate for frontend and the engine change to exit zero; `frontend/`.
- [ ] `P07.S29` - Run the vitest suite green and fix regressions from the viewerTarget retirement; `frontend/`.
- [ ] `P07.S30` - Verify behaviour against the mandate for provisional and permanent tabs, dock survival, persist and restore, edit and save, and code read-only in the live app; `frontend/`.
- [ ] `P07.S31` - Confirm no regression to the open figma-frontend-rewrite surfaces and reconcile the shared AppShell touch; `frontend/src/app/AppShell.tsx`.

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

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

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
