import type {
  DashboardFilters,
  DashboardGraphBounds,
  DashboardPanelState,
  DashboardPanelTab,
  DashboardTimelineMode,
  GraphGranularity,
  RepresentationMode,
  SalienceLens,
} from "./engine";
import {
  CANONICAL_TIERS,
  DASHBOARD_BOUND_SHAPES,
  DASHBOARD_PANEL_TABS,
  DEFAULT_SALIENCE_LENS,
  GRAPH_GRANULARITIES,
  REPRESENTATION_MODES,
  SALIENCE_LENSES,
} from "./engine";
import { DOCUMENT_DASHBOARD_GRAPH_GRANULARITY } from "./dashboardDefaults";
import { normalizeNodeId, normalizeNodeIds } from "../nodeIds";
import { normalizeSearchQuery } from "../searchQuery";

const DASHBOARD_CONFIDENCE_FILTER_TIERS = ["temporal", "semantic"] as const;
const DASHBOARD_STRUCTURAL_FILTER_STATES = ["resolved", "stale", "broken"] as const;
const DASHBOARD_FEATURE_QUERY_MODES = ["glob", "regex"] as const;

export type DashboardPanelStateUpdate = Partial<DashboardPanelState>;

export const DEFAULT_DASHBOARD_PANEL_STATE: DashboardPanelState = {
  left_collapsed: false,
  right_collapsed: false,
  right_tab: "status",
};

export const DEFAULT_DASHBOARD_GRAPH_BOUNDS: DashboardGraphBounds = {
  shape: "free",
  size: 0,
};

export const MAX_DASHBOARD_SELECTED_IDS = 256;
export const MAX_DASHBOARD_GRAPH_BOUND_SIZE = 5000;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isStringMember<T extends string>(
  value: unknown,
  members: readonly T[],
): value is T {
  return typeof value === "string" && (members as readonly string[]).includes(value);
}

export function normalizeStringMember<T extends string>(
  value: unknown,
  members: readonly T[],
): T | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return isStringMember(normalized, members) ? normalized : null;
}

export function normalizeDashboardNodeId(id: unknown): string | null {
  return normalizeNodeId(id);
}

export function normalizeDashboardSelectedIds(ids: unknown): string[] {
  return Array.isArray(ids) ? normalizeNodeIds(ids, MAX_DASHBOARD_SELECTED_IDS) : [];
}

export function isDashboardTierName(
  value: unknown,
): value is (typeof CANONICAL_TIERS)[number] {
  return isStringMember(value, CANONICAL_TIERS);
}

export function normalizeDashboardPanelTab(tab: unknown): DashboardPanelTab | null {
  return normalizeStringMember(tab, DASHBOARD_PANEL_TABS);
}

function normalizeDashboardPanelTabOrDefault(tab: unknown): DashboardPanelTab {
  return normalizeDashboardPanelTab(tab) ?? DEFAULT_DASHBOARD_PANEL_STATE.right_tab;
}

function dashboardPanelStateRecord(state: unknown): Record<string, unknown> {
  return isObjectRecord(state) ? state : {};
}

export function normalizeDashboardPanelState(state: unknown): DashboardPanelState {
  const panelState = dashboardPanelStateRecord(state);
  return {
    left_collapsed:
      typeof panelState.left_collapsed === "boolean"
        ? panelState.left_collapsed
        : DEFAULT_DASHBOARD_PANEL_STATE.left_collapsed,
    right_collapsed:
      typeof panelState.right_collapsed === "boolean"
        ? panelState.right_collapsed
        : DEFAULT_DASHBOARD_PANEL_STATE.right_collapsed,
    right_tab: normalizeDashboardPanelTabOrDefault(panelState.right_tab),
  };
}

export function normalizeDashboardPanelStateUpdate(
  update: unknown,
): DashboardPanelStateUpdate {
  const panelState = dashboardPanelStateRecord(update);
  const normalized: DashboardPanelStateUpdate = {};
  if (typeof panelState.left_collapsed === "boolean") {
    normalized.left_collapsed = panelState.left_collapsed;
  }
  if (typeof panelState.right_collapsed === "boolean") {
    normalized.right_collapsed = panelState.right_collapsed;
  }
  const rightTab = normalizeDashboardPanelTab(panelState.right_tab);
  if (rightTab !== null) {
    normalized.right_tab = rightTab;
  }
  return normalized;
}

export function normalizeDashboardGraphGranularity(
  granularity: unknown,
): GraphGranularity {
  return (
    normalizeStringMember(granularity, GRAPH_GRANULARITIES) ??
    DOCUMENT_DASHBOARD_GRAPH_GRANULARITY
  );
}

export function normalizeDashboardRepresentationMode(
  mode: unknown,
): RepresentationMode {
  return normalizeStringMember(mode, REPRESENTATION_MODES) ?? "connectivity";
}

