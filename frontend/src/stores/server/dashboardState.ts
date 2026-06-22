import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  DashboardDateRange,
  DashboardFilters,
  DashboardPanelState,
  DashboardState,
  DashboardStatePatch,
  GraphFilter,
  GraphGranularity,
  SalienceLens,
  SessionState,
} from "./engine";
import { engineClient } from "./engine";
import {
  hasDashboardDateRange,
  normalizeDashboardDateRange,
} from "./dashboardDateRange";
import { DOCUMENT_DASHBOARD_GRAPH_GRANULARITY } from "./dashboardDefaults";
import { dashboardStateSessionIdentity, engineKeys, useSession } from "./queries";
import { queryClient } from "./queryClient";
import type { GraphSettingsDefaults } from "./settingsSelectors";
import { normalizeStoreScope } from "./scopeIdentity";
import {
  cloneDashboardFilters,
  DEFAULT_DASHBOARD_GRAPH_BOUNDS,
  isDashboardTierName,
  normalizeDashboardConfidenceFloor,
  normalizeDashboardFilterTiers,
  normalizeDashboardGraphBounds,
  normalizeDashboardGraphGranularity,
  normalizeDashboardMinConfidence,
  normalizeDashboardNodeId,
  normalizeDashboardPanelState,
  normalizeDashboardPanelStateUpdate,
  normalizeDashboardRepresentationMode,
  normalizeDashboardSalienceLens,
  normalizeDashboardSelectedIds,
  normalizeDashboardFeatureQuery,
  normalizeDashboardTextFilter,
  normalizeDashboardTimelineMode,
} from "./dashboardStateNormalization";

export { dashboardStateSessionIdentity } from "./queries";
export {
  DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
  FRESH_DASHBOARD_GRAPH_GRANULARITY,
  isFreshDashboardGraphDefaultsState,
} from "./dashboardDefaults";
export {
  dashboardPlayheadForTimelineMode,
  dashboardTimelineModeForPlayhead,
} from "./dashboardTimeline";
export {
  cloneDashboardFilters,
  DEFAULT_DASHBOARD_GRAPH_BOUNDS,
  MAX_DASHBOARD_GRAPH_BOUND_SIZE,
  DEFAULT_DASHBOARD_PANEL_STATE,
  MAX_DASHBOARD_SELECTED_IDS,
  isStringMember,
  normalizeDashboardNodeId,
  normalizeDashboardFilterTiers,
  normalizeDashboardGraphBounds,
  normalizeDashboardGraphGranularity,
  normalizeDashboardMinConfidence,
  normalizeDashboardPanelState,
  normalizeDashboardPanelStateUpdate,
  normalizeDashboardPanelTab,
  normalizeDashboardRepresentationMode,
  normalizeDashboardSalienceLens,
  normalizeDashboardSelectedIds,
  normalizeDashboardTimelineMode,
  normalizeStringMember,
} from "./dashboardStateNormalization";
export type { DashboardPanelStateUpdate } from "./dashboardStateNormalization";

export type DashboardStateMutationPatch = Omit<DashboardStatePatch, "scope">;
// The toggleable multi-select filter facets (all are GraphFilter string[] fields).
export type DashboardFilterFacet = "doc_types" | "feature_tags" | "statuses" | "health";
// The edge-tier filter vocabulary. The engine never mints a semantic graph edge
// (ADR D3.5), so `semantic` is not an edge tier and is not a toggleable filter
// tier — distinct from the 4-tier availability `CANONICAL_TIERS` block.
export type DashboardTierName = "declared" | "structural" | "temporal";
const DASHBOARD_FILTER_FACETS: readonly DashboardFilterFacet[] = [
  "doc_types",
  "feature_tags",
  "statuses",
  "health",
];
export const DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS = 256;

export interface DashboardGraphQueryVariables {
  scope: string;
  filter: GraphFilter;
  asOf?: string | number;
  granularity: GraphGranularity;
  lens: SalienceLens;
  focus: string | null;
}

export function selectionPatch(selected_ids: unknown): DashboardStateMutationPatch {
  return { selected_ids: normalizeDashboardSelectedIds(selected_ids) };
}

export function filtersPatch(filters: unknown): DashboardStateMutationPatch {
  return { filters: cloneDashboardFilters(filters) };
}

export function dateRangePatch(date_range: unknown): DashboardStateMutationPatch {
  return { date_range: normalizeDashboardDateRange(date_range) };
}

