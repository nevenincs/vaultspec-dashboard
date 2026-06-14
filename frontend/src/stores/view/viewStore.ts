import { create } from "zustand";

import type { EngineEdge, SalienceLens } from "../server/engine";
import { DEFAULT_SALIENCE_LENS } from "../server/engine";
import type { RepresentationMode } from "../../scene/field/representationLayout";
import { DEFAULT_REPRESENTATION_MODE } from "../../scene/field/representationLayout";
import { useLiveStatusStore } from "../server/liveStatus";
import { useFilterStore } from "./filters";
import { useLensStore } from "./lenses";
import { usePinStore } from "./pins";

// View state (gui-spec §5.2): selection, working set, filters/lens,
// timeline mode, panel layout. This store is the shared brain that keeps
// browser / stage / timeline / inspector in sync — "selection is one
// concept" (decisions G2.b) lives here. Server state belongs to TanStack
// Query; per-frame scene state belongs to the scene layer, never here.

export type TimelineMode = { kind: "live" } | { kind: "time-travel"; at: number };

export interface TierFilter {
  declared: boolean;
  structural: boolean;
  temporal: boolean;
  semantic: boolean;
  /** Per-tier minimum confidence, 0..1 floats on the wire (contract R3). */
  minConfidence: Partial<Record<"temporal" | "semantic", number>>;
}

/**
 * The single shared selection (G2.b): one concept across browser, stage,
 * timeline, and inspector — selecting anywhere focuses everywhere. Event
 * selections carry their node ids so the stage can cross-highlight.
 */
export type Selection =
  | { kind: "node"; id: string }
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
  /** The shared selection; `selectedId` mirrors its id for convenience. */
  selection: Selection;
  selectedId: string | null;
  /** The stage's explicit working set — "why is this node on my screen?" */
  workingSet: string[];
  /** Nodes opened in place — rendered as DOM islands above the field (G6.a). */
  openedIds: string[];
  /**
   * Session-pinned discovery candidates (G3.c): probabilistic suggestions
   * never join the persistent graph — pinning keeps them on stage for THIS
   * session only; nothing is written anywhere.
   */
  pinnedDiscoveries: EngineEdge[];
  /** The tier dial — the signature filter control (gui-spec §3.5). */
  tierFilter: TierFilter;
  timelineMode: TimelineMode;
  leftRailCollapsed: boolean;
  rightRailCollapsed: boolean;
  /**
   * Graph query granularity (contract §4): "feature" renders the
   * constellation (~12 feature-convergence nodes, the Obsidian overview);
   * "document" renders the full document graph (~200 nodes). Resets to
   * "feature" on every scope swap so a new scope always starts at the
   * overview — loading 200 nodes for an unknown corpus is unexpected.
   */
  granularity: "document" | "feature";
  /**
   * The active SALIENCE lens (graph-node-salience ADR): the viewer-intent
   * parameterization that selects which per-lens importance field the engine
   * computes and, via DOI, which node set is served. Owned here as view state
   * (the stores layer is the sole wire client); switching is a re-query. Distinct
   * from the named-filter-set lenses (`view/lenses.ts`) and the tier dial.
   * Default `status` ("what is in-flight"). Does NOT reset on scope swap — a
   * lens is an intent that travels with the viewer, not the corpus.
   */
  activeLens: SalienceLens;
  /**
   * The active REPRESENTATION mode (graph-representation ADR): connectivity
   * (default) | lineage | semantic. Owned here as view state and emitted to the
   * scene as a `set-representation-mode` command; the scene re-lays-out. DISTINCT
   * from the force/circular layout tuning (a scene-only render knob) and from the
   * salience lens (a wire concern). Does NOT reset on scope swap — a chosen mode
   * is a viewer preference, not corpus state.
   */
  activeRepresentationMode: RepresentationMode;
  /**
   * Overlay visibility (graph-representation ADR): feature-country labels at
   * overview and BubbleSets hulls at document LOD. Owned here, emitted as
   * `set-overlays`.
   */
  overlays: { featureCountries: boolean; featureHulls: boolean };

  /** Switch the worktree scope — swaps the stage's scope wholesale. */
  setScope: (scope: string | null) => void;
  /**
   * Seed the scope + folder context from the restored session (W04.P09.S30).
   * Used by the stores-layer restore hook on session load: it mirrors the
   * durable session shape into the view store WITHOUT triggering the wholesale
   * reset (which is for a user-initiated swap, not a restore). Durable
   * persistence is the session API's job, not this setter's.
   */
  seedFromSession: (context: {
    scope: string | null;
    folder: string | null;
    featureTags: string[];
  }) => void;
  /**
   * Set the active folder + feature-tag contexts (W04.P09.S30). Mirrors the
   * selection into the view store for synchronous reads; the durable write goes
   * through the session API at the call site (a stores mutation), never
   * localStorage.
   */
  setScopeContext: (context: { folder: string | null; featureTags: string[] }) => void;
  /** Select a node by id (the common path); null clears. */
  select: (id: string | null) => void;
  /** Select any entity kind (edge, event with node ids, …). */
  selectEntity: (selection: Selection) => void;
  openNode: (id: string) => void;
  closeNode: (id: string) => void;
  pinDiscovery: (edge: EngineEdge) => void;
  unpinDiscovery: (edgeId: string) => void;
  addToWorkingSet: (id: string) => void;
  removeFromWorkingSet: (id: string) => void;
  clearWorkingSet: () => void;
  setTierFilter: (filter: TierFilter) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  toggleLeftRail: () => void;
  toggleRightRail: () => void;
  /** Switch between the feature-constellation overview and the full document graph. */
  setGranularity: (granularity: "document" | "feature") => void;
  /** Switch the active salience lens (status/design). A re-query, not a reset. */
  setActiveLens: (lens: SalienceLens) => void;
  /** Switch the active representation mode (connectivity/lineage/semantic). */
  setRepresentationMode: (mode: RepresentationMode) => void;
  /** Set overlay visibility (feature countries, feature hulls). */
  setOverlays: (overlays: { featureCountries: boolean; featureHulls: boolean }) => void;
}

