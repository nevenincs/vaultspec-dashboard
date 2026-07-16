import { create } from "zustand";

import { normalizeNodeId, normalizeNodeIds } from "../nodeIds";
import { resetLiveStatus } from "../server/liveStatus";
import { resetBrowserMode } from "./browserMode";
import { resetBrowserTreeExpansion } from "./browserTreeExpansion";
import { resetCodeViewerScroll } from "./codeViewer";
import { resetCommandPalette } from "./commandPalette";
import { resetContextMenu } from "./contextMenu";
import { resetCreateDocChrome } from "./createDocChrome";
import { resetFilterSidebar } from "./filterSidebar";
import { resetGraphControlsChrome } from "./graphControlsChrome";
import { resetInspectorExpansion } from "./inspectorExpansion";
import { resetIslandAnchors } from "./islandAnchors";
import { resetKeyActions } from "./keymapDispatcher";
import { resetKeyboardShortcuts } from "./keyboardShortcuts";
import { useLensStore } from "./lenses";
import { usePinStore } from "./pins";
import { resetPipelineExpansion } from "./pipelineExpansion";
import { resetSearchIntent } from "./searchIntent";
import { resetSettingsKeybindingRecorder } from "./settingsControls";
import { resetStatusTabChrome } from "./statusTabChrome";
import { resetTimelineViewState } from "./timeline";
import { resetWorktreePickerChrome } from "./worktreePickerChrome";
import {
  normalizeViewStoreSessionString as normalizeViewStoreSessionStringIdentity,
  normalizeViewStoreSessionStringList as normalizeViewStoreSessionStringListIdentity,
  SCOPE_ID_MAX_CHARS as SCOPE_ID_MAX_CHARS_IDENTITY,
  VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS as VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS_IDENTITY,
} from "./scopeIdentity";

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
  /**
   * The worktree scope the tab was OPENED in (per-tab-scope-binding). A tab reads
   * its content, comments, and editor mutations against THIS scope, not the
   * dashboard's currently-active scope — so a document opened in one workspace keeps
   * resolving after the shared engine session's active scope switches to another
   * (the "every document is empty" incident).
   *
   * THE ATTRIBUTION LAW (ambient-scope audit): any client state carrying scope-bearing
   * ids — a tab's node id, a stem, a folder, a feature tag — is attributed with its
   * ORIGIN scope and read against THAT scope, never the ambient active one. Attribution
   * over reset: a foreign active-scope flip must never silently re-interpret a passive
   * client's state under the new corpus. A tab's origin is the scope it was opened in;
   * a RESTORED tab's origin is the scope whose per-scope `scope_context` blob carried
   * it (`parseWorkspaceTabs(blob, originScope)`), so even a legacy v1 layout binds to a
   * provable origin, never null. `null` remains only for a genuinely unknown tab and
   * falls back to the active scope at read time. Optional so a fixture or a pre-binding
   * literal is still a valid `OpenDoc`; `normalizeOpenDocs` always populates it
   * (defaulting to null), so a normalized tab always carries the field.
   */
  scope?: string | null;
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
  /**
   * The scope the editor was opened AGAINST (per-tab-scope-binding): the tab's own
   * scope, pinned at open. EVERY save path — the in-panel Save/frontmatter/rename and
   * the Mod+S keybinding — reads scope from HERE so a document is always written to
   * the corpus it was opened in, never the dashboard's ambient active scope (a
   * cross-scope tab + Mod+S would otherwise write the stem against the wrong corpus:
   * a conflict at best, a same-named-doc overwrite at worst). `null` falls back to the
   * active scope, matching a legacy tab.
   */
  scope: string | null;
}

export const EDITOR_DRAFT_TEXT_MAX_CHARS = 512 * 1024;
export const EDITOR_BLOB_HASH_MAX_CHARS = 128;

export function normalizeEditorTextValue(
  value: unknown,
  maxChars = EDITOR_DRAFT_TEXT_MAX_CHARS,
): string {
  if (typeof value !== "string") return "";
  return value.length <= maxChars ? value : value.slice(0, maxChars);
}

