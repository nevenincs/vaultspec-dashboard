// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import {
  filterChoicesFromDashboardState,
  type FilterChoices,
} from "../../view/filters";
import { normalizeDashboardDateRange } from "../dashboardDateRange";
import { isFreshDashboardGraphDefaultsState } from "../dashboardDefaults";
import {
  dashboardGraphQueryVariables,
  dashboardSelectionId,
  normalizeDashboardGraphBounds,
  normalizeDashboardGraphGranularity,
  normalizeDashboardPanelState,
  normalizeDashboardRepresentationMode,
  type DashboardGraphQueryVariables,
} from "../dashboardState";
import {
  dashboardPlayheadForTimelineMode,
  type DashboardPlayhead,
} from "../dashboardTimeline";
import {
  EngineError,
  engineClient,
  readTierAvailability,
  type DashboardDateRange,
  type DashboardFilters,
  type DashboardGraphBounds,
  type DashboardPanelState,
  type DashboardState,
  type DashboardTimelineMode,
  type GraphGranularity,
  type SessionState,
} from "../engine";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { normalizeGraphSliceScope } from "./graph";
import { engineKeys, stableKey } from "./internal";
import {
  useFiltersVocabulary,
  useTimelineDateCriterion,
  type TimelineDateCriterion,
} from "./listings";
import { useSession } from "./settings";

/** The tiers the timeline's dated-document axis depends on. The vault tree
 *  deliberately scopes its content availability to `structural` only and leaves
 *  temporal degradation to THIS surface (see `VAULT_TREE_CONTENT_TIERS`): the
 *  timeline draws the temporal axis, so a structural- or temporal-tier outage is
 *  the timeline's degraded condition. Semantic is search-only and never gates it. */
const TIMELINE_CONTENT_TIERS = ["structural", "temporal"] as const;

export interface TimelineAvailability {
  /** A structural/temporal tier is unavailable on the served filters vocabulary, so
   *  the timeline renders the uniform degraded state. Read from the tiers block (a
   *  fresh error envelope's tiers winning over a stale held-success block), never
   *  guessed from a transport error (degradation-is-read-from-tiers). */
  degraded: boolean;
}

/** Derive the timeline's degraded state from the filters vocabulary's tiers block.
 *  The corpus date bounds the timeline scrubs ride the `/filters` envelope, which
 *  carries the per-tier availability block; when the structural/temporal tier is
 *  down the bounds are unreliable, which is DEGRADED — distinct from a loaded-but-
 *  empty corpus (no dated documents), which is EMPTY. */
export function useTimelineAvailability(
  scope: unknown,
  corpus?: unknown,
): TimelineAvailability {
  const query = useFiltersVocabulary(scope, corpus);
  const errorTiers = query.error instanceof EngineError ? query.error.tiers : undefined;
  const tiers = errorTiers ?? query.data?.tiers_block;
  return useMemo(
    () => ({
      degraded: readTierAvailability(tiers, TIMELINE_CONTENT_TIERS).degraded,
    }),
    [tiers],
  );
}

export function dashboardStateSessionIdentity(
  session:
    | Pick<SessionState, "workspace" | "active_workspace" | "active_scope">
    | null
    | undefined,
): string {
  if (!session) return "session:pending";
  return stableKey({
    workspace: session.workspace,
    active_workspace: session.active_workspace,
    active_scope: session.active_scope,
  });
}

export interface DashboardStateRequestIdentity {
  scope: string | null;
  sessionIdentity: string;
}

export function normalizeDashboardStateRequestIdentity(
  scope: unknown,
  session:
    | Pick<SessionState, "workspace" | "active_workspace" | "active_scope">
    | null
    | undefined,
): DashboardStateRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    sessionIdentity: dashboardStateSessionIdentity(session),
  };
}

/**
 * The canonical frontend reader for shared dashboard state. Scope identifies the
 * dashboard snapshot; the backend session identity joins the key so a session
 * swap cannot serve another session's cached intent.
 */
