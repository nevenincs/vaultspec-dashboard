// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import { normalizeSearchQuery } from "../../searchQuery";
import { normalizeSearchTarget, type SearchTarget } from "../../searchTarget";
import {
  engineClient,
  type LineageArc,
  type LineageNode,
  type LineageSlice,
} from "../engine";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { normalizeGraphSliceAsOf, normalizeGraphSliceScope } from "./graph";
import { engineKeys, noopRetry, withManualRetry } from "./internal";

export function useEngineEvents(scope: unknown, range: unknown = {}, bucket?: unknown) {
  const request = normalizeEngineEventsRequestIdentity(scope, range, bucket);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.events(request.scope ?? "", request.range, request.bucket),
    queryFn: () =>
      engineClient.events({
        scope: request.scope!,
        ...request.range,
        bucket: request.bucket,
      }),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export interface EngineEventsRequestIdentity {
  scope: string | null;
  range: { from?: string; to?: string };
  bucket: string | undefined;
}

export interface TimelineLineageRequestIdentity {
  scope: string | null;
  range: { from?: string; to?: string };
  filter: string | undefined;
  asOf: string | number | undefined;
}

export interface GraphDiffRequestIdentity {
  scope: string | null;
  from: string | number | null;
  to: string | number | null;
  filter: string | undefined;
}

function normalizeTemporalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeTemporalRange(range: unknown): { from?: string; to?: string } {
  const source =
    range !== null && typeof range === "object" && !Array.isArray(range)
      ? (range as Record<string, unknown>)
      : {};
  return {
    from: normalizeTemporalText(source.from),
    to: normalizeTemporalText(source.to),
  };
}

function normalizeTemporalPoint(value: unknown): string | number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return normalizeTemporalText(value) ?? null;
}

export function normalizeEngineEventsRequestIdentity(
  scope: unknown,
  range: unknown = {},
  bucket?: unknown,
): EngineEventsRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    range: normalizeTemporalRange(range),
    bucket: normalizeTemporalText(bucket),
  };
}

export function normalizeTimelineLineageRequestIdentity(
  scope: unknown,
  range: unknown = {},
  filter?: unknown,
  asOf?: unknown,
): TimelineLineageRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    range: normalizeTemporalRange(range),
    filter: normalizeTemporalText(filter),
    asOf: normalizeGraphSliceAsOf(asOf),
  };
}

export function normalizeGraphDiffRequestIdentity(
  scope: unknown,
  from: unknown,
  to: unknown,
  filter?: unknown,
): GraphDiffRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    from: normalizeTemporalPoint(from),
    to: normalizeTemporalPoint(to),
    filter: normalizeTemporalText(filter),
  };
}

/**
 * The bounded temporal-lineage projection for the timeline (dashboard-timeline
 * ADR, W02.P04.S22). Wraps `engineClient.lineage` so the timeline surface is a
 * dumb single-selector consumer (dashboard-layer-ownership: the stores layer is
 * the sole wire client) — the surface never fetches the engine, never reads the
 * raw `tiers` block, and defines no lineage shape of its own. Returns the dated
 * nodes + self-consistent arcs + `tiers` + honest `truncated`; disabled when
 * scope is null (no worktree resolved yet), following the `useGraphSlice` /
 * `useEngineEvents` enabled-on-scope pattern. The (scope, range, filter) key
 * triple makes a range scrub or a feature filter its own cache entry.
 */
export function useTimelineLineage(
  scope: unknown,
  range: unknown = {},
  filter?: unknown,
  asOf?: unknown,
) {
  const request = normalizeTimelineLineageRequestIdentity(scope, range, filter, asOf);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.lineage(
      request.scope ?? "",
      request.range,
      request.filter,
      request.asOf,
    ),
    queryFn: () =>
      engineClient.lineage({
        scope: request.scope!,
        ...request.range,
        filter: request.filter,
        // BLOB-TRUE as-of (dashboard-timeline ADR fast-follow): when the timeline
        // is in time-travel it passes the (settled/debounced) playhead instant, so
        // the slice reflects the graph at T, not just creation-date gating. Absent
        // (LIVE) = live graph. A distinct `asOf` is its own cache entry (above).
        t: request.asOf == null ? undefined : String(request.asOf),
      }),
    enabled,
    // Flicker-free refresh on a BESPOKE backend signal: the timeline holds its
    // dataset in memory and windows it client-side, so this query refetches ONLY
    // when its identity changes — a graph generation bump (the SSE delta clock
    // invalidates the `lineage` subtree) or a filter/as-of switch, never on
    // navigation. `placeholderData` keeps the PREVIOUS dataset rendered across
    // that refetch so the surface never blanks/reloads (the user-visible flicker
    // the range-keyed fetch used to cause). Continuous, never destroyed.
    placeholderData: keepPreviousData,
  });
  return withManualRetry(enabled ? query : { ...query, data: undefined });
}

