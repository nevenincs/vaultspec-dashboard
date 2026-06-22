---
tags:
  - '#research'
  - '#editor-dock-workspace'
date: '2026-06-18'
modified: '2026-06-22'
related:
  - '[[2026-06-16-document-editor-backend-adr]]'
  - '[[2026-06-16-review-rail-viewers-adr]]'
  - '[[2026-06-16-figma-frontend-rewrite-plan]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---



# `editor-dock-workspace` research: `dockable tabbed editor workspace`

The standing goal replaces the single-document viewer overlay with a dockview-based,
session-persisted split workspace: graph-right / documents-left by default, fully
walkable / tabbable / movable / hot-dockable, with a portal-pinned Pixi canvas that
survives docking, VS Code-style provisional/permanent tabs, and full Markdown
read+edit (code read-only) — all over the preserved stores and `SceneController`
contracts. This research grounds that build: it maps what exists today, pins the
docking library and its API, designs the portal-pinned canvas seam that keeps the
WebGL context alive across re-parenting, designs the bounded tab model, and confirms
the editor write backend is already built and merely unmounted and live-unverified.

## Findings

### F1 — Today: one document, full-cover overlay, no tabs, no edit UI

The current viewer is single-document and renders as a full-cover absolute overlay
over the graph, not a split. `AppShell` mounts `ViewerSurface` as
`absolute inset-0 z-10` over the `Stage`; the Pixi graph stays mounted underneath and
the viewer paints an opaque surface over it, rendering null when nothing is open. The
view store carries `viewerTarget {nodeId, surface} | null` (markdown | code) and a
separate single-doc `editorTarget` — both explicitly "ONE doc at a time, never a list
(bounded-by-default)". `ViewerSurface` routes to a read-only `MarkdownReader`
(react-markdown + Shiki + `DocHeader`) or a read-only `CodeViewer`. The left-rail row
gestures already distinguish select (single-click → `selectNode`) from open
(`handleEntryOpen` → `openNodeInViewer`), but "open" is binary — there is no
provisional/preview vs permanent distinction and no tab collection.

### F2 — The docking library: dockview 6.6.1

`dockview` is the chosen manager (zero-dependency, TypeScript-native, IDE-grade
tabs/groups/grids/splitviews, drag-to-dock, floating + popout groups). Current version
is `6.6.1`; it publishes `dockview-core` (vanilla), `dockview-react` (React bindings),
and a `dockview` meta package, and declares a React peer of
`^16.8 || ^17 || ^18 || ^19` — compatible with the project's React `19.2`. It is not
yet a dependency (the frontend has `react-markdown`, `shiki`, `pixi.js`, `zustand`,
`@tanstack/react-query` but no dockview). The React surface is a `DockviewReact`
component taking a `components` map (id → panel component) and an `onReady(event)`
callback exposing `event.api`; panels are added with
`api.addPanel({ id, component, title, params, position: { direction, referencePanel } })`,
where `direction` (`left|right|above|below|within`) drives split placement. Layout is
serialized with `api.toJSON()` → a `SerializedDockview`, restored with
`api.fromJSON(state)`, and `api.onDidLayoutChange` fires on every structural change —
the persistence hook. Each panel component receives `IDockviewPanelProps` (its
`api`, `params`, and dimension-change events).

### F3 — Theming: every dockview surface is a `--dv-*` CSS variable

dockview themes entirely through `--dv-*` CSS custom properties (e.g.
`--dv-group-view-background-color`, `--dv-activegroup-visiblepanel-tab-background-color`
/ `-color`, the inactive/hidden variants, `--dv-separator-border`, `--dv-tab-divider-color`,
`--dv-sash-color` / `--dv-active-sash-color`, `--dv-drag-over-background-color`,
`--dv-floating-*`). This means re-theming is a one-time remap of the `--dv-*` set onto
the project's OKLCH `--color-*` semantic tier per theme (light / dark / high-contrast) —
no per-component color, no bespoke stylesheet — satisfying the centralized-design-system
and OKLCH-token-tier disciplines. dockview ships a base stylesheet that must be imported
once; the project's tokens override the variables.