export function useDashboardState(scope: unknown) {
  const session = useSession();
  const request = normalizeDashboardStateRequestIdentity(scope, session.data);
  const enabled = request.scope !== null && session.isSuccess;
  const query = useQuery<DashboardState>({
    queryKey: engineKeys.dashboardState(request.scope ?? "", request.sessionIdentity),
    // Forward TanStack's AbortSignal so a query cancellation (unmount / clear /
    // scope swap) aborts the in-flight fetch and TanStack OWNS the resulting
    // cancellation — instead of leaving a dangling /dashboard-state fetch that the
    // env teardown later aborts as an UNHANDLED rejection (the VaultBrowser render
    // test's red). Mirrors the graph-query signal-threading already in this module.
    queryFn: ({ signal }) => engineClient.dashboardState(request.scope!, signal),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

/** Stores/server selector for the canonical selected dashboard node id. */
export function useDashboardSelectedNodeId(scope: unknown): string | null {
  const dashboardState = useDashboardState(scope);
  return dashboardSelectionId(dashboardState.data);
}

export interface DashboardDateRangeView {
  fromMs: number;
  toMs: number;
  source: "dashboard" | "fallback";
}

function parseDashboardDateTick(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function deriveDashboardDateRangeView(
  dateRange: DashboardDateRange | undefined,
  fallback: Pick<DashboardDateRangeView, "fromMs" | "toMs">,
): DashboardDateRangeView {
  const normalized = normalizeDashboardDateRange(dateRange);
  const fromMs = parseDashboardDateTick(normalized.from);
  const toMs = parseDashboardDateTick(normalized.to);
  if (fromMs !== null && toMs !== null) {
    return { fromMs, toMs, source: "dashboard" };
  }
  return { ...fallback, source: "fallback" };
}

/**
 * Stores selector for dashboard-owned date-range display. Timeline chrome passes
 * its visible-window fallback, but the canonical dashboard-state date range wins
 * when present so every date-range consumer renders the same intent.
 */
export function useDashboardDateRangeView(
  scope: unknown,
  fallback: Pick<DashboardDateRangeView, "fromMs" | "toMs">,
): DashboardDateRangeView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardDateRangeView(dashboardState.data?.date_range, fallback),
    [dashboardState.data?.date_range, fallback],
  );
}

export interface DashboardRangeSelectView {
  dateRange: DashboardDateRange;
}

export function deriveDashboardRangeSelectView(
  state: Pick<DashboardState, "date_range"> | undefined,
): DashboardRangeSelectView {
  return {
    dateRange: normalizeDashboardDateRange(state?.date_range),
  };
}

/**
 * Stores selector for the timeline range selector. The component remains the
 * single writer for date-range intent, but committed band rendering reads one
 * stores-owned projection of canonical dashboard state.
 */
export function useDashboardRangeSelectView(scope: unknown): DashboardRangeSelectView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardRangeSelectView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardGraphDefaultsInitializationView {
  loaded: boolean;
  fresh: boolean;
  identity: string | null;
}

export function dashboardGraphDefaultsInitializationIdentity(
  scope: unknown,
  session:
    | Pick<SessionState, "workspace" | "active_workspace" | "active_scope">
    | null
    | undefined,
): string | null {
  const normalizedScope = normalizeGraphSliceScope(scope);
  if (normalizedScope === null || !session) return null;
  return stableKey({
    scope: normalizedScope,
    session: dashboardStateSessionIdentity(session),
  });
}

export function deriveDashboardGraphDefaultsInitializationView(
  state: Pick<DashboardState, "filters" | "graph_granularity"> | undefined,
  identity: string | null = null,
): DashboardGraphDefaultsInitializationView {
  return {
    loaded: state !== undefined,
    fresh: state ? isFreshDashboardGraphDefaultsState(state) : false,
    identity,
  };
}

/**
 * Stores selector for settings graph-default initialization. Settings effects
 * orchestrate the one-time write, but dashboard-state readiness/freshness is
 * interpreted here so the app effect does not read raw dashboard payloads.
 */
export function useDashboardGraphDefaultsInitializationView(
  scope: unknown,
): DashboardGraphDefaultsInitializationView {
  const session = useSession();
  const dashboardState = useDashboardState(scope);
  const identity = dashboardGraphDefaultsInitializationIdentity(scope, session.data);
  return useMemo(
    () => deriveDashboardGraphDefaultsInitializationView(dashboardState.data, identity),
    [dashboardState.data, identity],
  );
}

export interface DashboardFilterSummaryView {
  activeFilterCount: number;
  dateRangeLabel: string | null;
}

function dashboardDateRangeLabel(
  dateRange: DashboardDateRange | undefined,
): string | null {
  const normalized = normalizeDashboardDateRange(dateRange);
  if (!normalized.from && !normalized.to) return null;
  return `${normalized.from?.slice(0, 10) ?? "…"} → ${
    normalized.to?.slice(0, 10) ?? "…"
  }`;
}

export function deriveDashboardFilterSummaryView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
): DashboardFilterSummaryView {
  const filters = state?.filters ?? {};
  return {
    // The advanced-flyout facet count shown on the Filters button badge. The
    // feature query is NOT counted here — it is the visible search bar's own
    // state, authored beside the flyout, not an advanced facet inside it.
    activeFilterCount:
      (filters.doc_types?.length ?? 0) +
      (filters.feature_tags?.length ?? 0) +
      (filters.statuses?.length ?? 0) +
      (filters.plan_states?.length ?? 0) +
      (filters.health?.length ?? 0) +
      (filters.relations?.length ?? 0) +
      (filters.structural_state?.length ?? 0),
    dateRangeLabel: dashboardDateRangeLabel(state?.date_range),
  };
}

/**
 * Stores selector for the stage filter toolbar summary. FilterBar is display
 * chrome; it renders the count/date labels without reinterpreting the dashboard
 * wire shape beside the canonical graph/date selectors.
 */
export function useDashboardFilterSummaryView(
  scope: unknown,
): DashboardFilterSummaryView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardFilterSummaryView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardFilterChoicesView {
  choices: FilterChoices;
  loaded: boolean;
}

export function deriveDashboardFilterChoicesView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
): DashboardFilterChoicesView {
  return {
    choices: filterChoicesFromDashboardState(state),
    loaded: state !== undefined,
  };
}

