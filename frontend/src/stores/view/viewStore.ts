import { create } from "zustand";

import type { EngineEdge } from "../server/engine";
import { useFilterStore } from "./filters";

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
  | { kind: "event"; id: string; nodeIds: string[] }
  | null;

export interface ViewState {
  /**
   * The user-picked worktree scope (G2.a) — the coarsest filter; null
   * falls back to the map's default corpus-bearing worktree.
   */
  scope: string | null;
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

  /** Switch the worktree scope — swaps the stage's scope wholesale. */
  setScope: (scope: string | null) => void;
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
}

export const useViewStore = create<ViewState>((set) => ({
  scope: null,
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

  setScope: (scope) => {
    // WHOLESALE swap (ADR §2.1; finding scope-swap-partial-reset-022):
    // everything scoped to the previous corpus resets — selection, working
    // set, opened islands, session-pinned discoveries (old-corpus semantic
    // candidates must not ride into the new slice), and the timeline mode
    // (the new scope must not arrive pre-scrubbed to a foreign timestamp).
    // The filter model resets too: its facet choices embed the previous
    // scope's vocabulary. Cross-store, applied in one move.
    useFilterStore.getState().reset();
    set({
      scope,
      selection: null,
      selectedId: null,
      workingSet: [],
      openedIds: [],
      pinnedDiscoveries: [],
      timelineMode: { kind: "live" },
    });
  },
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
    set((state) =>
      state.pinnedDiscoveries.some((e) => e.id === edge.id)
        ? state
        : { pinnedDiscoveries: [...state.pinnedDiscoveries, edge] },
    ),
  unpinDiscovery: (edgeId) =>
    set((state) => ({
      pinnedDiscoveries: state.pinnedDiscoveries.filter((e) => e.id !== edgeId),
    })),
  addToWorkingSet: (id) =>
    set((state) =>
      state.workingSet.includes(id) ? state : { workingSet: [...state.workingSet, id] },
    ),
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
}));
