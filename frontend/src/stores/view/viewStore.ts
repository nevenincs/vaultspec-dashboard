import { create } from "zustand";

import type { EngineEdge } from "../server/engine";
import { resetLiveStatus } from "../server/liveStatus";
import { resetBrowserMode } from "./browserMode";
import { resetBrowserTreeExpansion } from "./browserTreeExpansion";
import { resetCodeViewerScroll } from "./codeViewer";
import { resetCommandPalette } from "./commandPalette";
import { resetContextMenu } from "./contextMenu";
import { resetCreateDocChrome } from "./createDocChrome";
import { resetDiscoveryPanel } from "./discoveries";
import { resetFilterSidebar } from "./filterSidebar";
import { resetGraphControlsChrome } from "./graphControlsChrome";
import { resetInspectorExpansion } from "./inspectorExpansion";
import { resetKeyboardShortcuts } from "./keyboardShortcuts";
import { useLensStore } from "./lenses";
import { resetMinimapChrome } from "./minimapChrome";
import { usePinStore } from "./pins";
import { resetPipelineExpansion } from "./pipelineExpansion";
import { resetSearchIntent } from "./searchIntent";
import { resetStatusTabChrome } from "./statusTabChrome";
import { resetTimelineViewState } from "./timeline";
import { resetWorktreePickerChrome } from "./worktreePickerChrome";

// View state for local chrome and session-only affordances. Cross-surface
// dashboard intent lives in backend dashboard-state and is read through TanStack
// Query; per-frame scene state belongs to the scene layer, never here.

/**
 * Which viewer surface a node opens in (review-rail-viewers ADR). A `doc:<stem>`
 * node routes to the markdown reader; a `code:<path>` node routes to the code
 * viewer. The surface is chosen by node kind at the call site (the cross-link
 * model in `app/`), carried here so the host renders the right viewer.
 */
export type ViewerSurface = "markdown" | "code";

/**
 * One open document tab in the dock workspace (editor-dock-workspace). The panel
 * id in dockview IS the `nodeId`, so the geometry dockview owns and this slice
 * reconcile by id. `provisional` marks the VS Code preview tab: a single-click
 * open shows a provisional tab (rendered distinct, e.g. italic) that the NEXT
 * provisional open REPLACES in place; a double-click, an edit, or a drag PROMOTES
 * it (clears `provisional`) so it persists beside others. At most ONE doc is
 * provisional at a time. `surface` routes the panel to the markdown reader/editor
 * (`markdown`) or the read-only code viewer (`code`).
 */
export interface OpenDoc {
  /** The stable node id (`doc:<stem>` / `code:<path>`); also the dockview panel id. */
  nodeId: string;
  /** Which viewer surface the panel renders. */
  surface: ViewerSurface;
  /** Whether this is the single provisional (preview) tab. */
  provisional: boolean;
}

/**
 * The editor lifecycle status (document-editor backend). A bounded, single-value
 * enum — NOT an append-only history of states (an undo/draft log would violate
 * bounded-by-default-for-every-accumulator): `idle` (nothing open), `dirty` (the
 * draft diverges from the saved text), `saving` (a write is in flight), `saved`
 * (the last write landed), `save-failed` (a transport/validation failure), and
 * `conflict` (the optimistic blob-hash base went stale — someone else wrote). The
 * status drives the editor chrome; the typed write result (`OpsWriteResult`) is
 * what the mutation hook returns, and the caller maps it onto this status.
 */
export type EditorStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "save-failed"
  | "conflict";

/**
 * The single open editor target (document-editor backend), shaped exactly like
 * `viewerTarget` — ONE open doc at a time, never a list (bounded-by-default). A
 * `doc:<stem>` node id whose body the editor is mutating; the code viewer stays
 * read-only, so the editor only ever opens markdown documents. Null when no
 * document is open for editing.
 */
export interface EditorTarget {
  /** The stable `doc:<stem>` node id the editor is mutating. */
  nodeId: string;
}

/** Local non-node selection metadata. Node selection lives in dashboard-state. */
export type Selection =
  | { kind: "edge"; id: string }
  | {
      kind: "event";
      id: string;
      /** Bounded per contract §5; pulse what's carried. */
      nodeIds: string[];
      /** Ids the cap dropped — surfaced honestly, never silently. */
      truncatedNodeIds?: number;
    }
  | null;