/**
 * Stores/server selector for canonical dashboard filter choices. The pure
 * projection stays in stores/view/filters, but the dashboard-state subscription
 * lives here with the other dashboard-state selectors so consumers do not wire a
 * query hook from the view layer.
 */
export function useDashboardFilterChoicesView(
  scope: unknown,
): DashboardFilterChoicesView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardFilterChoicesView(dashboardState.data),
    [dashboardState.data],
  );
}

export function useDashboardFilterChoices(scope: unknown): FilterChoices {
  return useDashboardFilterChoicesView(scope).choices;
}

export type DashboardEditedWindow = "any" | "7d" | "30d" | "year";

const DAY_MS = 24 * 3600 * 1000;

export interface DashboardEditedWindowOptionView {
  key: DashboardEditedWindow;
  label: string;
}

export interface DashboardEditedWindowRowView extends DashboardEditedWindowOptionView {
  active: boolean;
  inputClassName: string;
  labelClassName: string;
  valueClassName: string;
}

export interface DashboardFilterSidebarPresentationView {
  panelAriaLabel: string;
  panelClassName: string;
  headerClassName: string;
  titleClassName: string;
  headerActionsClassName: string;
  titleLabel: string;
  clearAllClassName: string;
  clearAllLabel: string;
  clearAllAriaLabel: string;
  closeButtonClassName: string;
  closeAriaLabel: string;
  sectionClassName: string;
  sectionButtonClassName: string;
  sectionMetaClassName: string;
  sectionBadgeClassName: string;
  sectionIconClassName: string;
  sectionBodyClassName: string;
  kindSectionLabel: string;
  featureSectionLabel: string;
  editedSectionLabel: string;
  editedWindowAriaLabel: string;
  facetEmptyClassName: string;
  facetListClassName: string;
  facetOverflowButtonClassName: string;
  footerClassName: string;
  footerTextClassName: string;
  editedWindows: DashboardEditedWindowOptionView[];
}