export function filtersAndDateRangePatch(
  filters: unknown,
  dateRange: unknown,
): DashboardStateMutationPatch {
  return {
    filters: cloneDashboardFilters(filters),
    date_range: cloneDateRange(dateRange),
  };
}

export function timelineModePatch(timeline_mode: unknown): DashboardStateMutationPatch {
  return { timeline_mode: normalizeDashboardTimelineMode(timeline_mode) };
}

export function lensPatch(salience_lens: unknown): DashboardStateMutationPatch {
  return { salience_lens: normalizeDashboardSalienceLens(salience_lens) };
}

export function focusPatch(salience_focus: unknown): DashboardStateMutationPatch {
  return { salience_focus: normalizeDashboardNodeId(salience_focus) };
}

export function panelStatePatch(panel_state: unknown): DashboardStateMutationPatch {
  return { panel_state: normalizeDashboardPanelState(panel_state) };
}

export function mergeDashboardPanelState(
  base: DashboardPanelState | undefined,
  patch: unknown,
): DashboardPanelState {
  return normalizeDashboardPanelState({
    ...normalizeDashboardPanelState(base),
    ...normalizeDashboardPanelStateUpdate(patch),
  });
}

export function representationModePatch(
  representation_mode: unknown,
): DashboardStateMutationPatch {
  return {
    representation_mode: normalizeDashboardRepresentationMode(representation_mode),
  };
}

export function graphBoundsPatch(graph_bounds: unknown): DashboardStateMutationPatch {
  return { graph_bounds: normalizeDashboardGraphBounds(graph_bounds) };
}

export function granularityPatch(
  graph_granularity: unknown,
): DashboardStateMutationPatch {
  return { graph_granularity: normalizeDashboardGraphGranularity(graph_granularity) };
}

export function dashboardDocumentStateResetPatch(scope: string): DashboardStatePatch {
  return {
    scope,
    selected_ids: [],
    hovered_id: null,
    filters: {},
    date_range: {},
    timeline_mode: { kind: "live" },
    graph_granularity: DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
    salience_lens: "status",
    salience_focus: null,
    representation_mode: "connectivity",
    graph_bounds: DEFAULT_DASHBOARD_GRAPH_BOUNDS,
    panel_state: normalizeDashboardPanelState(undefined),
  };
}

export function dashboardDocumentStateSeed(
  scope: string,
  patch: DashboardStatePatch = {},
): DashboardState {
  return {
    scope: patch.scope ?? scope,
    selected_ids: normalizeDashboardSelectedIds(patch.selected_ids),
    hovered_id: normalizeDashboardNodeId(patch.hovered_id),
    filters: patch.filters ? cloneDashboardFilters(patch.filters) : {},
    date_range: normalizeDashboardDateRange(patch.date_range),
    timeline_mode: normalizeDashboardTimelineMode(patch.timeline_mode),
    graph_granularity: normalizeDashboardGraphGranularity(patch.graph_granularity),
    salience_lens: normalizeDashboardSalienceLens(patch.salience_lens),
    salience_focus: normalizeDashboardNodeId(patch.salience_focus),
    representation_mode: normalizeDashboardRepresentationMode(
      patch.representation_mode,
    ),
    graph_bounds: normalizeDashboardGraphBounds(patch.graph_bounds),
    panel_state: normalizeDashboardPanelState(patch.panel_state),
    tiers: {},
  };
}

export function dashboardSelectionId(
  state: Pick<DashboardState, "selected_ids"> | undefined,
): string | null {
  return state?.selected_ids[0] ?? null;
}

export const normalizeDashboardStateWriteScope = normalizeStoreScope;

function cachedDashboardStateSessionIdentity(client: QueryClient): string {
  return dashboardStateSessionIdentity(
    client.getQueryData<SessionState>(engineKeys.session()),
  );
}

export function updateDashboardStateCache(
  state: DashboardState,
  client: QueryClient = queryClient,
  sessionIdentity: string = cachedDashboardStateSessionIdentity(client),
): void {
  const key = engineKeys.dashboardState(state.scope, sessionIdentity);
  client.setQueryData(key, state);
  void client.invalidateQueries({ queryKey: key, exact: true });
}

