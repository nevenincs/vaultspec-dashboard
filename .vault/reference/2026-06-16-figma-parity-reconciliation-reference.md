---
tags:
  - '#reference'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
  - "[[2026-06-16-figma-parity-reconciliation-adr]]"
---

# `figma-parity-reconciliation` reference: `Preserved stores and SceneController contract`

This document FREEZES the two layers the figma-parity-reconciliation view rewrite
consumes UNCHANGED: the `frontend/src/stores/` hooks (the nervous system, the sole wire
client) and the `frontend/src/scene/sceneController.ts` command/event channel (the
canvas seam). It is the rewrite-consumable contract surface: the rewritten chrome and
canvas build against exactly these signatures. Per the ADR the rewrite adds no fetch,
mints no model, and changes neither contract except through a reviewed contract event.
This is DOCUMENTATION, not a shape change; no signature below is modified by authoring
it.

## Summary

The stores layer is the only place that fetches, holds the TanStack query cache, runs
the SSE delta clock, and reads the per-tier `tiers` block. Every chrome surface in the
rewrite is a dumb projection over the read hooks below and emits intent back through the
view-store mutators. The scene receives data only through `SceneController.command()`
and emits selection/hover/open through `SceneController.on()`. The rewrite never widens
either union.

## Stores contract surface (`frontend/src/stores/`)

### Wire client and envelope primitives (`server/engine.ts`)

The single `EngineClient` is the only thing that touches the network; chrome and scene
never construct one. Degradation is read ONLY through the stores layer, never by the
view. Frozen primitives:

- `engineClient` - the shared client instance behind every read hook below.
- `EngineError` - the thrown wire error; carries `tiers` from a tiers-bearing error
  envelope (the transport preserves it).
- `tiersFromQuery({ data, error })` - the single tiers reader: returns the served
  `data.tiers`, or the FRESH error envelope's tiers winning over a stale held-success
  block (`degradation-is-read-from-tiers-not-guessed-from-errors`).
- `readTierAvailability(tiers, names)` - derives `{ degraded, degradedTiers, reasons }`
  for a named tier subset (contract section 2: an absent tier is degradation, not
  availability).
- `CANONICAL_TIERS` - the four-tier ordering (`declared`, `structural`, `temporal`,
  `semantic`).
- The wire shape types the rewrite consumes (frozen): `GraphSlice`, `GraphFilter`,
  `EngineNode`, `EngineEdge`, `NodeEvidence`, `DiscoverResponse`, `ContentResponse`,
  `HistoryResponse`, `HistoryCommit`, `EventsResponse`, `LineageSlice`, `PipelineArtifact`,
  `PlanInterior`, `InteriorStep`, `SettingDef`/settings-schema types, `GitOpResponse`,
  `GitFileDiff`, `TiersBlock`, `TierAvailability`, `WorkspaceRoot`, `EmbeddingsResponse`,
  `SettingUpdate`, `SessionUpdate`.

### Read hooks (`server/queries.ts`) - the rewrite's data inputs

The cache-key triple is `(scope, filter, as-of)`; the rewrite passes the SAME triple it
renders. Frozen read hooks and their interpreted-view siblings:

- Workspace and worktree: `useWorkspaceMap`, `useWorkspaceMapAvailability`,
  `useWorkspaces`, `useWorkspacesAvailability`, `useActiveWorkspace`, `useWorkspaceRoots`,
  `useSwapWorkspace`.
- Trees: `useVaultTree`, `useVaultTreeAvailability`, `useFileTree`,
  `useFileTreeAvailability`, `useFiltersVocabulary`.
- Graph: `useGraphSlice`, `useSalienceGraphSlice`, `useSalienceSliceView`,
  `useGraphSliceAvailability`, `useGraphEmbeddings`, `useGraphDiff`.
- Node detail and evidence: `useNodeDetail`, `useNodeNeighbors`, `useNodeNeighborsBulk`,
  `useNodeEvidence`, `useNodeContent`, `useContentView`, `useDiscover`.
- Status and history: `useEngineStatus`, `useNodeHistory`, `useHistoryView`.
- Temporal: `useEngineEvents`, `useTimelineLineage`.
- Pipeline: the pipeline and plan-interior queries surfaced through their query hooks.
- Session and settings: `useSession`, `useSettings`, `useSettingsSchema`, `usePutSession`,
  `usePutSettings`.
- Search: `useEngineSearch` (the search-offline gate is read from `tiers`, never a bare
  transport error).

The interpreted-view hooks (`use*View`, `use*Availability`) are where degradation is
turned into `{ loading, degraded, errored, reasons, available }` for the dumb view; a
rewrite surface consumes those, never `query.data.tiers`.