export const DASHBOARD_FILTER_SIDEBAR_PRESENTATION: DashboardFilterSidebarPresentationView =
  {
    panelAriaLabel: "filter panel",
    // The advanced-filter flyout is portalled to <body> and positioned (fixed) to
    // the RIGHT of the rail's Filters button so it flies out OVER the stage — the
    // graph and any open documents — rather than being clipped inside the rail
    // column. The top/left are set inline from the trigger rect; this class owns
    // only the layer and pointer surface. The entrance is a fade applied by the
    // container ONLY once the anchor has settled (no slide — it would read as a
    // jump while the rail header reflows into place on open).
    panelClassName: "pointer-events-auto fixed z-50",
    headerClassName:
      "flex items-center justify-between border-b border-rule px-fg-3 py-fg-1-5",
    titleClassName: "text-body font-medium text-ink",
    headerActionsClassName: "flex items-center gap-fg-2",
    titleLabel: "Filter documents",
    clearAllClassName:
      "text-caption text-accent-text underline-offset-2 hover:underline",
    clearAllLabel: "Clear all",
    clearAllAriaLabel: "clear all filters",
    closeButtonClassName:
      "rounded-fg-xs p-fg-0-5 text-ink-faint hover:bg-paper-sunken hover:text-ink",
    closeAriaLabel: "close filter panel",
    sectionClassName: "border-b border-rule",
    sectionButtonClassName:
      "flex w-full items-center justify-between px-fg-3 py-fg-1-5 text-left text-label font-medium uppercase tracking-wider text-ink-muted hover:bg-paper-sunken",
    sectionMetaClassName: "flex items-center gap-fg-1-5",
    sectionBadgeClassName:
      "rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption font-normal text-ink-muted",
    sectionIconClassName: "text-ink-faint",
    sectionBodyClassName: "pb-2",
    kindSectionLabel: "Type",
    featureSectionLabel: "Feature",
    editedSectionLabel: "Edited",
    editedWindowAriaLabel: "edited window",
    facetEmptyClassName: "px-fg-3 py-fg-1 text-label italic text-ink-faint",
    facetListClassName: "space-y-fg-0-5 px-fg-3",
    facetOverflowButtonClassName:
      "ml-fg-1 text-label text-ink-faint underline hover:text-ink-muted",
    footerClassName: "border-t border-rule px-fg-3 py-fg-1-5",
    footerTextClassName: "text-label text-state-stale",
    editedWindows: [
      { key: "any", label: "Any time" },
      { key: "7d", label: "Last 7 days" },
      { key: "30d", label: "Last 30 days" },
      { key: "year", label: "This year" },
    ],
  };

export function dashboardEditedWindowRange(
  key: DashboardEditedWindow,
  now = Date.now(),
): DashboardDateRange {
  if (key === "any") return {};
  if (key === "7d") return { from: new Date(now - 7 * DAY_MS).toISOString() };
  if (key === "30d") return { from: new Date(now - 30 * DAY_MS).toISOString() };
  const year = new Date(now).getFullYear();
  return { from: new Date(Date.UTC(year, 0, 1)).toISOString() };
}

export function dashboardEditedWindowFromRange(
  range: DashboardDateRange,
  now = Date.now(),
): DashboardEditedWindow {
  if (!range.from && !range.to) return "any";
  if (range.to) return "any";
  const fromDay = range.from?.slice(0, 10);
  const dayFor = (offsetMs: number) =>
    new Date(now - offsetMs).toISOString().slice(0, 10);
  if (fromDay === dayFor(7 * DAY_MS)) return "7d";
  if (fromDay === dayFor(30 * DAY_MS)) return "30d";
  const yearStart = new Date(Date.UTC(new Date(now).getFullYear(), 0, 1))
    .toISOString()
    .slice(0, 10);
  return fromDay === yearStart ? "year" : "any";
}

function hasActiveDashboardDateRange(range: DashboardDateRange): boolean {
  return Boolean(range.from || range.to);
}

export interface DashboardFilterSidebarView {
  filters: DashboardFilters;
  dateRange: DashboardDateRange;
  docTypes: string[];
  featureTags: string[];
  statuses: string[];
  planStates: string[];
  health: string[];
  editedWindow: DashboardEditedWindow;
  editedWindowRows: DashboardEditedWindowRowView[];
  dateActive: boolean;
  anyActive: boolean;
  presentation: DashboardFilterSidebarPresentationView;
}