export async function patchDashboardState(
  scope: unknown,
  patch: DashboardStateMutationPatch,
): Promise<DashboardState | null> {
  const normalizedScope = normalizeDashboardStateWriteScope(scope);
  if (normalizedScope === null) return null;
  const state = await engineClient.patchDashboardState({
    scope: normalizedScope,
    ...patch,
  });
  updateDashboardStateCache(state);
  return state;
}

const pendingPanelStatesByScope = new Map<string, DashboardPanelState>();
const panelStateWriteChainsByScope = new Map<string, Promise<DashboardState>>();
const timelineModeWriteSeqByScope = new Map<string, number>();

export interface DashboardTimelineModeWriteToken {
  scope: string;
  seq: number;
}

export function beginDashboardTimelineModeWrite(
  scope: string,
): DashboardTimelineModeWriteToken {
  const seq = (timelineModeWriteSeqByScope.get(scope) ?? 0) + 1;
  timelineModeWriteSeqByScope.set(scope, seq);
  return { scope, seq };
}

export function isLatestDashboardTimelineModeWrite(
  token: DashboardTimelineModeWriteToken,
): boolean {
  return timelineModeWriteSeqByScope.get(token.scope) === token.seq;
}

function finishDashboardTimelineModeWrite(
  token: DashboardTimelineModeWriteToken,
): boolean {
  if (!isLatestDashboardTimelineModeWrite(token)) return false;
  timelineModeWriteSeqByScope.delete(token.scope);
  return true;
}

export function acceptDashboardTimelineModeWrite(
  token: DashboardTimelineModeWriteToken,
  state: DashboardState,
  client: QueryClient = queryClient,
  sessionIdentity: string = cachedDashboardStateSessionIdentity(client),
): boolean {
  if (state.scope !== token.scope) {
    finishDashboardTimelineModeWrite(token);
    return false;
  }
  if (!finishDashboardTimelineModeWrite(token)) return false;
  updateDashboardStateCache(state, client, sessionIdentity);
  return true;
}

export async function patchDashboardTimelineMode(
  scope: unknown,
  mode: unknown,
  client: QueryClient = queryClient,
  sessionIdentity: string = cachedDashboardStateSessionIdentity(client),
): Promise<DashboardState | null> {
  const normalizedScope = normalizeDashboardStateWriteScope(scope);
  if (normalizedScope === null) return null;
  const token = beginDashboardTimelineModeWrite(normalizedScope);
  try {
    const state = await engineClient.patchDashboardState({
      scope: normalizedScope,
      ...timelineModePatch(mode),
    });
    return acceptDashboardTimelineModeWrite(token, state, client, sessionIdentity)
      ? state
      : null;
  } catch (error) {
    finishDashboardTimelineModeWrite(token);
    throw error;
  }
}

function cachedDashboardPanelState(
  client: QueryClient,
  scope: string,
  sessionIdentity: string,
): DashboardPanelState | undefined {
  return client.getQueryData<DashboardState>(
    engineKeys.dashboardState(scope, sessionIdentity),
  )?.panel_state;
}

function cachedDashboardFilters(
  client: QueryClient,
  scope: string,
  sessionIdentity: string,
): DashboardFilters {
  return (
    client.getQueryData<DashboardState>(
      engineKeys.dashboardState(scope, sessionIdentity),
    )?.filters ?? {}
  );
}

function queuePanelStateWrite(
  scope: string,
  write: () => Promise<DashboardState>,
): Promise<DashboardState> {
  const previous = panelStateWriteChainsByScope.get(scope) ?? Promise.resolve(null);
  const next = previous.catch(() => null).then(write);
  panelStateWriteChainsByScope.set(scope, next);
  void next.finally(() => {
    if (panelStateWriteChainsByScope.get(scope) === next) {
      panelStateWriteChainsByScope.delete(scope);
      pendingPanelStatesByScope.delete(scope);
    }
  });
  return next;
}

export function dashboardFiltersWithText(
  filters: DashboardFilters,
  text: unknown,
): DashboardFilters {
  const next = cloneDashboardFilters(filters);
  const normalized = normalizeDashboardTextFilter(text);
  if (normalized) next.text = normalized;
  else delete next.text;
  return next;
}

export function dashboardFiltersWithFeatureQuery(
  filters: DashboardFilters,
  query: unknown,
): DashboardFilters {
  const next = cloneDashboardFilters(filters);
  const normalized = normalizeDashboardFeatureQuery(query);
  if (normalized) next.feature_query = normalized;
  else delete next.feature_query;
  return next;
}