export interface GraphOverlayState {
  featureCountries: boolean;
  featureHulls: boolean;
}

export const DEFAULT_GRAPH_OVERLAYS: GraphOverlayState = {
  featureCountries: true,
  featureHulls: true,
};

function graphOverlays(overlays: GraphOverlayState): GraphOverlayState {
  return {
    featureCountries: overlays.featureCountries,
    featureHulls: overlays.featureHulls,
  };
}

export interface ViewState {
  /**
   * The user-picked worktree scope (G2.a) — the coarsest filter; null
   * falls back to the map's default corpus-bearing worktree.
   */
  scope: string | null;
  /**
   * The active vault folder for the current scope (user-state-persistence
   * W04.P09.S30): the durable "which folder am I browsing" projection over the
   * `/vault-tree`, restored from the session on load. Null when no folder is
   * selected. This is session-defining state — its durable home is the session
   * API, NOT localStorage; the view store mirrors it for synchronous reads.
   */
  activeFolder: string | null;
  /**
   * The active feature-tag contexts for the current scope (W04.P09.S30): the
   * "current folder + contexts" concept built on the existing `feature_tags`
   * grouping primitive (a projection, never a new node model). Restored from the
   * session's `scope_context.feature_tags` on load.
   */
  featureContexts: string[];
  /** Event/edge selection metadata that is not yet represented in dashboard-state. */
  selection: Selection;
  /**
   * The transient hovered node id — VIEW-LOCAL ONLY (graph-perf 2026-06-18). Hover
   * is not "real" cross-surface state and must NEVER round-trip to the engine: it
   * is set from the scene's own GPU hover-detect (and the timeline) and read by the
   * hover-card host, all client-side. The visual node emphasis is applied directly
   * on the GPU by the scene field; this slice carries only the id for the DOM card.
   * Persisting it to dashboard-state caused a server PATCH on every pointer move
   * (hover-state-004 / the historical `hovered_id:null` PATCH flood).
   */
  hoveredId: string | null;
  /**
   * The hover id that survived the hover-card dwell gate. It is still view-local
   * chrome state, but storing it beside `hoveredId` keeps the timer-retained id
   * out of app-layer component state and lets corpus resets clear it atomically.
   */
  dwelledHoverId: string | null;
  /** The stage's explicit working set — "why is this node on my screen?" */
  workingSet: string[];
  /** Nodes opened in place — rendered as DOM islands above the field (G6.a). */
  openedIds: string[];
  /**
   * The open document tabs in the dock workspace (editor-dock-workspace). An
   * ordered, BOUNDED list — capped at `MAX_OPEN_DOCS` with LRU eviction of the
   * oldest non-active permanent tab (mirroring `OPENED_IDS_CAP`) — because each
   * tab mounts a `useContentView` observer holding up to `MAX_CONTENT_BYTES`, so
   * an uncapped tab set is the unbounded accumulator bounded-by-default forbids.
   * Scoped to the corpus: cleared on a scope/workspace swap. At most one entry
   * has `provisional: true`.
   */
  openDocs: OpenDoc[];
  /** The active (focused) document tab's node id, or null when none is open. */
  activeDocId: string | null;
  /**
   * The single open editor target (document-editor backend): the `doc:<stem>`
   * node the editor is mutating, or null when nothing is open for editing. ONE
   * doc at a time (like `viewerTarget`), never a list — bounded-by-default. Scoped
   * to the corpus: cleared on a scope/workspace swap so a stale editor cannot
   * survive a corpus change.
   */
  editorTarget: EditorTarget | null;
  /**
   * The current draft body text the editor holds for `editorTarget` (the working
   * copy diverging from the saved document while `status` is `dirty`). A SINGLE
   * draft string, NOT an append-only edit/undo history (which would be an
   * unbounded accumulator — bounded-by-default-for-every-accumulator). Empty when
   * no editor is open.
   */
  draftText: string;
  /**
   * The optimistic-concurrency base for the open editor: the `blob_hash` of the
   * document text the draft was opened FROM, echoed back as `expected_blob_hash`
   * on save. A save whose base no longer matches the on-disk blob is a `conflict`
   * the editor reconciles (never a silent overwrite). Empty when no editor is open.
   */
  baseBlobHash: string;
  /** The editor lifecycle status for the open document; `idle` when none is open. */
  editorStatus: EditorStatus;
  /**
   * Session-pinned discovery candidates (G3.c): probabilistic suggestions
   * never join the persistent graph — pinning keeps them on stage for THIS
   * session only; nothing is written anywhere.
   */
  pinnedDiscoveries: EngineEdge[];
  /**
   * Overlay visibility (graph-representation ADR): feature-country labels at
   * overview and BubbleSets hulls at document LOD. Owned here, emitted as
   * `set-overlays`.
   */
  overlays: GraphOverlayState;

