// Pure filter projections (W02.P07.S28, ADR G3.f; contract redline R3).
//
// The legal vocabulary is engine-enumerated (the filters endpoint) and the
// active choices live in canonical dashboard-state. This module only projects
// dashboard-state into view helper shapes and compiles those choices into graph
// filters and scene visibility membership.

import type {
  DashboardDateRange,
  DashboardFilters,
  DashboardState,
  EngineEdge,
  EngineNode,
  GraphFilter,
} from "../server/engine";
import { normalizeDashboardDateRange } from "../server/dashboardDateRange";
import {
  SEARCH_QUERY_MAX_CHARS,
  normalizeSearchQuery,
} from "../searchQuery";
import type { SceneCommand } from "../../scene/sceneController";

export type TierName = "declared" | "structural" | "temporal" | "semantic";

export interface FilterChoices {
  tiers: Record<TierName, boolean>;
  minConfidence: Partial<Record<"temporal" | "semantic", number>>;
  docTypes: string[];
  featureTags: string[];
  relations: string[];
  structuralStates: ("resolved" | "stale" | "broken")[];
  textMatch: string;
  dateRange: { from?: string; to?: string };
}

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

const TIER_NAMES = ["declared", "structural", "temporal", "semantic"] as const;
const CONFIDENCE_TIERS = ["temporal", "semantic"] as const;
const STRUCTURAL_STATES = ["resolved", "stale", "broken"] as const;
export const FILTER_CHOICE_VALUE_MAX_CHARS = 256;
export const FILTER_CHOICE_LIST_MAX_ITEMS = 256;
export const FILTER_CHOICE_TEXT_MAX_CHARS = SEARCH_QUERY_MAX_CHARS;

// --- wire compilation (R3) ----------------------------------------------------------

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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
  for (const tier of CONFIDENCE_TIERS) {
    const value = raw[tier];
    if (value === undefined) continue;
    const floor = clampFloor(value);
    if (floor !== undefined) out[tier] = floor;
  }
  return out;
}

function confidenceFloorsOrEmpty(
  raw: unknown,
): Partial<Record<"temporal" | "semantic", number>> {
  if (!isObjectRecord(raw)) return {};
  const floors: Partial<Record<"temporal" | "semantic", number>> = {};
  for (const tier of CONFIDENCE_TIERS) {
    const value = raw[tier];
    if (typeof value === "number") floors[tier] = value;
  }
  return clampFloors(floors);
}

function tiersOrDefault(raw: unknown): Record<TierName, boolean> {
  const tiers = { ...DEFAULT_CHOICES.tiers };
  if (!isObjectRecord(raw)) return tiers;
  for (const tier of TIER_NAMES) {
    const value = raw[tier];
    if (typeof value === "boolean") tiers[tier] = value;
  }
  return tiers;
}

function normalizeFilterChoiceValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= FILTER_CHOICE_VALUE_MAX_CHARS
    ? normalized
    : null;
}

function normalizeFilterChoiceText(value: unknown): string {
  return normalizeSearchQuery(value);
}

function arrayOrEmpty(values: unknown, maxItems = FILTER_CHOICE_LIST_MAX_ITEMS): string[] {
  if (!Array.isArray(values) || maxItems <= 0) return [];
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = normalizeFilterChoiceValue(value);
    if (normalized === null || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
    if (next.length >= maxItems) break;
  }
  return next;
}

function structuralStatesOrEmpty(
  values: DashboardFilters["structural_state"] | unknown,
): FilterChoices["structuralStates"] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<FilterChoices["structuralStates"][number]>();
  const next: FilterChoices["structuralStates"] = [];
  for (const value of values) {
    const normalized = normalizeFilterChoiceValue(value);
    if (
      normalized === null ||
      !STRUCTURAL_STATES.includes(
        normalized as FilterChoices["structuralStates"][number],
      )
    ) {
      continue;
    }
    const structuralState =
      normalized as FilterChoices["structuralStates"][number];
    if (seen.has(structuralState)) continue;
    seen.add(structuralState);
    next.push(structuralState);
    if (next.length >= STRUCTURAL_STATES.length) break;
  }
  return next;
}

function dateRangeOrEmpty(range: DashboardDateRange | unknown): DashboardDateRange {
  return normalizeDashboardDateRange(range);
}

