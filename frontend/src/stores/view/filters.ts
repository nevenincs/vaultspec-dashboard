// The single filter model (W02.P07.S28, ADR G3.f; contract redline R3).
//
// One filter model, two views (stage + timeline). The legal vocabulary is
// engine-enumerated (the filters endpoint) — nothing hardcoded; this store
// holds the user's current choices and compiles them two ways: into the
// engine's wire filter object (min-confidence as per-tier floats 0..1, per
// R3) and into the scene's visibility membership (RL-5a: filter SEMANTICS
// live view-side, the scene only animates the membership diff).

import { create } from "zustand";

import type { EngineEdge, EngineNode, GraphFilter } from "../server/engine";

export type TierName = "declared" | "structural" | "temporal" | "semantic";

export interface FilterState {
  /** The tier dial: per-tier toggles + confidence floors (G3.f). */
  tiers: Record<TierName, boolean>;
  minConfidence: Partial<Record<"temporal" | "semantic", number>>;
  /** Facet chips — values come from the engine vocabulary. */
  docTypes: string[];
  featureTags: string[];
  relations: string[];
  structuralStates: ("resolved" | "stale" | "broken")[];
  textMatch: string;
  /** The single date-range filter — OWNED by the timeline (G4.c). */
  dateRange: { from?: string; to?: string };

  setTier: (tier: TierName, on: boolean) => void;
  setMinConfidence: (tier: "temporal" | "semantic", floor: number) => void;
  setFacet: (
    facet: "docTypes" | "featureTags" | "relations" | "structuralStates",
    values: string[],
  ) => void;
  /**
   * Toggle one value in a facet array: remove it if present, append it
   * otherwise. The store owns the arrays, so callers pass only the facet and
   * the value — no `current` need be threaded through the chrome (M5).
   */
  toggleFacet: (
    facet: "docTypes" | "featureTags" | "relations" | "structuralStates",
    value: string,
  ) => void;
  setTextMatch: (text: string) => void;
  setDateRange: (range: { from?: string; to?: string }) => void;
  reset: () => void;
  /** Replace the whole choice set (lens application, S31). */
  apply: (state: FilterChoices) => void;
}

export type FilterChoices = Pick<
  FilterState,
  | "tiers"
  | "minConfidence"
  | "docTypes"
  | "featureTags"
  | "relations"
  | "structuralStates"
  | "textMatch"
  | "dateRange"
>;

export const DEFAULT_CHOICES: FilterChoices = {
  tiers: { declared: true, structural: true, temporal: true, semantic: true },
  minConfidence: {},
  docTypes: [],
  featureTags: [],
  relations: [],
  structuralStates: [],
  textMatch: "",
  dateRange: {},
};

export const useFilterStore = create<FilterState>((set) => ({
  ...structuredClone(DEFAULT_CHOICES),
  setTier: (tier, on) => set((s) => ({ tiers: { ...s.tiers, [tier]: on } })),
  setMinConfidence: (tier, floor) =>
    set((s) => ({ minConfidence: { ...s.minConfidence, [tier]: floor } })),
  setFacet: (facet, values) => set({ [facet]: values }),
  toggleFacet: (facet, value) =>
    set((s) => {
      const current = s[facet] as string[];
      return {
        [facet]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      };
    }),
  setTextMatch: (textMatch) => set({ textMatch }),
  setDateRange: (dateRange) => set({ dateRange }),
  reset: () => set(structuredClone(DEFAULT_CHOICES)),
  apply: (choices) => set(structuredClone(choices)),
}));

// --- wire compilation (R3) ----------------------------------------------------------

/**
 * Normalize a per-tier confidence floor to the R3 wire grammar: a finite 0..1
 * float. Out-of-range values clamp (a preset authored as a percent like 70
 * clamps to 1); a non-finite value is not a valid floor and yields undefined.
 * Callers drop an undefined result from the wire and fail closed in membership,
 * so a garbage floor never ships and never silently includes everything (M-G7,
 * finding filters-01).
 */
