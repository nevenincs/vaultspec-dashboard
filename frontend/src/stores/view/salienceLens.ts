// The active salience lens (graph-node-salience ADR / W04.P09.S36): the
// viewer-intent lens the graph query is parameterized by. This is the ACTIVE
// salience lens view state — distinct from the saved-filter-set lenses store
// (`lenses.ts`, which names + persists filter choices) and distinct from the
// canvas-controls tier-dial "lens". The stores layer owns this view state (ADR:
// "the stores layer owns the active-lens view state"); switching the lens is a
// re-query the stores layer issues, and the engine recomputes nothing the client
// holds.
//
// STATUS is the default (ADR: first-load is "what is in-flight", the most common
// review intent). The lens is ephemeral view state, not durable session state, so
// it lives in a plain zustand store — not localStorage, not the session document.

import { create } from "zustand";

/** The two launch lenses (graph-node-salience ADR). The wire accepts exactly
 *  these tokens on `/graph/query` (+ asof/diff/neighbors), defaulting to status. */
export type SalienceLens = "status" | "design";

/** The default lens (ADR: status is the default — "what is in-flight"). */
export const DEFAULT_SALIENCE_LENS: SalienceLens = "status";

/** A human label for each lens, for the lens selector chrome (the lens selector
 *  control is a future canvas-controls amendment; the store homes the state). */
export const SALIENCE_LENS_LABELS: Record<SalienceLens, string> = {
  status: "Status",
  design: "Design",
};

interface SalienceLensState {
  /** The active lens the graph query is parameterized by (status by default). */
  lens: SalienceLens;
  /**
   * The focus node id folded into the DOI focus-distance term, or null for no
   * focus. A focus change is a re-query (a warm-started PPR pass on the engine)
   * the query layer drives a loading state for.
   */
  focus: string | null;
  /** Switch the active lens (a re-query; the query cache is keyed on lens). */
  setLens: (lens: SalienceLens) => void;
  /** Set or clear the DOI focus node (a re-query; keyed on focus). */
  setFocus: (focus: string | null) => void;
}

export const useSalienceLensStore = create<SalienceLensState>((set) => ({
  lens: DEFAULT_SALIENCE_LENS,
  focus: null,
  setLens: (lens) => set({ lens }),
  setFocus: (focus) => set({ focus }),
}));