export function normalizeFilterChoices(raw: unknown): FilterChoices | null {
  if (!isObjectRecord(raw)) return null;
  return {
    tiers: tiersOrDefault(raw.tiers),
    minConfidence: confidenceFloorsOrEmpty(raw.minConfidence),
    docTypes: arrayOrEmpty(raw.docTypes),
    featureTags: arrayOrEmpty(raw.featureTags),
    relations: arrayOrEmpty(raw.relations),
    structuralStates: structuralStatesOrEmpty(raw.structuralStates),
    textMatch: normalizeFilterChoiceText(raw.textMatch),
    dateRange: dateRangeOrEmpty(raw.dateRange),
  };
}

/**
 * Project the canonical dashboard-state filter snapshot into the visibility
 * helper shape. Once dashboard state is loaded, no cross-surface filter field
 * falls back to local Zustand state; the graph query and scene visibility must
 * read the same authority.
 */
export function filterChoicesFromDashboardState(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
  localChoices: FilterChoices = DEFAULT_CHOICES,
): FilterChoices {
  if (!state) return structuredClone(localChoices);
  const filters = state.filters;
  return {
    tiers: filters.tiers
      ? { ...DEFAULT_CHOICES.tiers, ...filters.tiers }
      : { ...DEFAULT_CHOICES.tiers },
    minConfidence: filters.min_confidence ? clampFloors(filters.min_confidence) : {},
    docTypes: arrayOrEmpty(filters.doc_types),
    featureTags: arrayOrEmpty(filters.feature_tags),
    relations: arrayOrEmpty(filters.relations),
    structuralStates: filters.structural_state
      ? structuralStatesOrEmpty(filters.structural_state)
      : [],
    textMatch: normalizeFilterChoiceText(filters.text),
    dateRange: dateRangeOrEmpty(state.date_range),
  };
}

export function dashboardFiltersFromChoices(choices: unknown): DashboardFilters {
  const normalized =
    normalizeFilterChoices(choices) ?? structuredClone(DEFAULT_CHOICES);
  const filter: DashboardFilters = {};
  if (Object.values(normalized.tiers).some((on) => !on)) {
    filter.tiers = { ...normalized.tiers };
  }
  const floors = clampFloors(normalized.minConfidence);
  if (Object.keys(floors).length > 0) filter.min_confidence = floors;
  if (normalized.relations.length > 0) filter.relations = [...normalized.relations];
  if (normalized.structuralStates.length > 0) {
    filter.structural_state = [...normalized.structuralStates];
  }
  if (normalized.docTypes.length > 0) filter.doc_types = [...normalized.docTypes];
  if (normalized.featureTags.length > 0) {
    filter.feature_tags = [...normalized.featureTags];
  }
  if (normalized.textMatch) filter.text = normalized.textMatch;
  return filter;
}

/** Compile choices into the engine-owned filter object (snake_case wire). */
export function toGraphFilter(choices: FilterChoices): GraphFilter {
  const normalized =
    normalizeFilterChoices(choices) ?? structuredClone(DEFAULT_CHOICES);
  const filter: GraphFilter = dashboardFiltersFromChoices(normalized);
  if (normalized.dateRange.from || normalized.dateRange.to) {
    filter.date_range = { ...normalized.dateRange };
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

export interface VisibilityHiddenCounts {
  nodes: number;
  edges: number;
}

export interface VisibilityNodeCounts {
  visible: number;
  total: number;
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

export function visibilitySceneCommand(membership: VisibilityMembership): SceneCommand {
  return {
    kind: "set-visibility",
    visibleNodeIds: membership.visibleNodeIds,
    visibleEdgeIds: membership.visibleEdgeIds,
  };
}

export function visibilityHiddenCounts(
  membership: VisibilityMembership | null,
): VisibilityHiddenCounts {
  return {
    nodes: membership?.hiddenNodeCount ?? 0,
    edges: membership?.hiddenEdgeCount ?? 0,
  };
}

export function visibilityNodeCounts(
  totalNodes: number,
  membership: VisibilityMembership | null,
): VisibilityNodeCounts {
  return {
    visible: totalNodes - (membership?.hiddenNodeCount ?? 0),
    total: totalNodes,
  };
}