### View stores (`view/`) - the intent the rewrite emits back

The per-scope view stores own selection, filters, browser mode, lenses, pins, and the
scoped reset discipline. The rewrite drives these mutators (select, set-filter,
set-browser-mode, set-lens, set-focus, pin/unpin, set-scope) and never invents a parallel
selection or filter state. The scoped-store reset semantics (cross-scope isolation, pin
re-keying) are preserved verbatim.

### What the rewrite MUST NOT do (the hard boundary)

A chrome or scene component never calls `fetch`/`engineClient` directly, never reads the
raw `tiers` block, never defines its own wire shape, and never adds a query key outside
`engineKeys`. A genuinely new projection lands as an engine-query projection plus a stores
selector, not a per-view fetch (`views-are-projections-of-one-model`).

## SceneController contract surface (`frontend/src/scene/sceneController.ts`)

The scene store lives OUTSIDE React; the renderer owns positions, LOD, and per-frame
animation. The seam is LOCKED (RL-1 to RL-5, 2026-06-12): surface changes are
ADR-flagged redlines, never drive-by edits. The canvas rewrite plugs a new
`SceneFieldRenderer` behind this surface; it does NOT widen the command or event union.

### Data shapes the controller carries

- `SceneNodeData` - the visual-anatomy node input (RL-1): `id`, `kind`, optional `title`,
  `featureTags`, `lifecycle`, `degreeByTier`, `dates`, `memberCount`, `salience`,
  `embedding`, `status`, `authorityClass`, `seedPosition`. The rewrite reads `salience`
  for circle size, `kind`/`featureTags` for category color, `status` for the stamp; all
  additive optional fields are backward-compatible and the renderer falls back when absent.
- `SceneEdgeData` - the edge input (RL-2): `id`, `src`, `dst`, `relation`, `tier`,
  `confidence`, optional `state`, `meta`, `derivation`. The flat-grey edge treatment reads
  these; it does not re-key edges.
- `SceneDelta` - one delta op (`add`/`remove`/`change`) shared by the live `graph` SSE
  channel and `/graph/diff`.
- `SceneAnchor` - the screen-space anchor (`x`, `y`, `scale`) for a DOM island (RL-4).

### Commands IN (`controller.command(cmd)`) - the frozen `SceneCommand` union

`set-data`, `apply-deltas`, `focus-node` (optional `animate`), `set-visibility`,
`set-time`, `set-pinned`, `set-selected`, `pulse`, `zoom-in`, `zoom-out`, `fit-to-view`,
`reset-view`, `set-layout-params`, `set-layout-mode` (`force`|`circular`),
`begin-interaction`, `end-interaction`, `set-frozen`, `set-representation-mode`
(`connectivity`|`lineage`|`semantic`), `set-overlays`. The stores layer feeds data and
view state in through these; the rewrite drives the controls (zoom/fit/freeze/tune/layout)
exclusively through this union.

### Events OUT (`controller.on(listener)`) - the frozen `SceneEvent` union

`hover`, `select`, `open`, `expand`, `pin`, `camera-change` (`scale`, `level`),
`layout-changed`, `context-menu` (`id`, `target`, `clientX`, `clientY`),
`representation-mode-changed` (`requested`, `applied`, optional `downgradeReason`). The
rewrite routes node selection and hover BACK through these events into the view store; it
emits no new event kind.

### Anchors and lifecycle

`mount(host)`, `resize(width, height)`, `destroy()`, `trackNode(id, listener)` (RL-4 DOM
island anchoring), `setMinimapCanvas(canvas)`, `getLayoutState()`, `getRepresentationState()`.
The rewrite mounts the new renderer behind the same lifecycle calls.

## Engine backend base (the bounded reconciliation, S13 to S18)

The two engine gaps the designs require are the only backend additions, both
read-and-infer with no vault writes and no ref mutation:

- Node-evidence enrichment (S13): the engine evidence projection is aligned to the GUI
  `NodeEvidence` type - `documents: { path, doc_type }[]`, `code_locations` keyed on
  `path` (the corrected field name) with `symbol`/`line`/`state`, and `commits` carrying
  the `subject`. Served through the shared envelope helper with the `tiers` block.
- Historical text-diff route (S14/S15): a bounded read-only two-rev `git diff <from> <to>
  -- <path>` whitelist extension on the `/ops/git` proxy, with both revs and the path
  validated, output forwarded verbatim, and the `tiers` block carried on the success AND
  error envelopes through the shared helper.

The mock engine mirrors both shapes byte-for-byte (S16/S17) and a conformance test feeds a
captured live sample of each through the shared client adapter path (S18), per
`mock-mirrors-live-wire-shape`.