export function dashboardFiltersWithTier(
  filters: unknown,
  tier: unknown,
  on: unknown,
): DashboardFilters {
  const next = cloneDashboardFilters(filters);
  const normalizedTier = normalizeDashboardTierName(tier);
  const normalizedEnabled = normalizeDashboardTierEnabled(on);
  if (normalizedTier === null || normalizedEnabled === null) return next;
  const tiers = normalizeDashboardFilterTiers({
    ...(next.tiers ?? {}),
    [normalizedTier]: normalizedEnabled,
  });
  if (tiers) next.tiers = tiers;
  else delete next.tiers;
  return next;
}

export function normalizeDashboardTierName(tier: unknown): DashboardTierName | null {
  if (typeof tier !== "string") return null;
  const normalized = tier.trim();
  return isDashboardTierName(normalized) ? normalized : null;
}

export function normalizeDashboardTierEnabled(enabled: unknown): boolean | null {
  return typeof enabled === "boolean" ? enabled : null;
}

export function normalizeDashboardConfidenceTier(tier: unknown): "temporal" | null {
  const normalized = normalizeDashboardTierName(tier);
  return normalized === "temporal" ? normalized : null;
}

export function dashboardFiltersWithMinConfidence(
  filters: unknown,
  tier: unknown,
  floor: unknown,
): DashboardFilters {
  const next = cloneDashboardFilters(filters);
  const normalizedTier = normalizeDashboardConfidenceTier(tier);
  if (normalizedTier === null) return next;
  const nextFloors = { ...(next.min_confidence ?? {}) };
  const normalizedFloor = normalizeDashboardConfidenceFloor(floor);
  if (normalizedFloor === undefined) delete nextFloors[normalizedTier];
  else nextFloors[normalizedTier] = normalizedFloor;
  const minConfidence = normalizeDashboardMinConfidence(nextFloors);
  if (minConfidence) next.min_confidence = minConfidence;
  else delete next.min_confidence;
  return next;
}

export function normalizeDashboardFilterFacet(
  facet: unknown,
): DashboardFilterFacet | null {
  if (typeof facet !== "string") return null;
  const normalized = facet.trim();
  return (DASHBOARD_FILTER_FACETS as readonly string[]).includes(normalized)
    ? (normalized as DashboardFilterFacet)
    : null;
}

export function normalizeDashboardFilterFacetValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= DASHBOARD_FILTER_FACET_VALUE_MAX_CHARS
    ? normalized
    : null;
}

export function dashboardFiltersWithFacetToggled(
  filters: unknown,
  facet: unknown,
  value: unknown,
): DashboardFilters {
  const next = cloneDashboardFilters(filters);
  const normalizedFacet = normalizeDashboardFilterFacet(facet);
  const normalizedValue = normalizeDashboardFilterFacetValue(value);
  if (normalizedFacet === null || normalizedValue === null) return next;
  const current = next[normalizedFacet] ?? [];
  const values = current.includes(normalizedValue)
    ? current.filter((entry) => entry !== normalizedValue)
    : [...current, normalizedValue];
  if (values.length > 0) next[normalizedFacet] = values;
  else delete next[normalizedFacet];
  return next;
}

export function normalizeDashboardFeatureTag(featureTag: unknown): string | null {
  return normalizeDashboardFilterFacetValue(featureTag);
}

function dashboardStateFilters(state: unknown): DashboardFilters {
  return state !== null && typeof state === "object" && !Array.isArray(state)
    ? cloneDashboardFilters((state as Record<string, unknown>).filters)
    : {};
}

export function dashboardFeatureDescentPatch(
  state: unknown,
  featureTag: unknown,
): DashboardStateMutationPatch {
  const filters = dashboardStateFilters(state);
  const normalizedFeatureTag = normalizeDashboardFeatureTag(featureTag);
  if (normalizedFeatureTag === null) return { filters };
  return {
    filters: { ...filters, feature_tags: [normalizedFeatureTag] },
    graph_granularity: DOCUMENT_DASHBOARD_GRAPH_GRANULARITY,
  };
}

export function dashboardGraphDefaultsPatch(
  graph_granularity: unknown,
  filters?: DashboardFilters,
): DashboardStateMutationPatch {
  return {
    graph_granularity: normalizeDashboardGraphGranularity(graph_granularity),
    ...(filters ? { filters: cloneDashboardFilters(filters) } : {}),
  };
}