  /** Switch the worktree scope — swaps the stage's scope wholesale. */
  setScope: (scope: string | null) => void;
  /**
   * Switch the WORKSPACE — the coarsest swap (dashboard-workspace-registry ADR).
   * Performs the FULL 022 wholesale reset (every piece of per-scope state)
   * PLUS the two things a worktree swap does not: it re-keys the pin and lens
   * stores to the NEW WORKSPACE (not just the new scope, so the prior project's
   * pins/lenses cannot bleed in), and it resets the scope to the new
   * workspace's launch-default / first vault-bearing worktree. The cached
   * worktree SET (the `/map` and `/vault-tree` query cache) is cleared by the
   * stores-layer hook that invokes this (`useSwapWorkspace`), because that
   * cache lives in React Query, not this store — together they are the
   * workspace-level wholesale reset the ADR requires. The control owns no reset
   * logic; it invokes this, exactly as the worktree switcher invokes setScope.
   */
  swapWorkspace: (workspace: string, scope: string | null) => void;
  /**
   * Seed the scope + folder context from the restored session (W04.P09.S30).
   * Used by the stores-layer restore hook on session load: it mirrors the
   * durable session shape into the view store WITHOUT triggering the wholesale
   * reset (which is for a user-initiated swap, not a restore). Durable
   * persistence is the session API's job, not this setter's.
   */
  seedFromSession: (context: {
    workspace: string;
    scope: string | null;
    folder: string | null;
    featureTags: string[];
    /** The restored dock workspace tabs (editor-dock-workspace), parsed from the
     *  durable session `workspace_layout`. Seeded ATOMICALLY with the scope/folder
     *  here — the one-shot session seed — so the tab restore cannot race the scope
     *  settle (a separate restore effect could seed and then be cleared by the
     *  scope-swap reset). Only seeds when the slice is empty. */
    openDocs?: OpenDoc[];
    /** The restored active tab id, applied with `openDocs`. */
    activeDocId?: string | null;
  }) => void;
  /**
   * Set the active folder + feature-tag contexts (W04.P09.S30). Mirrors the
   * context into the view store for synchronous reads; the durable write goes
   * through the session API at the call site (a stores mutation), never
   * localStorage.
   */
  setScopeContext: (context: { folder: string | null; featureTags: string[] }) => void;
  /** Select event/edge metadata that is not just a node id. */
  selectEntity: (selection: Selection) => void;
  /** Set the transient hovered node id (view-local; never persisted to the wire). */
  setHovered: (id: string | null) => void;
  /** Set the hover id that survived the card dwell gate. */
  setDwelledHover: (id: string | null) => void;
  openNode: (id: string) => void;
  closeNode: (id: string) => void;
  /**
   * Open a document tab (editor-dock-workspace). `permanent: false` (default, a
   * single-click/preview) opens or replaces the single provisional tab IN PLACE;
   * `permanent: true` (a double-click/explicit open) opens a permanent tab, or
   * promotes the doc if it is already the provisional one. Re-opening an
   * already-open doc activates it (and promotes it when `permanent`). Bounded:
   * adding beyond `MAX_OPEN_DOCS` evicts the oldest non-active permanent tab.
   */
  openDoc: (nodeId: string, surface: ViewerSurface, permanent?: boolean) => void;
  /** Promote the provisional tab (or a given doc) to permanent (clears its
   *  `provisional` flag) — on double-click, first edit, or a tab drag. */
  promoteDoc: (nodeId: string) => void;
  /** Make a tab the active one (a tab click or a dockview activation). */
  activateDoc: (nodeId: string) => void;
  /** Close a tab; if it was active, activate its nearest neighbour. */
  closeDoc: (nodeId: string) => void;
  /** Reorder the open docs to match dockview's geometry (after a tab drag),
   *  reconciling by id; unknown ids are dropped and missing ones preserved. */
  reorderDocs: (orderedIds: string[]) => void;
  /**
   * Open a document for editing (document-editor backend): seed the editor with
   * the target node id, the just-read body text as the initial draft, and that
   * read's `blob_hash` as the optimistic-concurrency base; status begins `idle`
   * (the draft equals the saved text). Replaces any prior open editor (one doc at
   * a time, bounded-by-default).
   */
  openEditor: (nodeId: string, text: string, baseBlobHash: string) => void;
  /** Update the draft body; marks the editor `dirty` (the draft diverges from the
   *  saved text). A no-op write (same text) is short-circuited so an idle keypress
   *  stream does not churn subscribers. */
  setDraft: (text: string) => void;
  /** Mark a save in flight (status → `saving`). */
  markSaving: () => void;
  /** Mark a save landed (status → `saved`): adopt the new `blob_hash` as the next
   *  concurrency base so a subsequent edit saves against the fresh blob. */
  markSaved: (blobHash: string) => void;
  /** Mark a blob-hash conflict (status → `conflict`): the optimistic base went
   *  stale (someone else wrote). The draft is retained for the reconcile UI. */
  markConflict: () => void;
  /** Mark a save failure (status → `save-failed`): a transport fault or a
   *  validation refusal. The draft is retained so the edit is not lost. */
  markFailed: () => void;
  /** Close the editor (clears the target, draft, base, and resets status to
   *  `idle`) — the same single-value clear a scope swap performs. */
  closeEditor: () => void;
  pinDiscovery: (edge: EngineEdge) => void;
  unpinDiscovery: (edgeId: string) => void;
  /**
   * Reconcile view-local node affordances against the currently held graph model.
   * These ids are visual subscriptions, not durable truth: when the canonical graph
   * slice no longer carries a node, its event-selection ring, opened island,
   * working-set expansion, or pinned candidate edge must not keep retaining
   * observers.
   */
  pruneNodeAffordances: (nodeIds: readonly string[]) => void;
  addToWorkingSet: (id: string) => void;
  removeFromWorkingSet: (id: string) => void;
  clearWorkingSet: () => void;
  /** Set overlay visibility (feature countries, feature hulls). */
  setOverlays: (overlays: GraphOverlayState) => void;