export function normalizeDashboardSalienceLens(lens: unknown): SalienceLens {
  return normalizeStringMember(lens, SALIENCE_LENSES) ?? DEFAULT_SALIENCE_LENS;
}

function normalizeDashboardBoundShape(shape: unknown): DashboardGraphBounds["shape"] {
  return normalizeStringMember(shape, DASHBOARD_BOUND_SHAPES) ?? "free";
}

export function normalizeDashboardGraphBounds(bounds: unknown): DashboardGraphBounds {
  const source = isObjectRecord(bounds) ? bounds : {};
  const shape = normalizeDashboardBoundShape(source.shape);
  const rawSize = typeof source.size === "number" && Number.isFinite(source.size)
    ? Math.round(source.size)
    : 0;
  const size =
    shape === "free" ? 0 : Math.min(MAX_DASHBOARD_GRAPH_BOUND_SIZE, Math.max(0, rawSize));
  return { shape, size };
}

export function normalizeDashboardTimelineMode(
  mode: unknown,
): DashboardTimelineMode {
  if (!isObjectRecord(mode)) return { kind: "live" };
  const kind = typeof mode.kind === "string" ? mode.kind.trim() : "";
  if (
    kind === "time-travel" &&
    typeof mode.at === "number" &&
    Number.isFinite(mode.at)
  ) {
    return { kind, at: Math.round(mode.at) };
  }
  return { kind: "live" };
}

function cloneStringArray(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized.length === 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    next.push(normalized);
  }
  return next.length > 0 ? next : undefined;
}

function normalizeDashboardStructuralStates(
  values: unknown,
): DashboardFilters["structural_state"] | undefined {
  const normalized = cloneStringArray(values)?.filter((value) =>
    isStringMember(value, DASHBOARD_STRUCTURAL_FILTER_STATES),
  );
  return normalized?.length
    ? (normalized as DashboardFilters["structural_state"])
    : undefined;
}

function normalizeDashboardFeatureQuery(
  value: unknown,
): DashboardFilters["feature_query"] | undefined {
  if (!isObjectRecord(value)) return undefined;
  const query = typeof value.value === "string" ? value.value.trim() : "";
  const mode = normalizeStringMember(value.mode, DASHBOARD_FEATURE_QUERY_MODES);
  if (!query || mode === null) {
    return undefined;
  }
  return { value: query, mode };
}

export function normalizeDashboardTextFilter(value: unknown): string | undefined {
  const text = normalizeSearchQuery(value);
  return text || undefined;
}

export function normalizeDashboardConfidenceFloor(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : undefined;
}

export function normalizeDashboardFilterTiers(
  tiers: unknown,
): DashboardFilters["tiers"] | undefined {
  if (!isObjectRecord(tiers)) return undefined;
  const normalized: DashboardFilters["tiers"] = {};
  for (const tier of CANONICAL_TIERS) {
    const value = tiers[tier];
    if (typeof value === "boolean") normalized[tier] = value;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeDashboardMinConfidence(
  floors: unknown,
): DashboardFilters["min_confidence"] | undefined {
  if (!isObjectRecord(floors)) return undefined;
  const normalized: DashboardFilters["min_confidence"] = {};
  for (const tier of DASHBOARD_CONFIDENCE_FILTER_TIERS) {
    const floor = normalizeDashboardConfidenceFloor(floors[tier]);
    if (floor !== undefined) normalized[tier] = floor;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function cloneDashboardFilters(filters: unknown): DashboardFilters {
  const source = isObjectRecord(filters) ? filters : {};
  const next: DashboardFilters = {};
  const tiers = normalizeDashboardFilterTiers(source.tiers);
  const minConfidence = normalizeDashboardMinConfidence(source.min_confidence);
  const relations = cloneStringArray(source.relations);
  const structuralState = normalizeDashboardStructuralStates(source.structural_state);
  const kinds = cloneStringArray(source.kinds);
  const docTypes = cloneStringArray(source.doc_types);
  const featureTags = cloneStringArray(source.feature_tags);
  const featureQuery = normalizeDashboardFeatureQuery(source.feature_query);
  const statuses = cloneStringArray(source.statuses);
  const planTiers = cloneStringArray(source.plan_tiers);
  const health = cloneStringArray(source.health);
  const text = normalizeDashboardTextFilter(source.text);
  if (tiers) next.tiers = tiers;
  if (minConfidence) next.min_confidence = minConfidence;
  if (relations?.length) next.relations = relations;
  if (structuralState?.length) next.structural_state = structuralState;
  if (kinds?.length) next.kinds = kinds;
  if (docTypes?.length) next.doc_types = docTypes;
  if (featureTags?.length) next.feature_tags = featureTags;
  if (featureQuery) next.feature_query = featureQuery;
  if (statuses?.length) next.statuses = statuses;
  if (planTiers?.length) next.plan_tiers = planTiers;
  if (health?.length) next.health = health;
  if (text) next.text = text;
  return next;
}