### F4 — The portal-pinned canvas: how the graph survives docking

The load-bearing risk is that docking re-parents a panel's DOM node, and re-parenting a
`<canvas>` destroys its WebGL context — which would kill the Pixi renderer and the
`SceneController` seam. The chosen resolution (decided with the user): the graph is a
real dockview panel, but its panel component renders only a transparent placeholder
`<div>` that reports its viewport rect; the single, app-lifetime Pixi `<canvas>` lives
in ONE stable DOM container mounted once outside any dockview panel, positioned
absolutely and translated/sized to track the placeholder's rect (via
`getBoundingClientRect` + a `ResizeObserver` and the panel's dimension events). dockview
freely re-parents the placeholder; the canvas never moves in the DOM, so its GL context
and the `SceneController` are untouched. When the graph panel is hidden or closed, the
overlay is hidden (not destroyed); render-on-demand already idles the GPU when the scene
is static, so a hidden-but-mounted canvas costs nothing. This keeps
view-rewrite-preserves-the-state-and-scene-contract intact: the scene receives data only
through `SceneController.command()` exactly as today; only its host rect moves.

### F5 — The tab model: dockview owns geometry, a bounded stores slice owns identity

dockview natively provides the tabs, groups, drag-reorder, and drag-to-dock; what it
does NOT provide is the VS Code provisional/permanent (preview) semantics — those are an
overlay the stores layer owns. The design: a bounded view-store slice holds an ordered
`openDocs` list of `{ nodeId, surface, provisional }`, the `activeDocId`, and the single
`provisionalDocId`. Single-click opens (or replaces) the provisional doc: if a
provisional tab exists, its panel is reused/replaced in place; double-click (or an edit,
or a tab drag) promotes it (clears `provisional`). Panel id === `nodeId`, so dockview's
layout and the stores slice reconcile by id. The slice is bounded at creation
(`MAX_OPEN_DOCS` + LRU eviction of the oldest non-active permanent tab, mirroring
`OPENED_IDS_CAP` / `WORKING_SET_CAP`) because each open panel mounts one `useContentView`
observer holding up to `MAX_CONTENT_BYTES` — an uncapped tab set is exactly the
unbounded accumulator the bounded-by-default rule forbids. Content still flows through
the single `useContentView(nodeId, scope)` query per panel; no view fetches, none read
raw `tiers`.

### F6 — The editor write backend is built; only the UI and live proof are missing

The document-editor backend already shipped (feature `document-editor-backend`, audit
PASS, plan 28/28). The full write stack exists in code: the engine `POST
/ops/core/{verb}/write` proxy channel with `OpsWriteBody`, the client `opsCoreWrite` /
`opsCoreCreate`, the `OpsWriteResult` union (`saved | conflict | refused | created`),
the bounded editor slice (`editorTarget` / `draftText` / `baseBlobHash` /
`editorStatus`: `idle|dirty|saving|saved|save-failed|conflict`), the `editor.ts` seam
(`openDocumentEditor` / `updateEditorDraft` / `applyEditorWriteResult`), and the
optimistic blob-hash concurrency model. Three gaps remain, all in scope here: (a) NO
`app/` component mounts the editor — `MarkdownReader` has no edit mode and no PROPERTIES
card, so "editor" today is read-only; (b) the live write path was blocked on
`vaultspec-core` shipping the edit verbs and is unverified — the faked editor-write
tests were trimmed (the mock-tautology removal) pending real verbs; (c) the
`useSaveBody` / `useSetFrontmatter` / `useCreateDoc` mutations must be wired to the
editor seam and a real edit UI.

### F7 — core 0.1.32 ships the edit verbs: the write path is unblocked