  /** Whether the entire left rail bar is mounted in the shell layout. */
  leftRailVisible: boolean;
  /** Expanded left rail width in pixels; collapsed icon width is shell-owned. */
  leftRailWidth: number;
  /** Expanded right rail width in pixels. */
  rightRailWidth: number;
  /** Whether the bottom timeline region is mounted in the shell layout. */
  timelineVisible: boolean;
  /** Expanded timeline height in pixels. */
  timelineHeight: number;
  /** Whether the shell panel-controls flyout is open. */
  panelFlyoutOpen: boolean;
  setLeftRailVisible: (visible: boolean) => void;
  setLeftRailWidth: (width: number) => void;
  setRightRailWidth: (width: number) => void;
  setTimelineVisible: (visible: boolean) => void;
  setTimelineHeight: (height: number) => void;
  setPanelFlyoutOpen: (open: boolean) => void;
  togglePanelFlyout: () => void;
  /** Restore the view-local shell layout (rail widths, timeline height, rail and
   *  timeline visibility) to their defaults. The collapse + active-tab state lives
   *  in dashboard-state, so the "reset layout" command resets that seam alongside
   *  this one. */
  resetShellLayout: () => void;
}

/** Cap the working set (P-MED-4): each entry materializes its own ego-network
 *  query (Stage's `useQueries` fan-out), so an uncapped set is an unbounded
 *  concurrent-request fan-out. Keep the most-recent N. */
export const WORKING_SET_CAP = 24;

