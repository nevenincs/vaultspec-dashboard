import { create } from "zustand";

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

export interface ViewState {
  /** The single shared selection across all regions (node/edge/event id). */
  selectedId: string | null;
  /** The stage's explicit working set — "why is this node on my screen?" */
  workingSet: string[];
  /** The tier dial — the signature filter control (gui-spec §3.5). */
  tierFilter: TierFilter;
  timelineMode: TimelineMode;
  leftRailCollapsed: boolean;
  rightRailCollapsed: boolean;

  select: (id: string | null) => void;
  addToWorkingSet: (id: string) => void;
  removeFromWorkingSet: (id: string) => void;
  clearWorkingSet: () => void;
  setTierFilter: (filter: TierFilter) => void;
  setTimelineMode: (mode: TimelineMode) => void;
  toggleLeftRail: () => void;
  toggleRightRail: () => void;
}

export const useViewStore = create<ViewState>((set) => ({
  selectedId: null,
  workingSet: [],
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

  select: (id) => set({ selectedId: id }),
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