function dashboardGraphSettingsDefaultsRecord(
  defaults: unknown,
): Record<string, unknown> {
  return defaults !== null && typeof defaults === "object" && !Array.isArray(defaults)
    ? (defaults as Record<string, unknown>)
    : {};
}

export function normalizeDashboardGraphSettingsDefaults(
  defaults: unknown,
): GraphSettingsDefaults {
  const record = dashboardGraphSettingsDefaultsRecord(defaults);
  return {
    defaultGranularity: normalizeDashboardGraphGranularity(record.defaultGranularity),
    confidenceFloor:
      typeof record.confidenceFloor === "number" &&
      Number.isFinite(record.confidenceFloor)
        ? Math.min(100, Math.max(0, record.confidenceFloor))
        : 0,
    labelFilter: normalizeDashboardTextFilter(record.labelFilter) ?? "",
  };
}

export function dashboardGraphSettingsDefaultsPatch(
  defaults: unknown,
): DashboardStateMutationPatch {
  const normalizedDefaults = normalizeDashboardGraphSettingsDefaults(defaults);
  let filters: DashboardFilters = {};
  let filtersChanged = false;
  const floor = normalizedDefaults.confidenceFloor / 100;
  if (floor > 0) {
    filters = dashboardFiltersWithMinConfidence(filters, "temporal", floor);
    filters = dashboardFiltersWithMinConfidence(filters, "semantic", floor);
    filtersChanged = true;
  }
  if (normalizedDefaults.labelFilter) {
    filters = dashboardFiltersWithText(filters, normalizedDefaults.labelFilter);
    filtersChanged = true;
  }

  return dashboardGraphDefaultsPatch(
    normalizedDefaults.defaultGranularity,
    filtersChanged ? filters : undefined,
  );
}

export function usePatchDashboardState(scope: unknown) {
  const normalizedScope = normalizeDashboardStateWriteScope(scope);
  const queryClient = useQueryClient();
  const session = useSession();
  const sessionIdentity = dashboardStateSessionIdentity(session.data);
  return useMutation({
    mutationFn: (patch: DashboardStateMutationPatch) => {
      if (normalizedScope === null) {
        throw new Error("dashboard-state patch requires a scope");
      }
      return engineClient.patchDashboardState({ scope: normalizedScope, ...patch });
    },
    onSuccess: (state) => {
      updateDashboardStateCache(state, queryClient, sessionIdentity);
    },
  });
}