/** Cap session-pinned discoveries (P-LOW-10): each is a full EngineEdge held
 *  for the session; keep the most-recent N so a long session stays bounded. */
export const PINNED_DISCOVERIES_CAP = 50;

/** Cap opened islands (B3, resource-hardening): each opened id mounts an island
 *  that holds a live `useNodeDetail` (+ `useNodeNeighbors`) query observer, so
 *  an uncapped `openedIds` retains every opened node's payload and prevents
 *  TanStack GC for the whole session. Keep the most-recent N; the oldest island
 *  closes (LRU), mirroring WORKING_SET_CAP. */
export const OPENED_IDS_CAP = 12;

/** Cap open document tabs (editor-dock-workspace, bounded-by-default): each tab
 *  mounts a `useContentView` observer holding up to MAX_CONTENT_BYTES, so an
 *  uncapped tab set retains every opened doc's bytes for the session. Keep the
 *  most-recent N; the oldest non-active PERMANENT tab is evicted (LRU), mirroring
 *  OPENED_IDS_CAP. */
export const MAX_OPEN_DOCS = 12;

export const LEFT_RAIL_MIN_WIDTH = 180;
export const LEFT_RAIL_MAX_WIDTH = 420;
export const LEFT_RAIL_DEFAULT_WIDTH = 290;
export const RIGHT_RAIL_MIN_WIDTH = 220;
export const RIGHT_RAIL_MAX_WIDTH = 420;
export const RIGHT_RAIL_DEFAULT_WIDTH = 290;
export const TIMELINE_MIN_HEIGHT = 120;
export const TIMELINE_MAX_HEIGHT = 360;
export const TIMELINE_DEFAULT_HEIGHT = 212;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Evict open document tabs down to MAX_OPEN_DOCS, dropping the OLDEST permanent,
 *  non-active tab first (LRU by insertion order). The provisional tab and the
 *  active tab are preserved; only as a last resort (every other tab is active or
 *  provisional) is an older non-active tab dropped regardless of provisional. */
function evictToCap(docs: OpenDoc[], activeId: string): OpenDoc[] {
  if (docs.length <= MAX_OPEN_DOCS) return docs;
  const result = docs.slice();
  while (result.length > MAX_OPEN_DOCS) {
    let index = result.findIndex((d) => !d.provisional && d.nodeId !== activeId);
    if (index < 0) index = result.findIndex((d) => d.nodeId !== activeId);
    if (index < 0) break;
    result.splice(index, 1);
  }
  return result;
}

function rekeyScopedClientStores(scope: string | null, workspace?: string): void {
  const nextWorkspace = workspace ?? usePinStore.getState().workspace;
  const nextScope = scope ?? "default";
  usePinStore.getState().setScopeKey(nextWorkspace, nextScope);
  useLensStore.getState().setScopeKey(nextWorkspace, nextScope);
}

function resetCorpusLocalStores(): void {
  resetLiveStatus();
  resetBrowserMode();
  resetBrowserTreeExpansion();
  resetCodeViewerScroll();
  resetTimelineViewState();
  resetPipelineExpansion();
  resetInspectorExpansion();
  resetSearchIntent();
  resetCommandPalette();
  resetContextMenu();
  resetCreateDocChrome();
  resetDiscoveryPanel();
  resetFilterSidebar();
  resetGraphControlsChrome();
  resetKeyboardShortcuts();
  resetMinimapChrome();
  resetStatusTabChrome();
  resetWorktreePickerChrome();
}

function corpusLocalViewState(scope: string | null) {
  return {
    scope,
    activeFolder: null,
    featureContexts: [],
    selection: null,
    hoveredId: null,
    dwelledHoverId: null,
    workingSet: [],
    openedIds: [],
    openDocs: [],
    activeDocId: null,
    editorTarget: null,
    draftText: "",
    baseBlobHash: "",
    editorStatus: "idle" as const,
    pinnedDiscoveries: [],
    panelFlyoutOpen: false,
  };
}