export interface TimelineLineageView {
  loading: boolean;
  errored: boolean;
  nodes: LineageNode[];
  arcs: LineageArc[];
  retry: () => void;
}

export interface TimelineSurfaceChromeView {
  showLoading: boolean;
  // Loading is UI-only (state-mode-uniformity ADR): the label is the screen-reader
  // name of the shared `Skeleton`, never visible body copy — no presentation
  // className is carried. Empty/degraded render through the shared `StateBlock`, so
  // their presentation classNames/dots are likewise the kit's, not the deriver's.
  loadingLabel: string;
  showEmpty: boolean;
  emptyLabel: string;
  showDegraded: boolean;
  degradedLabel: string;
  showError: boolean;
  errorLabel: string;
  errorClassName: string;
  retryLabel: string;
  retryButtonClassName: string;
}

export function deriveTimelineLineageView(
  data: LineageSlice | undefined,
  loading: boolean,
  errored: boolean,
  retry: () => void = noopRetry,
): TimelineLineageView {
  const slice = loading || errored ? undefined : data;
  return {
    loading,
    errored,
    nodes: slice?.nodes ?? [],
    arcs: slice?.arcs ?? [],
    retry,
  };
}

export function deriveTimelineSurfaceChromeView({
  scopePresent,
  loading,
  errored,
  autoFitPending,
  hasMarks,
  surface,
}: {
  scopePresent: boolean;
  loading: boolean;
  errored: boolean;
  autoFitPending: boolean;
  hasMarks: boolean;
  surface: string;
}): TimelineSurfaceChromeView {
  const showEmpty =
    scopePresent &&
    !loading &&
    !errored &&
    !autoFitPending &&
    !hasMarks &&
    (surface === "empty" || surface === "normal" || surface === "lifecycle-sparse");
  return {
    showLoading: loading || autoFitPending,
    loadingLabel: "reading the timeline…",
    showEmpty,
    emptyLabel:
      surface === "lifecycle-sparse"
        ? "lineage appears as documents gain dates"
        : "no lineage in this range yet",
    showDegraded: surface === "reconnecting" && !errored,
    degradedLabel: "reconnecting — showing the last lineage",
    showError: errored,
    errorLabel: "couldn’t load the timeline",
    errorClassName:
      "absolute left-fg-2 top-1/2 flex -translate-y-1/2 items-center gap-fg-2 text-caption text-ink-muted",
    retryLabel: "retry",
    retryButtonClassName:
      "rounded-fg-xs bg-paper-sunken px-fg-1-5 py-fg-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
  };
}

/**
 * Stores selector for the timeline's bounded lineage read. The timeline surface
 * consumes interpreted loading/error state and stable node/arc arrays instead of
 * branching on raw query flags and optional payload fields.
 */
export function useTimelineLineageView(
  scope: unknown,
  range: unknown = {},
  filter?: unknown,
  asOf?: unknown,
): TimelineLineageView {
  const lineage = useTimelineLineage(scope, range, filter, asOf);
  return useMemo(
    () =>
      deriveTimelineLineageView(
        lineage.data,
        lineage.isLoading,
        lineage.isError,
        lineage.retry,
      ),
    [lineage.data, lineage.isError, lineage.isLoading, lineage.retry],
  );
}

/**
 * Graph diff between two timestamps (§5 /graph/diff). Returns the set of
 * add/remove/change operations on nodes and edges between `from` and `to`
 * (millisecond timestamps or ISO strings). Disabled when scope is null or
 * the window is empty (from === to). Cache keys fold both endpoints so two
 * windows never collide, and fold the optional filter because it changes the
 * served delta set (mirrors engineKeys.graph folding filter/as-of).
 */