export function deriveDashboardFilterSidebarView(
  state: Pick<DashboardState, "filters" | "date_range"> | undefined,
  now = Date.now(),
): DashboardFilterSidebarView {
  const filters = state?.filters ?? {};
  const dateRange = normalizeDashboardDateRange(state?.date_range);
  const dateActive = hasActiveDashboardDateRange(dateRange);
  const editedWindow = dashboardEditedWindowFromRange(dateRange, now);
  return {
    filters,
    dateRange,
    docTypes: filters.doc_types ?? [],
    featureTags: filters.feature_tags ?? [],
    statuses: filters.statuses ?? [],
    planStates: filters.plan_states ?? [],
    health: filters.health ?? [],
    editedWindow,
    editedWindowRows: DASHBOARD_FILTER_SIDEBAR_PRESENTATION.editedWindows.map(
      (option) => ({
        ...option,
        active: option.key === editedWindow,
        inputClassName: "accent-accent",
        labelClassName:
          "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
        valueClassName: option.key === editedWindow ? "text-ink" : "text-ink-muted",
      }),
    ),
    dateActive,
    presentation: DASHBOARD_FILTER_SIDEBAR_PRESENTATION,
    anyActive:
      (filters.doc_types?.length ?? 0) > 0 ||
      (filters.feature_tags?.length ?? 0) > 0 ||
      (filters.statuses?.length ?? 0) > 0 ||
      (filters.plan_states?.length ?? 0) > 0 ||
      (filters.health?.length ?? 0) > 0 ||
      (filters.relations?.length ?? 0) > 0 ||
      (filters.structural_state?.length ?? 0) > 0 ||
      dateActive,
  };
}

/**
 * Stores selector for the full filter sidebar. The sidebar is app chrome: it
 * renders selected facets, active badges, and edited-window radios from one
 * interpreted dashboard-state view instead of reading raw filter/date payloads.
 */
export function useDashboardFilterSidebarView(
  scope: unknown,
): DashboardFilterSidebarView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardFilterSidebarView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardTimelineModeView {
  mode: DashboardTimelineMode;
  timeTravel: boolean;
  opsDisabled: boolean;
  asOf?: number;
}

const LIVE_DASHBOARD_TIMELINE_MODE: DashboardTimelineMode = { kind: "live" };

export function deriveDashboardTimelineModeView(
  mode: DashboardTimelineMode | undefined,
): DashboardTimelineModeView {
  const resolved = mode ?? LIVE_DASHBOARD_TIMELINE_MODE;
  if (resolved.kind === "time-travel") {
    return {
      mode: resolved,
      timeTravel: true,
      opsDisabled: true,
      asOf: resolved.at,
    };
  }
  return {
    mode: resolved,
    timeTravel: false,
    opsDisabled: false,
    asOf: undefined,
  };
}

/**
 * Stores selector for the dashboard timeline mode. App chrome consumes this
 * interpreted view so time-travel cues, historical `asOf` reads, and operation
 * disablement all come from one stores-owned reading of `timeline_mode`.
 */
export function useDashboardTimelineModeView(
  scope: unknown,
): DashboardTimelineModeView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardTimelineModeView(dashboardState.data?.timeline_mode),
    [dashboardState.data?.timeline_mode],
  );
}

export interface DashboardPlayheadView {
  loaded: boolean;
  playhead: DashboardPlayhead;
}

export function deriveDashboardPlayheadView(
  state: Pick<DashboardState, "timeline_mode"> | undefined,
): DashboardPlayheadView {
  return {
    loaded: state !== undefined,
    playhead: dashboardPlayheadForTimelineMode(state?.timeline_mode),
  };
}

/**
 * Stores selector for the timeline playhead's canonical dashboard-state mirror.
 * The timeline viewport is client-state in the shared TanStack cache, while
 * timeline-mode -> playhead interpretation is shared with the dashboard write seam.
 */
export function useDashboardPlayheadView(scope: unknown): DashboardPlayheadView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardPlayheadView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardStageSceneView {
  selectedIds: string[];
  selectedNodeId: string | null;
  graphQuery: DashboardGraphQueryVariables | null;
  granularity: GraphGranularity;
  activeRepresentationMode: DashboardState["representation_mode"];
  graphBounds: DashboardGraphBounds | undefined;
  timeline: DashboardTimelineModeView;
  liveTimeline: boolean;
}