The installed `vaultspec-core` is `0.1.32` and now ships the three edit verbs the seam
forwards to. `vault edit` is documented as "the dashboard 'save'": it applies a body
channel (`--body-stdin` / `--body-file`) and frontmatter flags (`--date`, `--tags`,
`--related`) in ONE atomic write with one validation pass, refuses on any ERROR-severity
diagnostic, and guards optimistic concurrency with `--expected-blob-hash` (computing the
identical git blob OID core-side, byte-matching the engine reader's hash). `vault
set-body` replaces only the body (frontmatter preserved byte-for-byte, `modified:`
refreshed); `vault set-frontmatter` edits selected fields. All support `--dry-run` and
`--json`. So the long-pole blocker named in the document-editor ADR (release coupling +
no edit verb) is resolved; what remains is to live-verify the engine→core round-trip on
0.1.32 and restore real write-seam coverage against a fixture vault.

### F8 — Markdown edit scope and the Figma source

The editable surface is the raw Markdown body plus a PROPERTIES card of
`tags / date / related` (the title is the body H1, not a frontmatter field); only
Markdown documents are editable, the code viewer stays read-only. The Figma binding file
designed the reader with view AND edit modes (the figma-frontend-rewrite plan's
readers-and-viewers phase named "view and edit modes"), but the rewrite shipped the
read-only reader; the edit-mode components are designed and awaiting wiring. The editor
write-states beyond the header `Unsaved` indicator have no separate Figma source and are
designed against that indicator, per the document-editor ADR.

### F9 — Persistence: dashboard-state vs session, both in the stores layer

"Session-persisted" layout has two candidate durable homes, both owned by the stores
layer (the sole wire client): engine-owned dashboard-state (cross-surface, already holds
`panel_state` / `right_tab` / collapse, persisted per scope) or the session
`scope_context`. The dock layout is a `SerializedDockview` JSON blob plus the tab
metadata (provisional flags, surfaces) — larger than the current panel flags. The ADR
must choose; the layer law is fixed either way (durable write goes through the stores
mutation, mirrored into the view store for synchronous reads, never localStorage), and
the persisted blob must be scoped and reset on scope/workspace swap exactly as
`viewerTarget` is today. Local resize/visibility already splits between dashboard-state
(collapse, right_tab) and the view-store `shellLayout` (widths/heights) — the dock layout
should follow one consistent home, not a third pattern.

### F10 — Collision: the open figma-frontend-rewrite plan touches the same surfaces

`2026-06-16-figma-frontend-rewrite-plan` is in flight (~79%); its remaining steps are
scene node/edge re-skin and stage-chrome re-skin (`W04.P11`), then shell wiring
(`W05.P12.S18`, which touches `AppShell`) and final visual parity. Its readers-and-viewers
phase (`P10`) is already done. There is no direct architecture conflict — that plan
re-skins the scene paint and stage chrome, this feature restructures the stage column's
composition and the viewer host — but both touch `AppShell` and the stage region, so the
work must be sequenced around it (a worktree or an explicit ordering), and the dock
integration must not regress the rewrite's surfaces.

### F11 — Layer-ownership obligations carried into the build

The four-layer law binds every part of this: the tab/dock state is view-local chrome in
`frontend/src/stores/view`, bounded at creation; the dock host and the portal-canvas seam
are `app/` chrome that compose the kit and the preserved `Stage`/`SceneController`,
adding no fetch and reading no raw `tiers`; all document/file bytes still flow through the
single `useContentView` query (the sole wire client); every write still routes through
`/ops/core/*` to `vaultspec-core` (engine stays read-and-infer). The dockview surfaces are
themed only through the `--dv-*` → OKLCH-token remap, introducing no new accent, gradient,
or texture, and composing the centralized component vocabulary rather than redefining it.

## Open questions for the ADR

- Persistence home: engine dashboard-state vs session `scope_context` for the
  `SerializedDockview` + tab metadata blob (F9).
- The provisional→permanent promotion triggers (double-click is given; also on edit, on
  drag-out, on second activation?) and the `MAX_OPEN_DOCS` cap value (F5).
- Whether the markdown editor's PROPERTIES card uses `vault edit` (atomic body +
  frontmatter) or routes body and frontmatter through separate verbs (F7/F8).
- Execution isolation: shared main worktree with explicit sequencing vs a dedicated
  worktree, given the open figma-frontend-rewrite plan (F10).