export function useGraphDiff(
  scope: unknown,
  from: unknown,
  to: unknown,
  filter?: unknown,
) {
  const request = normalizeGraphDiffRequestIdentity(scope, from, to, filter);
  const enabled =
    request.scope !== null &&
    request.from !== null &&
    request.to !== null &&
    String(request.from) !== String(request.to);
  const query = useQuery({
    queryKey: engineKeys.diff(
      request.scope ?? "",
      request.from ?? "",
      request.to ?? "",
      request.filter,
    ),
    queryFn: () =>
      engineClient.graphDiff({
        scope: request.scope!,
        from: request.from!,
        to: request.to!,
        filter: request.filter,
      }),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export { normalizeSearchTarget } from "../../searchTarget";
export type { SearchTarget } from "../../searchTarget";

export interface SearchRequestIdentity {
  query: string;
  target: SearchTarget;
  scope: string | null;
}

export const normalizeSearchScope = normalizeGraphSliceScope;

export function normalizeSearchRequestIdentity(
  rawQuery: unknown,
  target: unknown,
  scope: unknown,
): SearchRequestIdentity {
  return {
    query: normalizeSearchQuery(rawQuery),
    target: normalizeSearchTarget(target),
    scope: normalizeSearchScope(scope),
  };
}

export function useEngineSearch(
  scope: unknown,
  query: unknown,
  target: unknown = "vault",
) {
  const request = normalizeSearchRequestIdentity(query, target, scope);
  const enabled = request.scope !== null && request.query.length > 0;
  const result = useQuery({
    queryKey: engineKeys.search(request.scope ?? "", request.query, request.target),
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(
        () => controller.abort(),
        SEARCH_QUERY_TIMEOUT_MS,
      );
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      try {
        return await engineClient.search(
          {
            scope: request.scope!,
            query: request.query,
            target: request.target,
            max_results: SEARCH_MAX_RESULTS,
          },
          controller.signal,
        );
      } finally {
        window.clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
      }
    },
    enabled,
    // Search is user-driven and has an explicit retry affordance. Do not let the
    // shared transient retry policy prolong a bounded search timeout into a
    // second spinner cycle.
    retry: false,
    // Evict superseded search results promptly (B7, resource-hardening): a long
    // search session issues many distinct query strings, each a fresh cache
    // entry holding a SearchResponse. A short gcTime drops a result soon after
    // its observer goes (query changed / panel closed), bounding cache count
    // instead of holding every term for the global 120s default.
    gcTime: 30_000,
  });
  return enabled ? result : { ...result, data: undefined };
}

// The client-side search abort budget. Ordering invariant (rag-integration-
// hardening ADR D2): this MUST stay STRICTLY GREATER than the engine's search
// budget (`SEARCH_HTTP_BUDGET` = 10s in `engine/crates/vaultspec-api/src/routes/
// ops.rs`) plus transport margin. When the client outlives the engine, every
// search outcome — success, degraded, or shape-miss — arrives as a tiers-carrying
// envelope BEFORE the client can abort, so degradation is read from tiers truth
// (the whole degradation architecture depends on the envelope actually landing).
// A client abort under this ordering therefore means only one thing honestly: the
// engine itself is unreachable — the genuine transport-error state. 12s = 10s
// engine budget + 2s transport margin. Exported so a guard test can pin the
// ordering invariant client-side (the engine budget it must exceed).
export const SEARCH_QUERY_TIMEOUT_MS = 12_000;

// The engine's own search budget (`SEARCH_HTTP_BUDGET` in
// `engine/crates/vaultspec-api/src/routes/ops.rs`), mirrored here ONLY so the
// ordering invariant is guard-testable on the frontend. This is not a wire value
// the app reads — it is the number the client budget above must strictly exceed.
// Two-sided anchor: the engine test
// `search_budget_is_pinned_to_the_frontend_mirror_anchor` (ops.rs) pins the real
// constant to this value, so a budget retune fails engine-side before this mirror
// can go silently stale.
export const ENGINE_SEARCH_BUDGET_MS = 10_000;

// The app-chosen per-target result bound, sent as `max_results` in the POST
// /search body so the wire payload is app-bounded rather than left at rag's CLI
// default (rag-integration-hardening ADR D5 / research G6). Sized to the unified
// palette's merged-view bound (`UNIFIED_SEARCH_RESULTS_MAX_ITEMS` = 40 in
// `searchController.ts`): the merge ranks vault + code hits together and keeps the
// top N, so in the worst case all N winners come from one corpus — fetching up to
// N per target is the honest bound that keeps the merged top-N correct. It sits
// below the engine's `MAX_SEARCH_RESULTS` ceiling (50). The value is FIXED, so it
// stays OUT of the query key (the key varies only by scope/target/query); a guard
// test pins it equal to the merged-view bound so the two never drift.
export const SEARCH_MAX_RESULTS = 40;