/** Cap the working set (P-MED-4): each entry materializes its own ego-network
 *  query (Stage's `useQueries` fan-out), so an uncapped set is an unbounded
 *  concurrent-request fan-out. Keep the most-recent N. */
export const WORKING_SET_CAP = 24;

/** Cap session-pinned discoveries (P-LOW-10): each is a full EngineEdge held
 *  for the session; keep the most-recent N so a long session stays bounded. */
export const PINNED_DISCOVERIES_CAP = 50;

export const useViewStore = create<ViewState>((set) => ({
  scope: null,
  activeFolder: null,
  featureContexts: [],
  selection: null,
  selectedId: null,
  workingSet: [],
  openedIds: [],
  pinnedDiscoveries: [],
  tierFilter: {
    declared: true,
    structural: true,
    temporal: true,
    semantic: true,
    minConfidence: {},
  },
  timelineMode: { kind: "live" },
  leftRailCollapsed: false,
  rightRailCollapsed: false,
  granularity: "feature",
  activeLens: DEFAULT_SALIENCE_LENS,
  activeRepresentationMode: DEFAULT_REPRESENTATION_MODE,
  overlays: { featureCountries: true, featureHulls: true },

  setScope: (scope) => {
    // WHOLESALE swap (ADR §2.1; finding scope-swap-partial-reset-022):
    // everything scoped to the previous corpus resets — selection, working
    // set, opened islands, session-pinned discoveries (old-corpus semantic
    // candidates must not ride into the new slice), and the timeline mode
    // (the new scope must not arrive pre-scrubbed to a foreign timestamp).
    // The filter model resets too: its facet choices embed the previous
    // scope's vocabulary. Cross-store, applied in one move.
    useFilterStore.getState().reset();
    // Re-key the pin and lens stores so the previous scope's pins/lenses do
    // not bleed into the new scope (finding-018/022/023; isolation-01/02/03).
    // workspace is preserved; scope flips to the new value.
    const workspace = usePinStore.getState().workspace;
    usePinStore.getState().setScopeKey(workspace, scope ?? "default");
    useLensStore.getState().setScopeKey(workspace, scope ?? "default");
    // Reset the live-connection slice too (live-state ADR D1): the previous
    // corpus's broken-link count / resume seq must not bleed into the new scope
    // before the new slice and stream arrive (the same isolation discipline as
    // pins/lenses, findings 022/023).
    useLiveStatusStore.getState().reset();
    set({
      scope,
      // The folder context is scoped to the previous corpus — clear it on a
      // wholesale swap (W04.P09.S30). The new scope's persisted context is
      // re-seeded from the session by the stores restore hook (seedFromSession).
      activeFolder: null,
      featureContexts: [],
      selection: null,
      selectedId: null,
      workingSet: [],
      openedIds: [],
      pinnedDiscoveries: [],
      timelineMode: { kind: "live" },
      // Reset to constellation overview on scope swap: loading 200 document
      // nodes into an unfamiliar corpus is unexpected (granularity doc comment).
      granularity: "feature",
    });
  },
  seedFromSession: ({ scope, folder, featureTags }) =>
    set({ scope, activeFolder: folder, featureContexts: featureTags }),
  setScopeContext: ({ folder, featureTags }) =>
    set({ activeFolder: folder, featureContexts: featureTags }),
  select: (id) =>
    set({
      selection: id === null ? null : { kind: "node", id },
      selectedId: id,
    }),
  selectEntity: (selection) => set({ selection, selectedId: selection?.id ?? null }),
  openNode: (id) =>
    set((state) =>
      state.openedIds.includes(id) ? state : { openedIds: [...state.openedIds, id] },
    ),
  closeNode: (id) =>
    set((state) => ({
      openedIds: state.openedIds.filter((entry) => entry !== id),
    })),
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
  setTierFilter: (tierFilter) => set({ tierFilter }),
  setTimelineMode: (timelineMode) => set({ timelineMode }),
  toggleLeftRail: () =>
    set((state) => ({ leftRailCollapsed: !state.leftRailCollapsed })),
  toggleRightRail: () =>
    set((state) => ({ rightRailCollapsed: !state.rightRailCollapsed })),
  setGranularity: (granularity) => set({ granularity }),
  setActiveLens: (activeLens) => set({ activeLens }),
  setRepresentationMode: (activeRepresentationMode) =>
    set({ activeRepresentationMode }),
  setOverlays: (overlays) => set({ overlays }),
}));
