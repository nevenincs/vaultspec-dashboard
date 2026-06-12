// The degradation matrix (W03.P12.S46, ADR §8 / G8.a): degradation is a
// feature with a spec, not an error path. The §8 table is encoded as a
// pure function from condition inputs to per-surface states; a debug
// switch makes every condition reachable in development regardless of the
// real backends, and the matrix rows are tested against the ADR table.

import { create } from "zustand";

import type { EngineStatus } from "../../stores/server/engine";

// --- conditions -------------------------------------------------------------------

export interface DegradationInputs {
  ragDown: boolean;
  dateMandateMissing: boolean;
  brokenLinkCount: number;
  streamLost: boolean;
  noVault: boolean;
}

export const HEALTHY: DegradationInputs = {
  ragDown: false,
  dateMandateMissing: false,
  brokenLinkCount: 0,
  streamLost: false,
  noVault: false,
};

/** Derive the live conditions from the status snapshot. */
export function deriveInputs(status: EngineStatus | undefined): DegradationInputs {
  return {
    ragDown:
      status === undefined ||
      status.tiers.semantic?.available === false ||
      (status.rag !== undefined && status.rag.service !== "running"),
    dateMandateMissing: status?.degradations.includes("date-mandate") ?? false,
    brokenLinkCount: 0, // surfaced per-slice by the edge layer, not /status
    streamLost: false, // owned by the stream consumer
    noVault: status !== undefined && status.nodes === 0,
  };
}

// --- the §8 table, encoded -----------------------------------------------------------

export interface SurfaceStates {
  stage:
    | "normal"
    | "semantic-absent"
    | "broken-highlighted"
    | "stale-cached"
    | "empty-invitation";
  timeline: "normal" | "lifecycle-sparse" | "reconnecting" | "empty";
  rail: "normal" | "rag-degraded-card" | "pre-landing-card" | "stale-badged";
  search: "normal" | "text-fallback" | "degraded";
}

export function matrixFor(inputs: DegradationInputs): SurfaceStates {
  // Precedence: absence of a corpus dominates; a lost stream stales
  // everything cached; then per-condition rows apply.
  if (inputs.noVault) {
    return {
      stage: "empty-invitation",
      timeline: "empty",
      rail: "normal", // git still live
      search: inputs.ragDown ? "text-fallback" : "normal",
    };
  }
  if (inputs.streamLost) {
    return {
      stage: "stale-cached",
      timeline: "reconnecting",
      rail: "stale-badged",
      search: "degraded",
    };
  }
  return {
    stage: inputs.ragDown
      ? "semantic-absent"
      : inputs.brokenLinkCount > 0
        ? "broken-highlighted"
        : "normal",
    timeline: inputs.dateMandateMissing ? "lifecycle-sparse" : "normal",
    rail: inputs.ragDown
      ? "rag-degraded-card"
      : inputs.dateMandateMissing
        ? "pre-landing-card"
        : "normal",
    search: inputs.ragDown ? "text-fallback" : "normal",
  };
}

// --- the debug switch store ------------------------------------------------------------

interface DegradationState {
  /** Dev overrides — null means "use the real condition". */
  overrides: Partial<DegradationInputs> | null;
  setOverride: (key: keyof DegradationInputs, value: boolean | number | null) => void;
  clearOverrides: () => void;
  /** Combine real inputs with any debug overrides. */
  resolve: (real: DegradationInputs) => DegradationInputs;
}

export const useDegradationStore = create<DegradationState>((set, get) => ({
  overrides: null,
  setOverride: (key, value) =>
    set((state) => {
      const overrides = { ...(state.overrides ?? {}) };
      if (value === null) delete overrides[key];
      else (overrides as Record<string, boolean | number>)[key] = value;
      return { overrides: Object.keys(overrides).length > 0 ? overrides : null };
    }),
  clearOverrides: () => set({ overrides: null }),
  resolve: (real) => ({ ...real, ...(get().overrides ?? {}) }),
}));