export function useDashboardStateMutations(scope: unknown) {
  const normalizedScope = normalizeDashboardStateWriteScope(scope);
  const client = useQueryClient();
  const session = useSession();
  const sessionIdentity = dashboardStateSessionIdentity(session.data);
  const mutation = usePatchDashboardState(normalizedScope);
  const commitPanelState = (panelState: unknown) => {
    const normalizedPanelState = normalizeDashboardPanelState(panelState);
    if (normalizedScope === null) {
      return mutation.mutateAsync(panelStatePatch(normalizedPanelState));
    }
    pendingPanelStatesByScope.set(normalizedScope, normalizedPanelState);
    return queuePanelStateWrite(normalizedScope, () =>
      mutation.mutateAsync(panelStatePatch(normalizedPanelState)),
    ).catch((error: unknown) => {
      pendingPanelStatesByScope.delete(normalizedScope);
      throw error;
    });
  };
  return {
    mutation,
    setSelection: (selectedIds: unknown) =>
      mutation.mutateAsync(selectionPatch(selectedIds)),
    setFilters: (filters: unknown) => mutation.mutateAsync(filtersPatch(filters)),
    setTextFilter: (text: unknown) => {
      const filters =
        normalizedScope === null
          ? {}
          : cachedDashboardFilters(client, normalizedScope, sessionIdentity);
      return mutation.mutateAsync(
        filtersPatch(dashboardFiltersWithText(filters, text)),
      );
    },
    setFeatureQuery: (query: unknown) => {
      const filters =
        normalizedScope === null
          ? {}
          : cachedDashboardFilters(client, normalizedScope, sessionIdentity);
      return mutation.mutateAsync(
        filtersPatch(dashboardFiltersWithFeatureQuery(filters, query)),
      );
    },
    toggleFilterFacet: (facet: unknown, value: unknown) => {
      const filters =
        normalizedScope === null
          ? {}
          : cachedDashboardFilters(client, normalizedScope, sessionIdentity);
      return mutation.mutateAsync(
        filtersPatch(dashboardFiltersWithFacetToggled(filters, facet, value)),
      );
    },
    setDateRange: (dateRange: unknown) =>
      mutation.mutateAsync(dateRangePatch(dateRange)),
    setFiltersAndDateRange: (filters: unknown, dateRange: unknown) =>
      mutation.mutateAsync(filtersAndDateRangePatch(filters, dateRange)),
    setTimelineMode: (mode: unknown) =>
      patchDashboardTimelineMode(normalizedScope, mode, client, sessionIdentity),
    setLens: (lens: unknown) => mutation.mutateAsync(lensPatch(lens)),
    setFocus: (focus: unknown) => mutation.mutateAsync(focusPatch(focus)),
    setPanelState: (panelState: unknown) => commitPanelState(panelState),
    updatePanelState: (panelState: unknown) => {
      const base =
        normalizedScope === null
          ? undefined
          : (pendingPanelStatesByScope.get(normalizedScope) ??
            cachedDashboardPanelState(client, normalizedScope, sessionIdentity));
      return commitPanelState(mergeDashboardPanelState(base, panelState));
    },
    setRepresentationMode: (mode: unknown) =>
      mutation.mutateAsync(representationModePatch(mode)),
    setGraphBounds: (bounds: unknown) => mutation.mutateAsync(graphBoundsPatch(bounds)),
    setGranularity: (granularity: unknown) =>
      mutation.mutateAsync(granularityPatch(granularity)),
    descendFeature: (state: unknown, featureTag: unknown) =>
      mutation.mutateAsync(dashboardFeatureDescentPatch(state, featureTag)),
    descendFeatureTag: (featureTag: unknown) => {
      const filters =
        normalizedScope === null
          ? {}
          : cachedDashboardFilters(client, normalizedScope, sessionIdentity);
      return mutation.mutateAsync(
        dashboardFeatureDescentPatch({ filters }, featureTag),
      );
    },
    applyGraphDefaults: (granularity: unknown, filters?: DashboardFilters) =>
      mutation.mutateAsync(dashboardGraphDefaultsPatch(granularity, filters)),
    applyGraphSettingsDefaults: (defaults: unknown) =>
      mutation.mutateAsync(dashboardGraphSettingsDefaultsPatch(defaults)),
  };
}

function cloneDateRange(range: unknown): DashboardDateRange {
  return normalizeDashboardDateRange(range);
}

// The graph-query filter forwards EVERY node/edge/text-reducing facet to the engine —
// it must, and is never re-derived as a client-side narrow of the served slice
// (node-facets-filter-on-the-engine; graph-filter-fetch-split ADR D2, REJECTED split).
// Two correctness gates make these facets un-client-narrowable:
//   1. Feature-aggregation gate: at feature granularity the engine applies the facet to
//      the underlying DOCUMENTS, then aggregates the survivors into feature-convergence
//      nodes and serves only those (tag + member_count) — the client never receives the
//      member documents, so it cannot reproduce a doc_type/status/text narrow.
//   2. Ceiling gate: at document granularity the engine truncates to MAX_DOCUMENT_NODES
//      BEFORE serialization, so a client narrow would act AFTER truncation and silently
//      drop matches beyond the ceiling.
// Smoothness (no blank, instant-on-repeat) is handled by the query's keepPreviousData +
// the bounded cache, NOT by moving filtering off the engine. The client membership
// narrows only what it can fully see: client-added nodes (ego expansions, pins) and the
// legend category mask.
export function dashboardGraphFilter(state: DashboardState): GraphFilter {
  const filter = cloneDashboardFilters(state.filters);
  if (hasDashboardDateRange(state.date_range)) {
    filter.date_range = cloneDateRange(state.date_range);
  } else {
    delete filter.date_range;
  }
  return filter;
}

export function dashboardGraphAsOf(
  state: Pick<DashboardState, "timeline_mode">,
): string | number | undefined {
  return state.timeline_mode.kind === "time-travel"
    ? state.timeline_mode.at
    : undefined;
}

export function dashboardGraphQueryVariables(
  state: DashboardState,
): DashboardGraphQueryVariables {
  return {
    scope: state.scope,
    filter: dashboardGraphFilter(state),
    asOf: dashboardGraphAsOf(state),
    granularity: state.graph_granularity,
    lens: state.salience_lens,
    focus: state.salience_focus,
  };
}
