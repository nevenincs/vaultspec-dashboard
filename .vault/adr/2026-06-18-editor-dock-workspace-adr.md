---
tags:
  - '#adr'
  - '#editor-dock-workspace'
date: '2026-06-18'
modified: '2026-06-22'
related:
  - '[[2026-06-18-editor-dock-workspace-research]]'
  - '[[2026-06-16-document-editor-backend-adr]]'
  - '[[2026-06-16-review-rail-viewers-adr]]'
---



# `editor-dock-workspace` adr: `dockable tabbed editor workspace` | (**status:** `accepted`)

## Problem Statement

The dashboard can read a document, but only ONE at a time, and only as a full-cover
overlay painted over the graph. Opening a second document discards the first; there is
no way to keep several documents open, to compare a document beside the graph, to
arrange surfaces, or to edit a document at all — the Markdown editor backend shipped but
is mounted nowhere. The standing goal is a modern code-editor workspace: a split canvas
with the graph on the right and documents tabbed on the left, where the whole area is
walkable, tabbable, movable, and hot-dockable; documents open VS Code-style (single-click
provisions a provisional/preview tab that the next selection replaces, double-click makes
it permanent); the layout persists across sessions; and Markdown documents gain a full
read+edit mode while code stays read-only. This ADR decides the docking library, the
canvas-survival contract, the tab model, the persistence home, and the editor mounting —
restructuring the stage column over the UNCHANGED stores and `SceneController` contracts.

## Considerations

- **A dock manager, not a hand-rolled split.** Tabs, groups, drag-reorder, drag-to-dock,
  splitters, floating/popout, and layout serialization are a large surface to build well.
  Research F2 evaluated dockview, FlexLayout, rc-dock, and golden-layout; `dockview` 6.6.1
  is the strongest current fit (zero-dependency, TypeScript-native, IDE-grade, React-19
  compatible, full `toJSON`/`fromJSON` serialization, and `--dv-*` CSS-variable theming
  that remaps onto the OKLCH token tier). FlexLayout/rc-dock are viable fallbacks;
  golden-layout is legacy.
- **The graph is a long-lived WebGL surface.** The Pixi renderer and the `SceneController`
  seam cannot tolerate the DOM re-parenting that every dock operation performs — moving a
  `<canvas>` in the DOM destroys its GL context (research F4). So "the graph is a dockable
  panel" and "the graph keeps its context" are in tension, and the resolution must be an
  explicit contract, not an accident of where the canvas happens to mount.
- **The tab model is two concerns.** dockview owns geometry (which panel is where, tab
  order, group splits); it does NOT own VS Code provisional/permanent semantics. Those are
  a stores-layer overlay keyed by document identity (research F5).