export function normalizeEditorBlobHash(value: unknown): string {
  return normalizeEditorTextValue(value, EDITOR_BLOB_HASH_MAX_CHARS);
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

export type GraphOverlayInput = Partial<Record<keyof GraphOverlayState, unknown>>;

function graphOverlayInputRecord(value: unknown): GraphOverlayInput | null {
  return value !== null && typeof value === "object"
    ? (value as GraphOverlayInput)
    : null;
}

export function normalizeGraphOverlays(overlays: unknown): GraphOverlayState {
  const record = graphOverlayInputRecord(overlays);
  return {
    featureCountries:
      typeof record?.featureCountries === "boolean"
        ? record.featureCountries
        : DEFAULT_GRAPH_OVERLAYS.featureCountries,
    featureHulls:
      typeof record?.featureHulls === "boolean"
        ? record.featureHulls
        : DEFAULT_GRAPH_OVERLAYS.featureHulls,
  };
}

/** The scene's WebGL render-capability signal (the `render-capability` SceneEvent):
 *  the scene DETECTS + REPORTS, the chrome surfaces the designed CanvasState. `ok`
 *  (including the software-fallback that still RENDERS) is render-OK; only
 *  `context-lost` / `unavailable` drive a degraded canvas state. */
export type RenderCapabilityStatus = "ok" | "context-lost" | "unavailable";

export interface RenderCapability {
  status: RenderCapabilityStatus;
  recoverable: boolean;
}

export const DEFAULT_RENDER_CAPABILITY: RenderCapability = {
  status: "ok",
  recoverable: false,
};

export function normalizeRenderCapability(signal: unknown): RenderCapability {
  const record =
    signal !== null && typeof signal === "object"
      ? (signal as Record<string, unknown>)
      : null;
  const state = record?.["state"];
  return {
    status: state === "context-lost" || state === "unavailable" ? state : "ok",
    recoverable: record?.["recoverable"] === true,
  };
}

export const normalizeViewStoreSessionString = normalizeViewStoreSessionStringIdentity;
export const normalizeViewStoreSessionStringList =
  normalizeViewStoreSessionStringListIdentity;
export const SCOPE_ID_MAX_CHARS = SCOPE_ID_MAX_CHARS_IDENTITY;
export const VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS =
  VIEW_STORE_SESSION_STRING_LIST_MAX_ITEMS_IDENTITY;

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
  /**
   * Supplementary edge/event selection metadata — VIEW-LOCAL BY DESIGN (SRR-004).
   * The canonical NODE selection is shared corpus intent: it rides dashboard-state
   * `selected_ids` (one record, one write seam) and is written through
   * `patchDashboardState` on every selection. This slice carries only WHICH
   * edge/event the current selection came from — a rendering concern (which edge to
   * emphasize), not cross-surface corpus intent — so it stays local chrome, like
   * `hoveredId` below. No second surface consumes it today; promoting it onto
   * dashboard-state is warranted ONLY when one genuinely needs to read the selected
   * edge/event from the shared record (architecture-boundaries: local view stores
   * hold only local chrome).
   */
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
   * Latch: the user has INTENTIONALLY emptied the workspace (closed the last open
   * document). It distinguishes a user close-all from a TRANSIENT/system empty (the
   * load window before the durable session seed lands, or a scope/workspace swap
   * reset). The durable-workspace restore must NOT re-seed the last document the
   * instant it is closed (the bug where the split panel could never be hidden), and
   * the persist may write the empty layout durably only on this intent. Reset to
   * false whenever a document opens or the corpus is swapped.
   */
  workspaceCleared: boolean;
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
   * The document body text captured when the editor opened — the "base" for the
   * draft-vs-saved diff (authoring-surface ADR D4). Matches `draftText` at open
   * (status `idle`); stays frozen while the draft diverges. Empty when no editor
   * is open. A SINGLE string, never a history (bounded-by-default).
   */
  editorBaseText: string;
  /**
   * Whether the in-editor diff panel is expanded (authoring-surface ADR D4).
   * False when no editor is open or the panel is collapsed. View-local chrome —
   * the toggle is reachable from keymap + palette under one shared action id.
   */
  editorDiffVisible: boolean;
  /**
   * Overlay visibility (graph-representation ADR): feature-country labels at
   * overview and BubbleSets hulls at document LOD. Owned here, emitted as
   * `set-overlays`.
   */
  overlays: GraphOverlayState;
  /** The scene's reported WebGL render-capability (render-capability SceneEvent). */
  renderCapability: RenderCapability;

  /** Switch the worktree scope — swaps the stage's scope wholesale. */
  setScope: (scope: unknown) => void;
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
  swapWorkspace: (workspace: unknown, scope: unknown) => void;
  /**
   * Seed the scope + folder context from the restored session (W04.P09.S30).
   * Used by the stores-layer restore hook on session load: it mirrors the
   * durable session shape into the view store WITHOUT triggering the wholesale
   * reset (which is for a user-initiated swap, not a restore). Durable
   * persistence is the session API's job, not this setter's.
   */
  seedFromSession: (context: {
    workspace: unknown;
    scope: unknown;
    folder: unknown;
    featureTags: unknown;
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
  setScopeContext: (context: { folder: unknown; featureTags: unknown }) => void;
  mirrorSessionScopeContext: (context: {
    folder: unknown;
    featureTags: unknown;
  }) => void;
  /** Select event/edge metadata that is not just a node id. */
  selectEntity: (selection: Selection) => void;
  /** Set the transient hovered node id (view-local; never persisted to the wire). */
  setHovered: (id: unknown) => void;
  /** Set the hover id that survived the card dwell gate. */
  setDwelledHover: (id: unknown) => void;
  openNode: (id: unknown) => void;
  closeNode: (id: unknown) => void;
  /**
   * Open a document tab (editor-dock-workspace). `permanent: false` (default, a
   * single-click/preview) opens or replaces the single provisional tab IN PLACE;
   * `permanent: true` (a double-click/explicit open) opens a permanent tab, or
   * promotes the doc if it is already the provisional one. Re-opening an
   * already-open doc activates it (and promotes it when `permanent`). Bounded:
   * adding beyond `MAX_OPEN_DOCS` evicts the oldest non-active permanent tab.
   */
  openDoc: (
    nodeId: unknown,
    surface: unknown,
    permanent?: unknown,
    scope?: unknown,
  ) => void;
  /** Promote the provisional tab (or a given doc) to permanent (clears its
   *  `provisional` flag) — on double-click, first edit, or a tab drag. */
  promoteDoc: (nodeId: unknown) => void;
  /** Make a tab the active one (a tab click or a dockview activation). */
  activateDoc: (nodeId: unknown) => void;
  /** Close a tab; if it was active, activate its nearest neighbour. */
  closeDoc: (nodeId: unknown) => void;
  /** Close ALL document tabs (#15 "Close all documents"); latches the cleared
   *  workspace and tears down any open editor. */
  closeAllDocs: () => void;
  /** Reorder the open docs to match dockview's geometry (after a tab drag),
   *  reconciling by id; unknown ids are dropped and missing ones preserved. */
  reorderDocs: (orderedIds: unknown) => void;
  /**
   * Open a document for editing (document-editor backend): seed the editor with
   * the target node id, the just-read body text as the initial draft, and that
   * read's `blob_hash` as the optimistic-concurrency base; status begins `idle`
   * (the draft equals the saved text). Replaces any prior open editor (one doc at
   * a time, bounded-by-default).
   */
  openEditor: (
    nodeId: unknown,
    text: unknown,
    baseBlobHash: unknown,
    scope?: unknown,
  ) => void;
  /** Update the draft body; marks the editor `dirty` (the draft diverges from the
   *  saved text). A no-op write (same text) is short-circuited so an idle keypress
   *  stream does not churn subscribers. */
  setDraft: (text: unknown) => void;
  /** Mark a save in flight (status → `saving`). */
  markSaving: () => void;
  /** Mark a save landed (status → `saved`): adopt the new `blob_hash` as the next
   *  concurrency base so a subsequent edit saves against the fresh blob, and advance
   *  `editorBaseText` to the text that was committed (so the diff panel compares
   *  against what is actually on disk, not the stale open-time snapshot). */
  markSaved: (blobHash: unknown, savedText: string) => void;
  /** Mark a blob-hash conflict (status → `conflict`): the optimistic base went
   *  stale (someone else wrote). The draft is retained for the reconcile UI. */
  markConflict: () => void;
  /** Mark a save failure (status → `save-failed`): a transport fault or a
   *  validation refusal. The draft is retained so the edit is not lost. */
  markFailed: () => void;
  /** Close the editor (clears the target, draft, base, diff state, and resets
   *  status to `idle`) — the same single-value clear a scope swap performs. */
  closeEditor: () => void;
  /** Toggle the in-editor draft-vs-saved diff panel (authoring-surface ADR D4).
   *  A no-op when no editor is open (diff state resets on open/close anyway). */
  toggleEditorDiff: () => void;
  /**
   * Reconcile view-local node affordances against the currently held graph model.
   * These ids are visual subscriptions, not durable truth: when the canonical graph
   * slice no longer carries a node, its event-selection ring, opened island, or
   * working-set expansion must not keep retaining observers.
   */
  pruneNodeAffordances: (nodeIds: readonly string[]) => void;
  addToWorkingSet: (id: unknown) => void;
  removeFromWorkingSet: (id: unknown) => void;
  clearWorkingSet: () => void;
  /** Set overlay visibility (feature countries, feature hulls). */
  setOverlays: (overlays: unknown) => void;
  setRenderCapability: (signal: unknown) => void;

  /** Whether the entire left rail bar is mounted in the shell layout. */
  leftRailVisible: boolean;
  /** Expanded left rail width in pixels; collapsed icon width is shell-owned. */
  leftRailWidth: number;
  /** Expanded right rail width in pixels. */
  rightRailWidth: number;
  /** Docked Agent panel width in pixels (agentic-authoring-ux ADR D1). A shell
   *  column like the rails; its open flag lives in the agent-panel view store. */
  agentPanelWidth: number;
  /** Whether the bottom timeline region is mounted in the shell layout. */
  timelineVisible: boolean;
  /** Whether the graph element is mounted in the shell layout. The timeline is
   *  tethered to the graph (they are one panel), so hiding the graph also hides
   *  the timeline; the documents pane then takes the full center width. */
  graphVisible: boolean;
  /** Expanded timeline height in pixels. */
  timelineHeight: number;
  setLeftRailVisible: (visible: unknown) => void;
  setLeftRailWidth: (width: unknown) => void;
  setRightRailWidth: (width: unknown) => void;
  setAgentPanelWidth: (width: unknown) => void;
  setTimelineVisible: (visible: unknown) => void;
  setGraphVisible: (visible: unknown) => void;
  setTimelineHeight: (height: unknown) => void;
  /**
   * FOLLOW MODE (follow-mode-selection-sync): when on (the default), the rail and
   * graph SELECTION stay tethered bidirectionally — selecting a rail feature
   * highlights + frames its nodes on the graph, and selecting a graph node selects
   * + expands its feature entry in the rail. VIEW-LOCAL ONLY (a view-behavior
   * toggle like hover, never a filter and never the wire). Opt-in, default ON,
   * flipped by the shared `toggleFollowModeAction` from the context menu. Consumers
   * gate their cross-surface selection projection on this. */
  followMode: boolean;
  setFollowMode: (on: unknown) => void;
  toggleFollowMode: () => void;
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
export const LEFT_RAIL_DEFAULT_WIDTH = 252;
export const RIGHT_RAIL_MIN_WIDTH = 220;
export const RIGHT_RAIL_MAX_WIDTH = 420;
export const RIGHT_RAIL_DEFAULT_WIDTH = 290;
// The docked Agent panel (agentic-authoring-ux ADR D1) is a shell-layout column
// like the rails: its width lives here (canonical, resettable, shared-resize
// state), a touch wider than the activity rail since it holds a conversation.
export const AGENT_PANEL_MIN_WIDTH = 320;
export const AGENT_PANEL_MAX_WIDTH = 640;
export const AGENT_PANEL_DEFAULT_WIDTH = 400;
export const TIMELINE_MIN_HEIGHT = 120;
export const TIMELINE_MAX_HEIGHT = 360;
export const TIMELINE_DEFAULT_HEIGHT = 212;

export function normalizeViewerSurface(surface: unknown): ViewerSurface {
  return surface === "code" ? "code" : "markdown";
}

export function normalizeOpenDocs(openDocs: unknown): OpenDoc[] {
  if (!Array.isArray(openDocs)) return [];
  const normalized: OpenDoc[] = [];
  const seen = new Set<string>();
  let changed = openDocs.length > MAX_OPEN_DOCS;
  for (let index = 0; index < openDocs.length; index += 1) {
    if (normalized.length >= MAX_OPEN_DOCS) break;
    const doc = openDocs[index] as Partial<OpenDoc> | null | undefined;
    if (!doc || typeof doc !== "object") {
      changed = true;
      continue;
    }
    const nodeId = normalizeNodeId(doc.nodeId);
    if (nodeId === null || seen.has(nodeId)) {
      changed = true;
      continue;
    }
    const surface = normalizeViewerSurface(doc.surface);
    const provisional = doc.provisional === true;
    // The opened-in scope; null (legacy/unknown) is valid and falls back to the
    // active scope at read time (per-tab-scope-binding).
    const scope = normalizeViewStoreSessionString(doc.scope);
    if (nodeId !== doc.nodeId || normalized.length !== index) changed = true;
    if (surface !== doc.surface || provisional !== doc.provisional) changed = true;
    if (scope !== doc.scope) changed = true;
    seen.add(nodeId);
    normalized.push(
      changed ? { ...doc, nodeId, surface, provisional, scope } : (doc as OpenDoc),
    );
  }
  // Provisional-last invariant (#15): the single preview tab always sits at the
  // END of the strip (VS Code preview). Stable-partition so permanent tabs keep
  // their relative order and the provisional follows; if that reorders the set the
  // input was not canonical, so return the reordered array (not the input ref).
  const provisional = normalized.filter((doc) => doc.provisional);
  if (provisional.length > 0) {
    const ordered = [...normalized.filter((doc) => !doc.provisional), ...provisional];
    if (ordered.some((doc, index) => doc !== normalized[index])) {
      return ordered;
    }
  }
  return changed ? normalized : (openDocs as OpenDoc[]);
}

export function normalizeActiveDocId(
  openDocs: unknown,
  activeDocId: unknown,
): string | null {
  const normalizedOpenDocs = normalizeOpenDocs(openDocs);
  const nodeId = normalizeNodeId(activeDocId);
  return nodeId !== null && normalizedOpenDocs.some((doc) => doc.nodeId === nodeId)
    ? nodeId
    : (normalizedOpenDocs[0]?.nodeId ?? null);
}

export function normalizeShellLayoutVisible(value: unknown): boolean {
  return value === true;
}

export function normalizeShellLayoutPanelSize(
  value: unknown,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return min;
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

function rekeyScopedClientStores(scope: unknown, workspace?: unknown): void {
  const nextWorkspace =
    normalizeViewStoreSessionString(workspace) ?? usePinStore.getState().workspace;
  const nextScope = normalizeViewStoreSessionString(scope) ?? "default";
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
  resetFilterSidebar();
  resetGraphControlsChrome();
  resetIslandAnchors();
  resetKeyboardShortcuts();
  resetKeyActions();
  resetSettingsKeybindingRecorder();
  resetStatusTabChrome();
  resetWorktreePickerChrome();
}

function corpusLocalViewState(scope: unknown) {
  const normalizedScope = normalizeViewStoreSessionString(scope);
  return {
    scope: normalizedScope,
    activeFolder: null,
    featureContexts: [],
    selection: null,
    hoveredId: null,
    dwelledHoverId: null,
    workingSet: [],
    openedIds: [],
    openDocs: [],
    activeDocId: null,
    workspaceCleared: false,
    editorTarget: null,
    draftText: "",
    baseBlobHash: "",
    editorStatus: "idle" as const,
    editorBaseText: "",
    editorDiffVisible: false,
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
  workspaceCleared: false,
  editorTarget: null,
  draftText: "",
  baseBlobHash: "",
  editorStatus: "idle",
  editorBaseText: "",
  editorDiffVisible: false,
  overlays: normalizeGraphOverlays(DEFAULT_GRAPH_OVERLAYS),
  renderCapability: DEFAULT_RENDER_CAPABILITY,
  leftRailVisible: true,
  leftRailWidth: LEFT_RAIL_DEFAULT_WIDTH,
  rightRailWidth: RIGHT_RAIL_DEFAULT_WIDTH,
  agentPanelWidth: AGENT_PANEL_DEFAULT_WIDTH,
  timelineVisible: true,
  graphVisible: true,
  timelineHeight: TIMELINE_DEFAULT_HEIGHT,
  // Follow mode is opt-in but ON by default (follow-mode-selection-sync).
  followMode: true,

  setScope: (scope) => {
    const normalizedScope = normalizeViewStoreSessionString(scope);
    // WHOLESALE swap (ADR §2.1; finding scope-swap-partial-reset-022):
    // everything scoped to the previous corpus resets — selection, working
    // set, opened islands (old-corpus state must not ride into the new slice).
    // Re-key the pin and lens stores so the previous scope's pins/lenses do
    // not bleed into the new scope (finding-018/022/023; isolation-01/02/03).
    // workspace is preserved; scope flips to the new value.
    rekeyScopedClientStores(normalizedScope);
    resetCorpusLocalStores();
    set(corpusLocalViewState(normalizedScope));
  },
  swapWorkspace: (workspace, scope) => {
    const normalizedWorkspace = normalizeViewStoreSessionString(workspace);
    const normalizedScope = normalizeViewStoreSessionString(scope);
    // WORKSPACE-LEVEL WHOLESALE swap (dashboard-workspace-registry ADR): the
    // SAME cross-store 022 reset a worktree swap performs, WIDENED so nothing
    // from the prior PROJECT's corpus survives. A coarser scope change must
    // clear at least as much as a worktree change, plus re-key the pin/lens
    // stores to the NEW WORKSPACE (a worktree swap preserves the workspace key;
    // a workspace swap does not, or the prior project's pins/lenses bleed in).
    // Re-key the pin and lens stores to the NEW WORKSPACE + the new scope — the
    // load-bearing difference from setScope, which preserves the workspace key.
    rekeyScopedClientStores(normalizedScope, normalizedWorkspace);
    resetCorpusLocalStores();
    set(corpusLocalViewState(normalizedScope));
  },
  seedFromSession: ({
    workspace,
    scope,
    folder,
    featureTags,
    openDocs,
    activeDocId,
  }) => {
    const normalizedWorkspace = normalizeViewStoreSessionString(workspace);
    const normalizedScope = normalizeViewStoreSessionString(scope);
    const normalizedFolder = normalizeViewStoreSessionString(folder);
    const normalizedFeatureTags = normalizeViewStoreSessionStringList(featureTags);
    // Restore is not a user-initiated wholesale swap, but scoped client stores
    // still need the restored workspace+scope key before visual consumers read
    // pin/lens state.
    rekeyScopedClientStores(normalizedScope, normalizedWorkspace);
    // Restore the dock workspace tabs ATOMICALLY with the scope seed (this is the
    // one-shot session seed), so the tab restore cannot race the scope settle. Only
    // seed when the slice is empty — a restore must never clobber tabs the user has
    // already opened this session.
    const restoredOpenDocs = normalizeOpenDocs(openDocs ?? []);
    const restoredActiveDocId = normalizeActiveDocId(restoredOpenDocs, activeDocId);
    set((state) => ({
      scope: normalizedScope,
      activeFolder: normalizedFolder,
      featureContexts: normalizedFeatureTags,
      ...(restoredOpenDocs.length > 0 && state.openDocs.length === 0
        ? { openDocs: restoredOpenDocs, activeDocId: restoredActiveDocId }
        : {}),
    }));
  },
  setScopeContext: ({ folder, featureTags }) =>
    set({
      activeFolder: normalizeViewStoreSessionString(folder),
      featureContexts: normalizeViewStoreSessionStringList(featureTags),
    }),
  mirrorSessionScopeContext: ({ folder, featureTags }) =>
    set({
      activeFolder: normalizeViewStoreSessionString(folder),
      featureContexts: normalizeViewStoreSessionStringList(featureTags),
    }),
  selectEntity: (selection) => set({ selection }),
  setHovered: (hoveredId) =>
    set((state) => {
      const nodeId = normalizeNodeId(hoveredId);
      return state.hoveredId === nodeId
        ? state
        : { hoveredId: nodeId, ...(nodeId === null ? { dwelledHoverId: null } : {}) };
    }),
  setDwelledHover: (dwelledHoverId) =>
    set((state) => {
      const nodeId = normalizeNodeId(dwelledHoverId);
      return state.dwelledHoverId === nodeId ? state : { dwelledHoverId: nodeId };
    }),
  openNode: (id) =>
    set((state) => {
      const nodeId = normalizeNodeId(id);
      if (nodeId === null) return state;
      // Move-to-end LRU cap (B3): re-opening an already-open id refreshes its
      // recency (so it is not evicted before genuinely-older entries), then the
      // tail-cap drops the oldest beyond OPENED_IDS_CAP so opened islands cannot
      // retain queries/payloads without bound across a session. openNode is a
      // user gesture, so rebuilding the array on re-open is negligible.
      const next = [...state.openedIds.filter((entry) => entry !== nodeId), nodeId];
      return {
        openedIds:
          next.length > OPENED_IDS_CAP
            ? next.slice(next.length - OPENED_IDS_CAP)
            : next,
      };
    }),
  closeNode: (id) =>
    set((state) => {
      const nodeId = normalizeNodeId(id);
      if (nodeId === null) return state;
      return { openedIds: state.openedIds.filter((entry) => entry !== nodeId) };
    }),
  openDoc: (nodeId, surface, permanent = false, scope) =>
    set((state) => {
      const docNodeId = normalizeNodeId(nodeId);
      if (docNodeId === null) return state;
      const normalizedSurface = normalizeViewerSurface(surface);
      // The scope the tab is opened in (per-tab-scope-binding); null falls back to
      // the active scope at read time. An already-open doc keeps its original scope
      // (re-opening/activating a tab must not silently re-scope it).
      const normalizedScope = normalizeViewStoreSessionString(scope);
      const permanentOpen = permanent === true;
      const existing = state.openDocs.find((d) => d.nodeId === docNodeId);
      if (existing) {
        // Already open: activate it, and promote if this open is a permanent
        // gesture on what was the provisional tab.
        const openDocs =
          permanentOpen && existing.provisional
            ? state.openDocs.map((d) =>
                d.nodeId === docNodeId ? { ...d, provisional: false } : d,
              )
            : state.openDocs;
        return openDocs === state.openDocs &&
          state.activeDocId === docNodeId &&
          !state.workspaceCleared
          ? state
          : { openDocs, activeDocId: docNodeId, workspaceCleared: false };
      }
      const entry: OpenDoc = {
        nodeId: docNodeId,
        surface: normalizedSurface,
        provisional: !permanentOpen,
        scope: normalizedScope,
      };
      let openDocs: OpenDoc[];
      if (!permanentOpen) {
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
      return {
        openDocs: evictToCap(openDocs, docNodeId),
        activeDocId: docNodeId,
        workspaceCleared: false,
      };
    }),
  promoteDoc: (nodeId) =>
    set((state) => {
      const docNodeId = normalizeNodeId(nodeId);
      if (docNodeId === null) return state;
      return state.openDocs.some((d) => d.nodeId === docNodeId && d.provisional)
        ? {
            openDocs: state.openDocs.map((d) =>
              d.nodeId === docNodeId ? { ...d, provisional: false } : d,
            ),
          }
        : state;
    }),
  activateDoc: (nodeId) =>
    set((state) => {
      const docNodeId = normalizeNodeId(nodeId);
      if (docNodeId === null) return state;
      return state.activeDocId === docNodeId ||
        !state.openDocs.some((d) => d.nodeId === docNodeId)
        ? state
        : { activeDocId: docNodeId };
    }),
  closeDoc: (nodeId) =>
    set((state) => {
      const docNodeId = normalizeNodeId(nodeId);
      if (docNodeId === null) return state;
      const index = state.openDocs.findIndex((d) => d.nodeId === docNodeId);
      if (index < 0) return state;
      const openDocs = state.openDocs.filter((d) => d.nodeId !== docNodeId);
      let activeDocId = state.activeDocId;
      if (state.activeDocId === docNodeId) {
        // Activate the nearest neighbour: the tab now at this index (the former
        // next), else the previous, else none.
        const next = openDocs[index] ?? openDocs[index - 1] ?? null;
        activeDocId = next ? next.nodeId : null;
      }
      return {
        openDocs,
        activeDocId,
        // Closing the LAST document is an INTENTIONAL empty: latch it so the durable
        // restore does not immediately re-seed the tab and the split panel actually
        // hides. A non-last close leaves the latch false (docs remain).
        workspaceCleared: openDocs.length === 0,
        // Closing a tab that is the open editor target must tear the editor down too;
        // a dangling editorTarget for a closed tab is stale state (bounded-by-default
        // single-editor invariant).
        ...(state.editorTarget?.nodeId === docNodeId
          ? {
              editorTarget: null,
              draftText: "",
              baseBlobHash: "",
              editorStatus: "idle" as const,
              editorBaseText: "",
              editorDiffVisible: false,
            }
          : {}),
      };
    }),
  closeAllDocs: () =>
    set((state) => {
      if (state.openDocs.length === 0 && state.activeDocId === null) return state;
      return {
        openDocs: [],
        activeDocId: null,
        // Closing EVERY document is an intentional empty: latch workspaceCleared so
        // the durable restore does not re-seed a tab (mirrors the last-close latch
        // in closeDoc). Any open editor target is now stale — tear it down.
        workspaceCleared: true,
        editorTarget: null,
        draftText: "",
        baseBlobHash: "",
        editorStatus: "idle" as const,
        editorBaseText: "",
        editorDiffVisible: false,
      };
    }),
  reorderDocs: (orderedIds) =>
    set((state) => {
      const byId = new Map(state.openDocs.map((d) => [d.nodeId, d]));
      const reordered: OpenDoc[] = [];
      const normalizedOrderedIds = Array.isArray(orderedIds)
        ? normalizeNodeIds(orderedIds, orderedIds.length)
        : [];
      for (const id of normalizedOrderedIds) {
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
  openEditor: (nodeId, text, baseBlobHash, scope) =>
    set((state) => {
      const docNodeId = normalizeNodeId(nodeId);
      if (docNodeId === null) return state;
      const normalizedText = normalizeEditorTextValue(text);
      return {
        editorTarget: {
          nodeId: docNodeId,
          scope: normalizeViewStoreSessionString(scope),
        },
        draftText: normalizedText,
        baseBlobHash: normalizeEditorBlobHash(baseBlobHash),
        editorStatus: "idle",
        // Capture the opening text as the diff base; reset the diff panel so
        // each new editing session starts collapsed (authoring-surface ADR D4).
        editorBaseText: normalizedText,
        editorDiffVisible: false,
      };
    }),
  setDraft: (text) =>
    set((state) => {
      const draftText = normalizeEditorTextValue(text);
      return state.draftText === draftText
        ? state
        : { draftText, editorStatus: "dirty" };
    }),
  markSaving: () => set({ editorStatus: "saving" }),
  // Adopt the new blob hash as the next concurrency base so a follow-on edit saves
  // against the fresh on-disk blob, not the stale one (no phantom conflict). But DON'T
  // mask an edit-during-save: the textarea stays editable while a save is in flight, so
  // a keystroke after `markSaving` sets status back to "dirty"; a then-incoming
  // `markSaved` must KEEP "dirty" (the raced draft is unsaved) so the unsaved-edit guard
  // still protects it — only flip to "saved" when no edit raced.
  // Always advance `editorBaseText` to the committed text (the exact draft that was sent
  // to the wire) so the diff panel compares draft-vs-SAVED, not draft-vs-open-time.
  markSaved: (blobHash, savedText) =>
    set((state) => ({
      baseBlobHash: normalizeEditorBlobHash(blobHash),
      editorStatus: state.editorStatus === "dirty" ? "dirty" : "saved",
      editorBaseText: savedText,
    })),
  markConflict: () => set({ editorStatus: "conflict" }),
  markFailed: () => set({ editorStatus: "save-failed" }),
  closeEditor: () =>
    set({
      editorTarget: null,
      draftText: "",
      baseBlobHash: "",
      editorStatus: "idle",
      editorBaseText: "",
      editorDiffVisible: false,
    }),
  toggleEditorDiff: () =>
    set((state) => ({ editorDiffVisible: !state.editorDiffVisible })),
  pruneNodeAffordances: (nodeIds) =>
    set((state) => {
      const valid = new Set(normalizeNodeIds(nodeIds, nodeIds.length));
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
      const nextSelection =
        selection?.kind === "event" && selection.nodeIds.length === 0
          ? null
          : selection;
      if (
        nextSelection === state.selection &&
        hoveredId === state.hoveredId &&
        dwelledHoverId === state.dwelledHoverId &&
        workingSet.length === state.workingSet.length &&
        openedIds.length === state.openedIds.length
      ) {
        return state;
      }
      return {
        selection: nextSelection,
        hoveredId,
        dwelledHoverId,
        workingSet,
        openedIds,
      };
    }),
  addToWorkingSet: (id) =>
    set((state) => {
      const nodeId = normalizeNodeId(id);
      if (nodeId === null || state.workingSet.includes(nodeId)) return state;
      const next = [...state.workingSet, nodeId];
      return {
        workingSet:
          next.length > WORKING_SET_CAP
            ? next.slice(next.length - WORKING_SET_CAP)
            : next,
      };
    }),
  removeFromWorkingSet: (id) =>
    set((state) => {
      const nodeId = normalizeNodeId(id);
      if (nodeId === null) return state;
      return { workingSet: state.workingSet.filter((entry) => entry !== nodeId) };
    }),
  clearWorkingSet: () => set({ workingSet: [] }),
  setOverlays: (overlays) => set({ overlays: normalizeGraphOverlays(overlays) }),
  setRenderCapability: (signal) =>
    set({ renderCapability: normalizeRenderCapability(signal) }),
  setLeftRailVisible: (leftRailVisible) =>
    set({ leftRailVisible: normalizeShellLayoutVisible(leftRailVisible) }),
  setLeftRailWidth: (width) =>
    set({
      leftRailWidth: normalizeShellLayoutPanelSize(
        width,
        LEFT_RAIL_MIN_WIDTH,
        LEFT_RAIL_MAX_WIDTH,
      ),
    }),
  setRightRailWidth: (width) =>
    set({
      rightRailWidth: normalizeShellLayoutPanelSize(
        width,
        RIGHT_RAIL_MIN_WIDTH,
        RIGHT_RAIL_MAX_WIDTH,
      ),
    }),
  setAgentPanelWidth: (width) =>
    set({
      agentPanelWidth: normalizeShellLayoutPanelSize(
        width,
        AGENT_PANEL_MIN_WIDTH,
        AGENT_PANEL_MAX_WIDTH,
      ),
    }),
  setTimelineVisible: (timelineVisible) =>
    set({ timelineVisible: normalizeShellLayoutVisible(timelineVisible) }),
  setGraphVisible: (graphVisible) =>
    set({ graphVisible: normalizeShellLayoutVisible(graphVisible) }),
  setTimelineHeight: (height) =>
    set({
      timelineHeight: normalizeShellLayoutPanelSize(
        height,
        TIMELINE_MIN_HEIGHT,
        TIMELINE_MAX_HEIGHT,
      ),
    }),
  setFollowMode: (followMode) =>
    set({ followMode: normalizeShellLayoutVisible(followMode) }),
  toggleFollowMode: () => set((state) => ({ followMode: !state.followMode })),
  resetShellLayout: () =>
    set({
      leftRailVisible: true,
      leftRailWidth: LEFT_RAIL_DEFAULT_WIDTH,
      rightRailWidth: RIGHT_RAIL_DEFAULT_WIDTH,
      agentPanelWidth: AGENT_PANEL_DEFAULT_WIDTH,
      timelineVisible: true,
      graphVisible: true,
      timelineHeight: TIMELINE_DEFAULT_HEIGHT,
    }),
}));