export function deriveDashboardStageSceneView(
  state: DashboardState | undefined,
  dateField?: TimelineDateCriterion,
): DashboardStageSceneView {
  const timeline = deriveDashboardTimelineModeView(state?.timeline_mode);
  return {
    selectedIds: state?.selected_ids ? [...state.selected_ids] : [],
    selectedNodeId: dashboardSelectionId(state),
    graphQuery: state ? dashboardGraphQueryVariables(state, dateField) : null,
    granularity: state?.graph_granularity ?? "feature",
    activeRepresentationMode: normalizeDashboardRepresentationMode(
      state?.representation_mode,
    ),
    graphBounds: state?.graph_bounds
      ? normalizeDashboardGraphBounds(state.graph_bounds)
      : undefined,
    timeline,
    liveTimeline: !timeline.timeTravel,
  };
}

/**
 * Stores selector for the Stage scene-owner read model. Stage still owns scene
 * commands, but dashboard-state interpretation stays centralized with the other
 * visual UI selectors.
 */
export function useDashboardStageSceneView(scope: unknown): DashboardStageSceneView {
  const dashboardState = useDashboardState(scope);
  const { criterion, served } = useTimelineDateCriterion(scope);
  // The graph narrows its date_range window by the active criterion (Issue #14),
  // gated to a non-default, engine-advertised value so an older engine is unaffected.
  const dateField = served && criterion !== "created" ? criterion : undefined;
  return useMemo(
    () => deriveDashboardStageSceneView(dashboardState.data, dateField),
    [dashboardState.data, dateField],
  );
}

export interface DashboardGraphControlsView {
  timeline: DashboardTimelineModeView;
  representationMode: DashboardState["representation_mode"];
  graphBounds: DashboardGraphBounds;
  freezeAvailable: boolean;
  /** The active graph granularity — the read-back the View section's Features /
   *  Documents toggle renders its active segment from, so the control can never
   *  drift from the served dashboard-state. */
  granularity: GraphGranularity;
}

export function deriveDashboardGraphControlsView(
  state:
    | Pick<
        DashboardState,
        "graph_bounds" | "representation_mode" | "timeline_mode" | "graph_granularity"
      >
    | undefined,
): DashboardGraphControlsView {
  const timeline = deriveDashboardTimelineModeView(state?.timeline_mode);
  const representationMode = normalizeDashboardRepresentationMode(
    state?.representation_mode,
  );
  return {
    timeline,
    representationMode,
    graphBounds: normalizeDashboardGraphBounds(state?.graph_bounds),
    freezeAvailable: representationMode === "connectivity" && !timeline.timeTravel,
    granularity: normalizeDashboardGraphGranularity(state?.graph_granularity),
  };
}

/**
 * Stores selector for graph-control chrome: containment bounds plus the freeze
 * toggle's live/connectivity applicability. Scene commands stay in the app, but
 * dashboard-state interpretation stays here.
 */
export function useDashboardGraphControlsView(
  scope: unknown,
): DashboardGraphControlsView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardGraphControlsView(dashboardState.data),
    [dashboardState.data],
  );
}

export interface DashboardShellChromeView {
  panelState: DashboardPanelState;
  timeline: DashboardTimelineModeView;
}

export function deriveDashboardShellChromeView(
  state: Pick<DashboardState, "panel_state" | "timeline_mode"> | undefined,
): DashboardShellChromeView {
  return {
    panelState: normalizeDashboardPanelState(state?.panel_state),
    timeline: deriveDashboardTimelineModeView(state?.timeline_mode),
  };
}

/**
 * Stores selector for AppShell chrome. The shell consumes a single interpreted
 * panel/time-travel view instead of reading raw dashboard-state fields for rail
 * collapse, right-tab, and context-menu operation gating.
 */
export function useDashboardShellChromeView(scope: unknown): DashboardShellChromeView {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => deriveDashboardShellChromeView(dashboardState.data),
    [dashboardState.data],
  );
}