function clampFloor(value: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

function clampFloors(
  raw: Partial<Record<"temporal" | "semantic", number>>,
): Partial<Record<"temporal" | "semantic", number>> {
  const out: Partial<Record<"temporal" | "semantic", number>> = {};
  for (const tier of ["temporal", "semantic"] as const) {
    const value = raw[tier];
    if (value === undefined) continue;
    const floor = clampFloor(value);
    if (floor !== undefined) out[tier] = floor;
  }
  return out;
}

/** Compile choices into the engine-owned filter object (snake_case wire). */
export function toGraphFilter(choices: FilterChoices): GraphFilter {
  const filter: GraphFilter = {};
  if (Object.values(choices.tiers).some((on) => !on)) {
    filter.tiers = { ...choices.tiers };
  }
  const floors = clampFloors(choices.minConfidence);
  if (Object.keys(floors).length > 0) filter.min_confidence = floors;
  if (choices.relations.length > 0) filter.relations = [...choices.relations];
  if (choices.structuralStates.length > 0) {
    filter.structural_state = [...choices.structuralStates];
  }
  if (choices.docTypes.length > 0) filter.doc_types = [...choices.docTypes];
  if (choices.featureTags.length > 0) filter.feature_tags = [...choices.featureTags];
  if (choices.textMatch) filter.text = choices.textMatch;
  if (choices.dateRange.from || choices.dateRange.to) {
    filter.date_range = { ...choices.dateRange };
  }
  return filter;
}

// --- visibility membership (RL-5a) -----------------------------------------------------

export interface VisibilityMembership {
  visibleNodeIds: Set<string>;
  visibleEdgeIds: Set<string>;
  hiddenNodeCount: number;
  hiddenEdgeCount: number;
}

function nodeMatches(node: EngineNode, choices: FilterChoices): boolean {
  if (
    choices.docTypes.length > 0 &&
    node.doc_type !== undefined &&
    !choices.docTypes.includes(node.doc_type)
  ) {
    return false;
  }
  if (
    choices.featureTags.length > 0 &&
    !(node.feature_tags ?? []).some((t) => choices.featureTags.includes(t))
  ) {
    return false;
  }
  if (choices.textMatch) {
    const needle = choices.textMatch.toLowerCase();
    if (!(node.title ?? node.id).toLowerCase().includes(needle)) return false;
  }
  return true;
}

function edgeMatches(edge: EngineEdge, choices: FilterChoices): boolean {
  if (!choices.tiers[edge.tier]) return false;
  const rawFloor =
    edge.tier === "temporal" || edge.tier === "semantic"
      ? choices.minConfidence[edge.tier]
      : undefined;
  if (rawFloor !== undefined) {
    const floor = clampFloor(rawFloor);
    // An engaged-but-invalid floor (non-finite) must never silently include a
    // sub-floor edge by evaluating `confidence < NaN` (always false) — fail
    // closed so the membership cannot lie about the floor being in effect.
    if (floor === undefined || edge.confidence < floor) return false;
  }
  if (choices.relations.length > 0 && !choices.relations.includes(edge.relation)) {
    return false;
  }
  if (
    choices.structuralStates.length > 0 &&
    edge.tier === "structural" &&
    !choices.structuralStates.includes(edge.state ?? "resolved")
  ) {
    return false;
  }
  return true;
}

/**
 * Compute the visibility membership for the current slice. Edges need both
 * endpoints visible; meta-edges pass tier checks via their strongest
 * constituent (they carry the aggregate, not one tier).
 */
export function computeVisibility(
  nodes: readonly EngineNode[],
  edges: readonly EngineEdge[],
  choices: FilterChoices,
): VisibilityMembership {
  const visibleNodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeMatches(node, choices)) visibleNodeIds.add(node.id);
  }
  const visibleEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (!visibleNodeIds.has(edge.src) || !visibleNodeIds.has(edge.dst)) continue;
    if (edge.meta) {
      // Aggregation ribbons survive if ANY constituent tier is on.
      const anyTierOn = Object.keys(edge.meta.breakdown_by_tier).some(
        (tier) => choices.tiers[tier as TierName],
      );
      if (anyTierOn) visibleEdgeIds.add(edge.id);
      continue;
    }
    if (edgeMatches(edge, choices)) visibleEdgeIds.add(edge.id);
  }
  return {
    visibleNodeIds,
    visibleEdgeIds,
    hiddenNodeCount: nodes.length - visibleNodeIds.size,
    hiddenEdgeCount: edges.length - visibleEdgeIds.size,
  };
}