- **The editor is built, unmounted, and now unblocked.** The write stack — engine
  `/ops/core/{verb}/write` proxy, the `opsCoreWrite`/`opsCoreCreate` client, the
  `OpsWriteResult` union, the bounded editor slice, the `editor.ts` seam, optimistic
  blob-hash concurrency — all exist (feature `document-editor-backend`, audit PASS). The
  edit verbs it forwards to now ship in `vaultspec-core` 0.1.32 (`vault edit` is "the
  dashboard save"; research F6, F7). What is missing is the edit UI and live proof.
- **Persistence has an established home.** Cross-surface dashboard intent lives in
  engine-owned dashboard-state, read through TanStack Query (`panel_state` already does);
  the view-store `shellLayout` widths are NOT durably persisted today (research F9).

## Constraints

- **Layer ownership is fixed (`dashboard-layer-ownership`,
  `view-rewrite-preserves-the-state-and-scene-contract`,
  `views-are-projections-of-one-model`).** The tab/dock state is view-local chrome in
  `frontend/src/stores/view`, bounded at creation. The dock host and the portal-canvas
  seam are `app/` chrome that compose the centralized kit and the preserved `Stage` /
  `SceneController` — adding no new `fetch`, minting no node model, reading no raw `tiers`.
  Document/file bytes still flow through the single `useContentView` query; every write
  still routes through `/ops/core/*` to `vaultspec-core` (engine stays read-and-infer).
- **Bounded by default (`bounded-by-default-for-every-accumulator`).** The open-document
  collection is a NEW accumulator and must carry an explicit cap and LRU eviction at
  creation — each open panel mounts a `useContentView` observer holding up to
  `MAX_CONTENT_BYTES`. The persisted layout blob must be size-capped. The
  `onDidLayoutChange` → persist path must be coalesced, not a write per event.
- **Theming (`themes-are-oklch-generated-from-a-token-tier`, `design-system-is-centralized`,
  `warmth-lives-in-tokens-not-decoration`).** dockview is re-themed ONLY by remapping its
  `--dv-*` variables onto the OKLCH `--color-*` tier per theme (light/dark/high-contrast) —
  no bespoke per-component color, no new accent/gradient/texture. Tabs, the editor toolbar,
  and the PROPERTIES card compose the existing kit primitives, not ad-hoc redefinitions.
- **The new library is mature, not frontier.** dockview 6.6.1 is a widely deployed,
  documented library within the implementing model's knowledge; its React-19 peer is
  declared. The one bespoke element — the portal-pinned canvas — is our own integration,
  not a library frontier, and is the highest-risk piece to verify.
- **Parent stability.** The read path (`review-rail-viewers`), the editor write backend
  (`document-editor-backend`, PASS), the `/ops` bounded sibling runner (cap + timeout), the
  shared envelope/tiers, and the `SceneController` seam are all shipped and stable. The one
  release dependency named in the prior ADR (core shipping the edit verbs) is now resolved
  at 0.1.32. The open `figma-frontend-rewrite` plan touches the same `AppShell`/stage and
  must be sequenced around (research F10).

## Implementation

The build is six layers over the unchanged stores and scene contracts.

**1. The dock workspace host (`app/`).** A new workspace component replaces the current
`absolute inset-0` viewer overlay inside the stage column. It renders a `DockviewReact`
with a `components` map: a `graph` panel, a `markdown` panel, and a `code` panel. On first
mount with no open documents the graph panel fills the workspace; opening a document splits
a documents group to the LEFT of the graph (the default graph-right / documents-left
layout), and closing the last document returns the graph to full width. The host is dumb
chrome: each document panel subscribes to `useContentView(nodeId, scope)` for its own id
and renders the existing reader/viewer; the graph panel renders the portal placeholder
(layer 2). dockview is themed by a stylesheet that maps `--dv-*` onto the OKLCH tokens.

**2. The portal-pinned canvas contract (`app/` + `scene/` boundary).** The Pixi `<canvas>`
is mounted ONCE in a stable, app-lifetime container that is NOT a child of any dockview
panel (it lives at the stage-column root, positioned absolutely). The dockview `graph`
panel renders only a transparent placeholder `<div>` that reports its rect; a small
controller tracks that rect (`getBoundingClientRect` + a `ResizeObserver` + the panel's
dimension events) and sizes/positions the fixed canvas overlay to match. Because the canvas
never changes parent, its WebGL context and the `SceneController` are untouched across any
dock/drag/split; the scene still receives data only through `SceneController.command()`.
When the graph panel is hidden or closed the overlay is hidden, not destroyed
(render-on-demand already idles the GPU). This is the load-bearing contract of the feature.

**3. The bounded tab model (`stores/view`).** A new bounded slice on the view store holds
the ordered open-document set `{ nodeId, surface, provisional }[]`, the `activeDocId`, and
the single `provisionalDocId`. Opening a document single-click sets/replaces the provisional
slot: if a provisional tab exists its panel is replaced in place (same position), so
browsing the rail walks one preview tab rather than spawning many. Double-click — or making
an edit, or dragging the tab — promotes it (clears `provisional`). The set is capped at
`MAX_OPEN_DOCS` with LRU eviction of the oldest non-active permanent tab (mirroring
`OPENED_IDS_CAP`). Panel id === `nodeId`, so dockview geometry and this slice reconcile by
id; the slice is the single source of truth for which content query each panel drives and
is cleared on scope/workspace swap exactly as `viewerTarget` is today. The legacy single
`viewerTarget` is retired in favour of this slice (no parallel single-doc path kept alive).

**4. Markdown read+edit mounting (`app/` + `stores`).** The Markdown panel gains a
view/edit toggle. View mode is today's reader. Edit mode mounts the existing editor backend:
it seeds the editor slice from the read (`openDocumentEditor(nodeId, text, blob_hash)`),
renders a raw-Markdown editing surface bound to `draftText` plus a PROPERTIES card for
`tags / date / related`, and saves through the existing `useSaveBody` / `useSetFrontmatter`
or the atomic `vault edit` mutation, mapping the typed `OpsWriteResult` onto the status enum
via `applyEditorWriteResult` (saved / conflict / refused). Conflict surfaces the stale-base
reconcile, never a silent overwrite; refusal surfaces the field-level diagnostics. The code
and Markdown-as-code panels stay strictly read-only. The engine→core write round-trip is
live-verified against core 0.1.32 and the real write-seam tests (trimmed when faked) are
restored against a fixture vault.

**5. Persistence (`stores` + engine dashboard-state).** The workspace layout — the dockview
`SerializedDockview` plus the tab metadata (`{nodeId, surface, provisional}[]`, `activeDocId`)
— is persisted in engine-owned dashboard-state as a new bounded `workspace_layout` field per
scope, beside `panel_state`. The stores layer writes it through the dashboard-state mutation
on a COALESCED `onDidLayoutChange`, and restores it on load (`fromJSON` + rehydrate each
panel's content query by id). The field is size-capped; an oversized or unparseable blob
degrades to the default graph-right layout, never an error. It is scoped and reset on
scope/workspace swap. This keeps persistence in the one cross-surface durable home rather
than minting a third pattern.

**6. Open intents and cross-links (`app/`).** The left-rail, rail-overview, inspector, and
command-palette open actions route through the tab model: a single-click "preview" intent
and a double-click/"open" permanent intent, replacing the binary `openNodeInViewer`. Code
rows open the read-only code panel; document rows open the Markdown panel (view mode, edit a
toggle away). Every existing cross-link (path, graph node, open-in-viewer) is preserved.

## Rationale

dockview is chosen because it is the one option that delivers IDE-grade docking AND
first-class layout serialization AND token-tier theming without a heavy or frontier
dependency (research F2, F3): `toJSON`/`fromJSON` makes the "session-persisted" requirement
mechanical, and the `--dv-*` variables make re-theming a token remap rather than a bespoke
stylesheet, satisfying the centralized-design and OKLCH disciplines. The portal-pinned
canvas is the only resolution that lets the graph be a genuine dockable panel while keeping
its WebGL context and the `SceneController` seam — re-parenting a canvas destroys its context,
so the canvas must never be re-parented, and pinning a single app-lifetime canvas to a
tracked placeholder rect achieves exactly that (research F4); it is the chosen design and the
piece most needing live verification. Splitting the tab model so dockview owns geometry and a
bounded stores slice owns provisional/permanent identity follows
`views-are-projections-of-one-model` (the documents are projections over the one model, not a
new model) and `dashboard-layer-ownership` (chrome holds no wire access). Mounting the
already-built, already-PASS editor backend rather than rebuilding it honors the prior cycle's
work and is unblocked now that core 0.1.32 ships the verbs (research F6, F7). Persisting in
dashboard-state reuses the established cross-surface durable home (research F9).

## Consequences

- **Gains.** A real editor workspace: many documents open at once, arranged freely beside the
  graph; VS Code preview-tab ergonomics; a persisted layout; and — closing the headline gap —
  full Markdown editing with conformant, conflict-safe saves, with code review surfaces
  staying read-only. One dock manager serves tabs, splits, and floating; one content query
  still backs every panel; one write path still routes through core.
- **Difficulties.** The portal-pinned canvas is genuinely tricky: the rect-tracking must stay
  pixel-accurate across split-drag, group-move, float, and timeline/rail resizes, and must not
  fight render-on-demand. dockview's serialized layout and our tab metadata must round-trip
  consistently, and a restored layout referencing a since-deleted document must degrade
  cleanly. Persisting a JSON blob in dashboard-state adds an engine schema field + migration.
- **Pitfalls guarded.** The open-document set is the textbook unbounded accumulator — it ships
  capped with LRU at creation. The persist path is coalesced, not per-event. The dockview theme
  is a variable remap, never bespoke color. The editor must never silently persist a
  non-conformant or stale-base document — the existing refuse-on-error and blob-hash guard are
  retained, and the write is live-verified, not mock-faked (the trimmed faked tests are restored
  against real core, not re-faked).
- **Pathways.** A dock workspace makes future surfaces cheap: a diff panel, a search-results
  panel, a floating inspector, side-by-side document compare, and a popout window all become
  "another panel" rather than another overlay.

## Codification candidates

- **Rule slug:** `graph-canvas-is-portal-pinned-never-reparented`.
  **Rule:** The Pixi graph `<canvas>` is mounted once in a stable app-lifetime DOM container
  and positioned to track its host panel's rect; no layout, dock, or view change may re-parent
  it, because re-parenting a canvas destroys its WebGL context and the `SceneController` seam.
  (Candidate — promote only after it holds across this feature's cycle.)
- **Rule slug:** `open-document-tabs-are-a-bounded-collection`.
  **Rule:** The set of open document tabs is bounded at creation with an explicit cap and LRU
  eviction; each tab mounts a content-query observer, so an uncapped tab set is the unbounded
  accumulator the bounded-by-default rule forbids. (Candidate; a specialization of an existing
  rule, promote only if it earns independent standing.)
- Note: `vault-writes-route-through-core-via-ops` and
  `editor-refuses-to-persist-nonconformant-docs` are already standing candidates from the
  `document-editor-backend` ADR; mounting the editor here exercises them rather than minting
  new ones.