export const useViewStore = create<ViewState>((set) => ({
  scope: null,
  activeFolder: null,
  featureContexts: [],
  selection: null,
  hoveredId: null,
  dwelledHoverId: null,
  workingSet: [],
  openedIds: [],
  openDocs: [],
  activeDocId: null,
  editorTarget: null,
  draftText: "",
  baseBlobHash: "",
  editorStatus: "idle",
  pinnedDiscoveries: [],
  overlays: graphOverlays(DEFAULT_GRAPH_OVERLAYS),
  leftRailVisible: true,
  leftRailWidth: LEFT_RAIL_DEFAULT_WIDTH,
  rightRailWidth: RIGHT_RAIL_DEFAULT_WIDTH,
  timelineVisible: true,
  timelineHeight: TIMELINE_DEFAULT_HEIGHT,
  panelFlyoutOpen: false,

  setScope: (scope) => {
    // WHOLESALE swap (ADR §2.1; finding scope-swap-partial-reset-022):
    // everything scoped to the previous corpus resets — selection, working
    // set, opened islands, session-pinned discoveries (old-corpus semantic
    // candidates must not ride into the new slice).
    // Re-key the pin and lens stores so the previous scope's pins/lenses do
    // not bleed into the new scope (finding-018/022/023; isolation-01/02/03).
    // workspace is preserved; scope flips to the new value.
    rekeyScopedClientStores(scope);
    resetCorpusLocalStores();
    set(corpusLocalViewState(scope));
  },
  swapWorkspace: (workspace, scope) => {
    // WORKSPACE-LEVEL WHOLESALE swap (dashboard-workspace-registry ADR): the
    // SAME cross-store 022 reset a worktree swap performs, WIDENED so nothing
    // from the prior PROJECT's corpus survives. A coarser scope change must
    // clear at least as much as a worktree change, plus re-key the pin/lens
    // stores to the NEW WORKSPACE (a worktree swap preserves the workspace key;
    // a workspace swap does not, or the prior project's pins/lenses bleed in).
    // Re-key the pin and lens stores to the NEW WORKSPACE + the new scope — the
    // load-bearing difference from setScope, which preserves the workspace key.
    rekeyScopedClientStores(scope, workspace);
    resetCorpusLocalStores();
    set(corpusLocalViewState(scope));
  },
  seedFromSession: ({
    workspace,
    scope,
    folder,
    featureTags,
    openDocs,
    activeDocId,
  }) => {
    // Restore is not a user-initiated wholesale swap, but scoped client stores
    // still need the restored workspace+scope key before visual consumers read
    // pin/lens state.
    rekeyScopedClientStores(scope, workspace);
    // Restore the dock workspace tabs ATOMICALLY with the scope seed (this is the
    // one-shot session seed), so the tab restore cannot race the scope settle. Only
    // seed when the slice is empty — a restore must never clobber tabs the user has
    // already opened this session.
    set((state) => ({
      scope,
      activeFolder: folder,
      featureContexts: featureTags,
      ...(openDocs && openDocs.length > 0 && state.openDocs.length === 0
        ? { openDocs: [...openDocs], activeDocId: activeDocId ?? null }
        : {}),
    }));
  },
  setScopeContext: ({ folder, featureTags }) =>
    set({ activeFolder: folder, featureContexts: featureTags }),
  selectEntity: (selection) => set({ selection }),
  setHovered: (hoveredId) =>
    set((state) =>
      state.hoveredId === hoveredId
        ? state
        : { hoveredId, ...(hoveredId === null ? { dwelledHoverId: null } : {}) },
    ),
  setDwelledHover: (dwelledHoverId) =>
    set((state) =>
      state.dwelledHoverId === dwelledHoverId ? state : { dwelledHoverId },
    ),
  openNode: (id) =>
    set((state) => {
      // Move-to-end LRU cap (B3): re-opening an already-open id refreshes its
      // recency (so it is not evicted before genuinely-older entries), then the
      // tail-cap drops the oldest beyond OPENED_IDS_CAP so opened islands cannot
      // retain queries/payloads without bound across a session. openNode is a
      // user gesture, so rebuilding the array on re-open is negligible.
      const next = [...state.openedIds.filter((entry) => entry !== id), id];
      return {
        openedIds:
          next.length > OPENED_IDS_CAP
            ? next.slice(next.length - OPENED_IDS_CAP)
            : next,
      };
    }),
  closeNode: (id) =>
    set((state) => ({
      openedIds: state.openedIds.filter((entry) => entry !== id),
    })),
  openDoc: (nodeId, surface, permanent = false) =>
    set((state) => {
      const existing = state.openDocs.find((d) => d.nodeId === nodeId);
      if (existing) {
        // Already open: activate it, and promote if this open is a permanent
        // gesture on what was the provisional tab.
        const openDocs =
          permanent && existing.provisional
            ? state.openDocs.map((d) =>
                d.nodeId === nodeId ? { ...d, provisional: false } : d,
              )
            : state.openDocs;
        return openDocs === state.openDocs && state.activeDocId === nodeId
          ? state
          : { openDocs, activeDocId: nodeId };
      }
      const entry: OpenDoc = { nodeId, surface, provisional: !permanent };
      let openDocs: OpenDoc[];
      if (!permanent) {
        // Provisional (preview) open: REPLACE the existing provisional in place so
        // walking the rail reuses one preview tab rather than spawning many.
        const provIndex = state.openDocs.findIndex((d) => d.provisional);
        if (provIndex >= 0) {
          openDocs = state.openDocs.slice();
          openDocs[provIndex] = entry;
        } else {
          openDocs = [...state.openDocs, entry];
        }
      } else {
        openDocs = [...state.openDocs, entry];
      }
      return { openDocs: evictToCap(openDocs, nodeId), activeDocId: nodeId };
    }),
  promoteDoc: (nodeId) =>
    set((state) =>
      state.openDocs.some((d) => d.nodeId === nodeId && d.provisional)
        ? {
            openDocs: state.openDocs.map((d) =>
              d.nodeId === nodeId ? { ...d, provisional: false } : d,
            ),
          }
        : state,
    ),
  activateDoc: (nodeId) =>
    set((state) =>
      state.activeDocId === nodeId || !state.openDocs.some((d) => d.nodeId === nodeId)
        ? state
        : { activeDocId: nodeId },
    ),
  closeDoc: (nodeId) =>
    set((state) => {
      const index = state.openDocs.findIndex((d) => d.nodeId === nodeId);
      if (index < 0) return state;
      const openDocs = state.openDocs.filter((d) => d.nodeId !== nodeId);
      let activeDocId = state.activeDocId;
      if (state.activeDocId === nodeId) {
        // Activate the nearest neighbour: the tab now at this index (the former
        // next), else the previous, else none.
        const next = openDocs[index] ?? openDocs[index - 1] ?? null;
        activeDocId = next ? next.nodeId : null;
      }
      return { openDocs, activeDocId };
    }),
  reorderDocs: (orderedIds) =>
    set((state) => {
      const byId = new Map(state.openDocs.map((d) => [d.nodeId, d]));
      const reordered: OpenDoc[] = [];
      for (const id of orderedIds) {
        const doc = byId.get(id);
        if (doc) {
          reordered.push(doc);
          byId.delete(id);
        }
      }
      // Preserve any open doc dockview did not name (append in original order).
      for (const doc of state.openDocs) {
        if (byId.has(doc.nodeId)) reordered.push(doc);
      }
      const same =
        reordered.length === state.openDocs.length &&
        reordered.every((d, i) => d.nodeId === state.openDocs[i]?.nodeId);
      return same ? state : { openDocs: reordered };
    }),
  openEditor: (nodeId, text, baseBlobHash) =>
    set({
      editorTarget: { nodeId },
      draftText: text,
      baseBlobHash,
      editorStatus: "idle",
    }),
  setDraft: (text) =>
    set((state) =>
      state.draftText === text ? state : { draftText: text, editorStatus: "dirty" },
    ),
  markSaving: () => set({ editorStatus: "saving" }),
  // Adopt the new blob hash as the next concurrency base so a follow-on edit saves
  // against the fresh on-disk blob, not the stale one (no phantom conflict).
  markSaved: (blobHash) => set({ editorStatus: "saved", baseBlobHash: blobHash }),
  markConflict: () => set({ editorStatus: "conflict" }),
  markFailed: () => set({ editorStatus: "save-failed" }),
  closeEditor: () =>
    set({
      editorTarget: null,
      draftText: "",
      baseBlobHash: "",
      editorStatus: "idle",
    }),
  pinDiscovery: (edge) =>
    set((state) => {
      if (state.pinnedDiscoveries.some((e) => e.id === edge.id)) return state;
      const next = [...state.pinnedDiscoveries, edge];
      return {
        pinnedDiscoveries:
          next.length > PINNED_DISCOVERIES_CAP
            ? next.slice(next.length - PINNED_DISCOVERIES_CAP)
            : next,
      };
    }),
  unpinDiscovery: (edgeId) =>
    set((state) => ({
      pinnedDiscoveries: state.pinnedDiscoveries.filter((e) => e.id !== edgeId),
    })),
  pruneNodeAffordances: (nodeIds) =>
    set((state) => {
      const valid = new Set(nodeIds);
      const selection =
        state.selection?.kind === "event"
          ? (() => {
              const nodeIds = state.selection.nodeIds.filter((id) => valid.has(id));
              return nodeIds.length === state.selection.nodeIds.length
                ? state.selection
                : { ...state.selection, nodeIds };
            })()
          : state.selection;
      const workingSet = state.workingSet.filter((id) => valid.has(id));
      const openedIds = state.openedIds.filter((id) => valid.has(id));
      const hoveredId =
        state.hoveredId !== null && !valid.has(state.hoveredId)
          ? null
          : state.hoveredId;
      const dwelledHoverId =
        state.dwelledHoverId !== null && !valid.has(state.dwelledHoverId)
          ? null
          : state.dwelledHoverId;
      const pinnedDiscoveries = state.pinnedDiscoveries.filter(
        (edge) => valid.has(edge.src) && valid.has(edge.dst),
      );
      const nextSelection =
        selection?.kind === "event" && selection.nodeIds.length === 0
          ? null
          : selection;
      if (
        nextSelection === state.selection &&
        hoveredId === state.hoveredId &&
        dwelledHoverId === state.dwelledHoverId &&
        workingSet.length === state.workingSet.length &&
        openedIds.length === state.openedIds.length &&
        pinnedDiscoveries.length === state.pinnedDiscoveries.length
      ) {
        return state;
      }
      return {
        selection: nextSelection,
        hoveredId,
        dwelledHoverId,
        workingSet,
        openedIds,
        pinnedDiscoveries,
      };
    }),
  addToWorkingSet: (id) =>
    set((state) => {
      if (state.workingSet.includes(id)) return state;
      const next = [...state.workingSet, id];
      return {
        workingSet:
          next.length > WORKING_SET_CAP
            ? next.slice(next.length - WORKING_SET_CAP)
            : next,
      };
    }),
  removeFromWorkingSet: (id) =>
    set((state) => ({
      workingSet: state.workingSet.filter((entry) => entry !== id),
    })),
  clearWorkingSet: () => set({ workingSet: [] }),
  setOverlays: (overlays) => set({ overlays: graphOverlays(overlays) }),
  setLeftRailVisible: (leftRailVisible) => set({ leftRailVisible }),
  setLeftRailWidth: (width) =>
    set({ leftRailWidth: clamp(width, LEFT_RAIL_MIN_WIDTH, LEFT_RAIL_MAX_WIDTH) }),
  setRightRailWidth: (width) =>
    set({ rightRailWidth: clamp(width, RIGHT_RAIL_MIN_WIDTH, RIGHT_RAIL_MAX_WIDTH) }),
  setTimelineVisible: (timelineVisible) => set({ timelineVisible }),
  setTimelineHeight: (height) =>
    set({
      timelineHeight: clamp(height, TIMELINE_MIN_HEIGHT, TIMELINE_MAX_HEIGHT),
    }),
  setPanelFlyoutOpen: (panelFlyoutOpen) => set({ panelFlyoutOpen }),
  togglePanelFlyout: () =>
    set((state) => ({ panelFlyoutOpen: !state.panelFlyoutOpen })),
  resetShellLayout: () =>
    set({
      leftRailVisible: true,
      leftRailWidth: LEFT_RAIL_DEFAULT_WIDTH,
      rightRailWidth: RIGHT_RAIL_DEFAULT_WIDTH,
      timelineVisible: true,
      timelineHeight: TIMELINE_DEFAULT_HEIGHT,
      panelFlyoutOpen: false,
    }),
}));
