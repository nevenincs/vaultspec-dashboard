// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import { normalizeNodeId } from "../../nodeIds";
import { normalizeDashboardDateRange } from "../dashboardDateRange";
import {
  cloneDashboardFilters,
  normalizeDashboardGraphCorpus,
  normalizeDashboardGraphGranularity,
  normalizeDashboardSalienceLens,
} from "../dashboardState";
import {
  CANONICAL_TIERS,
  DEFAULT_SALIENCE_LENS,
  engineClient,
  readTierAvailability,
  tiersFromQuery,
  type EmbeddingsResponse,
  type EngineEdge,
  type EngineNode,
  type GraphCorpus,
  type GraphFilter,
  type GraphGranularity,
  type GraphSlice,
  type NodeDetail,
  type SalienceLens,
  type TierAvailability,
  type TiersBlock,
} from "../engine";
import { useGraphSliceBuildingReconcilePoll } from "../graphSync";
import { featureTagFromNodeId } from "../liveAdapters";
import { normalizeStoreScope } from "../scopeIdentity";
import {
  authoredDisplayText,
  compareAuthoredDisplayText,
} from "../../../platform/localization/displayText";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDashboardStageSceneView, useDashboardState } from "./dashboard";
import { engineKeys } from "./internal";

export interface GraphSliceRequestIdentity {
  scope: string | null;
  filter: GraphFilter;
  asOf: string | number | undefined;
  granularity: GraphGranularity;
  lens: SalienceLens;
  focus: string | null;
  corpus: GraphCorpus;
}

function graphSliceRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const normalizeGraphSliceScope = normalizeStoreScope;

export function normalizeGraphSliceAsOf(asOf: unknown): string | number | undefined {
  if (typeof asOf === "number") return Number.isFinite(asOf) ? asOf : undefined;
  if (typeof asOf !== "string") return undefined;
  const normalized = asOf.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function normalizeGraphSliceFilter(filter: unknown): GraphFilter {
  const source = graphSliceRecord(filter);
  const normalized: GraphFilter = cloneDashboardFilters(source);
  const dateRange = normalizeDashboardDateRange(source.date_range);
  if (dateRange.from || dateRange.to) normalized.date_range = dateRange;
  return normalized;
}

export function normalizeGraphSliceRequestIdentity(
  scope: unknown,
  filter: unknown,
  asOf: unknown,
  granularity: unknown,
  lens: unknown,
  focus: unknown,
  corpus?: unknown,
): GraphSliceRequestIdentity {
  const normalizedCorpus = normalizeDashboardGraphCorpus(corpus);
  // The code corpus carries no vault Filter grammar, no salience lens, no as_of and
  // no focus (ADR D1/D5 — the queryFn sends none of them), so none of those may be
  // part of the request IDENTITY either: pin them to their canonical defaults so a
  // left-rail filter toggle cannot re-key and re-fetch a byte-identical code slice
  // (settle-on-swap audit — the spurious re-deliveries that interrupted in-flight
  // settles and froze the layout mid-convergence). The ONE facet that does carry
  // over is the timeline's `date_range` (code-timeline-range ADR): it stays in the
  // identity so a range change re-keys and re-narrows the code slice by mtime.
  if (normalizedCorpus === "code") {
    const dateRange = normalizeGraphSliceFilter(filter).date_range;
    const codeFilter = normalizeGraphSliceFilter(undefined);
    if (dateRange) codeFilter.date_range = dateRange;
    return {
      scope: normalizeGraphSliceScope(scope),
      filter: codeFilter,
      asOf: undefined,
      granularity: normalizeDashboardGraphGranularity(granularity),
      lens: normalizeDashboardSalienceLens(undefined),
      focus: normalizeNodeId(undefined),
      corpus: normalizedCorpus,
    };
  }
  return {
    scope: normalizeGraphSliceScope(scope),
    filter: normalizeGraphSliceFilter(filter),
    asOf: normalizeGraphSliceAsOf(asOf),
    granularity: normalizeDashboardGraphGranularity(granularity),
    lens: normalizeDashboardSalienceLens(lens),
    focus: normalizeNodeId(focus),
    corpus: normalizedCorpus,
  };
}

/**
 * Whether a tiers block still names a tier mid-build (the engine's
 * unavailable-while-building sentinel — a canonical tier marked unavailable with a
 * reason that names a build). Exported so the stores-layer building poll (graphSync)
 * can read the same predicate off a delta response's fresh tiers.
 */
export function tiersReportBuilding(tiers: TiersBlock | undefined): boolean {
  if (!tiers) return false;
  return CANONICAL_TIERS.some((tier) => {
    const state = tiers[tier];
    return (
      state?.available === false &&
      typeof state.reason === "string" &&
      state.reason.toLowerCase().includes("building")
    );
  });
}

/**
 * Whether a HELD graph slice's tiers block still names a tier mid-build. The tiers
 * block is a per-fetch SNAPSHOT, and a declared fold's completion splices its edges
 * via the no-refetch delta path (graphSync), so a "still building" tier would
 * otherwise never clear from the held slice until an unrelated refetch — the stuck
 * "Still loading links…" banner (Issue #4A). While this holds, the stores-layer
 * building poll re-reads the tiers through the graph-slice DELTA path (sub-KB, not a
 * full ~3.5 MB refetch — graph-slice-delta ADR D4); once the fold flips the tier to
 * ready it returns false and the poll stops. Mirrors `isBuildingReason` on the
 * chrome side.
 */
function graphSliceHasBuildingTier(data: GraphSlice | undefined): boolean {
  return tiersReportBuilding(data?.tiers);
}

export function useGraphSlice(
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
  lens?: unknown,
  focus?: unknown,
  corpus?: unknown,
) {
  const request = normalizeGraphSliceRequestIdentity(
    scope,
    filter,
    asOf,
    granularity,
    lens,
    focus,
    corpus,
  );
  const isCode = request.corpus === "code";
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.graph(
      request.scope ?? "",
      request.filter,
      request.asOf,
      request.granularity,
      request.lens,
      request.focus,
      request.corpus,
    ),
    queryFn: () =>
      // The code corpus is a DISCONNECTED dataset (ADR D1/D5): it carries no vault
      // Filter grammar, no salience lens, and no as_of (present view only) — the
      // engine rejects those on the code corpus as typed errors. The ONE shared
      // facet is the timeline `date_range` (code-timeline-range ADR), always sent
      // with its pinned `modified` criterion — the only date a code file carries.
      isCode
        ? engineClient.graphQuery({
            scope: request.scope!,
            granularity: request.granularity,
            corpus: "code",
            ...(request.filter.date_range
              ? {
                  filter: {
                    date_range: request.filter.date_range,
                    date_field: "modified" as const,
                  },
                }
              : {}),
          })
        : engineClient.graphQuery({
            scope: request.scope!,
            filter: request.filter,
            as_of: request.asOf,
            granularity: request.granularity,
            lens: request.lens,
            focus: request.focus,
          }),
    enabled,
    // Tier-1 filter changes (graph-filter-fetch-split ADR D1): hold the prior bounded
    // slice while the newly-filtered one loads, so a filter change never blanks and a
    // previously-seen filter resolves instantly from cache. The scene's warm-start
    // (object constancy by id) animates the transition rather than re-exploding.
    placeholderData: keepPreviousData,
  });
  // Held-slice tiers lag (Issue #4A): while a held tier reads building, the stores
  // building poll re-reads the tiers on a bounded cadence through the graph-slice
  // DELTA path (sub-KB — graph-slice-delta ADR D4), NOT the old full-slice
  // `refetchInterval` that perpetually re-pulled ~3.5 MB on a corpus under continuous
  // edit. The poll stops the moment the fold flips the tier to ready. Only a
  // present-view document-vault slice is delta-eligible; other shapes degrade to the
  // floored sweep (see the poll doc).
  useGraphSliceBuildingReconcilePoll(
    request.scope,
    enabled && graphSliceHasBuildingTier(query.data as GraphSlice | undefined),
    request.granularity === "document" &&
      request.corpus === "vault" &&
      request.asOf === undefined,
  );
  return enabled ? query : { ...query, data: undefined };
}

/**
 * Constellation-first progressive graph slice (on-demand-cold-start ADR D1).
 * A LIVE document-granularity request whose slice is COLD (no held or
 * placeholder data — the 1.9MB-class read is still in flight) serves the
 * same-identity feature-LOD constellation as the held slice instead: 16x
 * smaller, and a cache SHARE with the nav toolbar's descent (same query key),
 * so a re-ascend or prior visit paints instantly. `isPending` is masked false
 * while the fill shows, which makes the availability derivation report
 * `refreshing` — the canvas renders the real constellation plus the
 * non-blocking refresh banner, never a blank skeleton for MBs. Passthrough
 * (zero extra query) for: feature-granularity requests, time-travel (`asOf`
 * reads one historical snapshot), and any slice with held data.
 */
export function useProgressiveGraphSlice(
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
  lens?: unknown,
  focus?: unknown,
  corpus?: unknown,
) {
  const requested = useGraphSlice(
    scope,
    filter,
    asOf,
    granularity,
    lens,
    focus,
    corpus,
  );
  const wantsFill =
    normalizeDashboardGraphGranularity(granularity) === "document" &&
    normalizeGraphSliceAsOf(asOf) === undefined;
  // Cold = the requested slice holds nothing (not even keepPreviousData).
  const cold = wantsFill && requested.data === undefined;
  const constellation = useGraphSlice(
    cold ? scope : null,
    filter,
    undefined,
    "feature",
    lens,
    focus,
    corpus,
  );
  const fillData = cold ? constellation.data : undefined;
  return useMemo(() => {
    if (fillData === undefined) return requested;
    return { ...requested, data: fillData, isPending: false };
  }, [requested, fillData]);
}

/**
 * The active-lens graph slice (graph-node-salience): reads lens + focus from
 * canonical dashboard state and parameterizes the graph query by them, so a lens
 * switch or focus change is a re-query keyed on (lens, focus).
 */
export function useSalienceGraphSlice(
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
) {
  const normalizedScope = normalizeGraphSliceScope(scope);
  const dashboardState = useDashboardState(normalizedScope);
  const state = dashboardState.data;
  return useGraphSlice(
    state ? normalizedScope : null,
    filter,
    asOf,
    granularity,
    state?.salience_lens,
    state?.salience_focus ?? null,
    // The active corpus (codebase-graphing ADR D7): read from canonical
    // dashboard state so a corpus switch is a re-query keyed on (…, corpus).
    state?.corpus,
  );
}

/**
 * The salience query's loading + degradation truth, derived in the stores layer
 * so the scene loading channel and the chrome never read the raw `tiers` block or
 * re-derive partiality (dashboard-layer-ownership / degradation-is-read-from-
 * tiers). `loading` covers BOTH the initial fetch and a focus-change re-query
 * (`isFetching`), so the scene can show a loading state on a focus change behind
 * the stores->scene boundary (W04.P09.S39). `partial` is the engine's
 * `salience_partial` flag when served, OR derived from a degraded tier in the
 * served block — read from tiers, fresh error tiers winning over a stale held
 * success block, NEVER from a bare transport error (S40).
 */
export interface SalienceSliceView {
  /** The active lens the slice was (or is being) computed for. */
  lens: SalienceLens;
  /** The slice is in flight: an initial fetch, a lens switch, or a focus change. */
  loading: boolean;
  /** The salience ranking is partial (a relevant tier degraded). */
  partial: boolean;
  /** Names of the tiers reporting unavailable/absent in the served block. */
  degradedTiers: string[];
  /** Per-tier human reason the engine supplied, keyed by tier name. */
  reasons: Record<string, string>;
}

/**
 * Derive the salience slice view from the served data + error + in-flight state.
 * Degradation is read from the `tiers` block through the single reader (success
 * data, or the error envelope's tiers, with FRESH error tiers winning over a
 * stale held-success block via `tiersFromQuery` —
 * degradation-is-read-from-tiers), and `partial` honors the engine's own
 * `salience_partial` flag OR a degraded tier in that block. A wholly absent
 * block (a bare transport fault) is NOT treated as degraded here — that is the
 * query's error state, which the scene renders distinctly.
 */
export function deriveSalienceSliceView(
  lens: SalienceLens,
  data: GraphSlice | undefined,
  error: unknown,
  loading: boolean,
): SalienceSliceView {
  const servedData = loading ? undefined : data;
  const { degradedTiers, reasons } = readTierAvailability(
    tiersFromQuery({ data: servedData, error }),
    CANONICAL_TIERS,
  );
  // Partial: the engine's explicit flag, OR a degraded tier in the served block.
  // Never inferred from a bare transport error (no tiers => not partial here).
  const partial = servedData?.salience_partial === true || degradedTiers.length > 0;
  return { lens: servedData?.lens ?? lens, loading, partial, degradedTiers, reasons };
}

/**
 * Stores hook: the active-lens salience slice view (loading on lens/focus change,
 * partiality + degradation read from tiers), so the scene loading channel and the
 * lens-selector chrome consume interpreted truth, never the raw `tiers` block.
 * `loading` is true on a focus change too (the warm-started PPR re-query), which
 * is the focus-change loading state the scene shows behind the stores boundary.
 */
export function useSalienceSliceView(
  scope: unknown,
  filter?: unknown,
  asOf?: unknown,
  granularity?: unknown,
): SalienceSliceView {
  const normalizedScope = normalizeGraphSliceScope(scope);
  const dashboardState = useDashboardState(normalizedScope);
  const lens = dashboardState.data?.salience_lens ?? DEFAULT_SALIENCE_LENS;
  const slice = useSalienceGraphSlice(normalizedScope, filter, asOf, granularity);
  // isFetching covers a focus-change/lens-switch re-query while held data is
  // shown; isPending is the initial fetch. Either is a loading state for the
  // scene on a focus change.
  const loading =
    normalizedScope !== null &&
    (dashboardState.isPending ||
      dashboardState.isFetching ||
      slice.isPending ||
      slice.isFetching);
  return deriveSalienceSliceView(lens, slice.data, slice.error, loading);
}

// --- semantic embeddings (graph-semantic-embeddings ADR) ---------------------
//
// `GET /graph/embeddings` is the dedicated bounded embedding read. It is fetched
// LAZILY only on entering semantic mode (the `enabled` gate, ADR D2) and cached
// per generation (the watcher's gap-driven invalidation re-fetches on a
// generation bump, ADR D8). The scene is a dumb consumer: it reads the
// interpreted view below, never `engineClient.graphEmbeddings` or the raw `tiers`
// block. Semantic availability is read from the `tiers` block (ADR D7 /
// degradation-is-read-from-tiers), with FRESH error tiers winning over a stale
// held-success block, never from a bare fetch rejection — so the scene draws the
// honest fallback ring rather than flapping offline on a transport blip.

/** The interpreted semantic-embeddings view the scene consumes: loading /
 *  unavailable / available / the embeddings keyed by node id. `unavailable` is a
 *  DESIGNED state (rag/Qdrant down → the semantic tier reports unavailable), never
 *  an anonymous error; the scene rings every node in the honest fallback. */
export interface SemanticEmbeddingsView {
  /** The embedding read is in flight with no held vectors. */
  loading: boolean;
  /**
   * Designed degradation: the semantic tier is unavailable (rag/Qdrant down).
   * Read from the served `tiers` block (success OR a tiers-bearing error
   * envelope, fresh error winning), NEVER from a bare transport fault and NEVER
   * inferred from an empty embeddings array. When true the scene draws the
   * fallback ring as honest absence (the designed Held state).
   */
  unavailable: boolean;
  /**
   * Meaning availability (graph-node-representation ADR D2): the mode is real and
   * ready to ship ONLY when BOTH the embedding-presence floor is met AND the
   * `tiers` search/semantic tier reports available. An empty array with the tier
   * UP is NOT `unavailable` (held is read from tiers alone) — it is simply not yet
   * `available` (the presence floor is unmet). This is the positive availability
   * gate; `unavailable` is the negative (held) one, and they are distinct.
   */
  available: boolean;
  /** The number of served nodes carrying a real vector (the presence count the
   *  availability floor reads). The fraction-of-node-set floor is enforced in the
   *  scene gate where the full node set is known; here the stores layer reads the
   *  count the response actually carried. */
  embeddingCount: number;
  /** The served vectors keyed by node id — the scene merges these onto its nodes
   *  for the UMAP projection. Empty while loading/unavailable. */
  embeddings: Map<string, number[]>;
  /** The graph generation the held vectors were read at (the cache key); 0 when
   *  none held yet. */
  generation: number;
}

const SEMANTIC_TIER = "semantic";

/**
 * The minimum count of served vectors for the stores-layer embedding-presence
 * floor (graph-node-representation ADR D2). At least this many nodes must carry a
 * real vector before Meaning is `available` — so the mode never reports ready on a
 * path that delivered no embeddings (the unserved-embedding blind spot). This is a
 * POSITIVE availability floor, NOT a held trigger: a response below it with the
 * tier UP is "not yet available", never "unavailable" (held is read from `tiers`
 * alone). The fraction-of-node-set floor (`SEMANTIC_GATE_DATA_PRESENCE_MIN`) is
 * enforced in the scene gate where the full served node set is in hand.
 */
export const MEANING_EMBEDDING_PRESENCE_FLOOR = 1;

export interface GraphEmbeddingsRequestIdentity {
  scope: string | null;
  lens: SalienceLens;
  focus: string | null;
}

export const normalizeGraphEmbeddingsScope = normalizeGraphSliceScope;

export function normalizeGraphEmbeddingsRequestIdentity(
  scope: unknown,
  lens: unknown,
  focus: unknown,
): GraphEmbeddingsRequestIdentity {
  return {
    scope: normalizeGraphEmbeddingsScope(scope),
    lens: normalizeDashboardSalienceLens(lens),
    focus: normalizeNodeId(focus),
  };
}

/**
 * Derive the semantic-embeddings view from the embedding query's data + error +
 * pending flags, reading the `semantic` tier ONLY here in the stores layer so the
 * scene consumes interpreted truth, never the raw `tiers` block.
 *
 * Held (`unavailable`) is read from the `tiers` block ALONE (success block, or a
 * tiers-bearing error envelope with FRESH error tiers winning via `tiersFromQuery`
 * — degradation-is-read-from-tiers-not-guessed-from-errors): a served block
 * marking `semantic` unavailable degrades; a tiers-less transport fault is NOT
 * rendered as unavailable here (that is the query's error state), and an empty
 * embeddings array is NEVER read as held.
 *
 * Available (Meaning ships, ADR D2) requires BOTH the embedding-presence floor
 * (`MEANING_EMBEDDING_PRESENCE_FLOOR` served vectors) AND the `semantic` tier
 * reporting available — so the mode reports ready only on a path that actually
 * delivered embeddings AND whose backend tier is up. The embeddings are keyed by
 * node id for the scene's per-node merge.
 */
export function deriveSemanticEmbeddingsView(
  data: EmbeddingsResponse | undefined,
  error: unknown,
  loading: boolean,
  enabled: boolean,
): SemanticEmbeddingsView {
  if (!enabled) {
    return {
      loading: false,
      unavailable: false,
      available: false,
      embeddingCount: 0,
      embeddings: new Map(),
      generation: 0,
    };
  }
  const tiers = tiersFromQuery({ data, error });
  const availability = readTierAvailability(tiers, [SEMANTIC_TIER]);
  const semantic = tiers?.[SEMANTIC_TIER];
  // Held is read from the tiers block ALONE: an explicit available:false OR an
  // absent semantic tier in a served block marks the tier down. A tiers-less
  // transport fault and an empty array are NOT held.
  const unavailable = tiers !== undefined && availability.degraded;
  // The tier is affirmatively up only when the block reports it available:true.
  // A tiers-less transport fault and a degraded served block cannot satisfy the
  // positive availability gate.
  const tierUp =
    tiers !== undefined && !availability.degraded && semantic?.available === true;
  const embeddings = new Map<string, number[]>();
  if (!unavailable && data) {
    for (const e of data.embeddings) embeddings.set(e.node_id, e.vector);
  }
  const embeddingCount = embeddings.size;
  const presenceFloorMet = embeddingCount >= MEANING_EMBEDDING_PRESENCE_FLOOR;
  const available = tierUp && presenceFloorMet;
  return {
    loading,
    unavailable,
    available,
    embeddingCount,
    embeddings,
    generation: data?.generation ?? 0,
  };
}

/**
 * Stores hook: the lazy per-generation semantic embedding read for the active
 * scope, enabled ONLY when semantic mode is entered (`enabled`). Returns the
 * interpreted view (loading / unavailable from tiers / the node-id-keyed
 * vectors) so the scene consumes derived truth instead of fetching itself
 * (dashboard-layer-ownership). The lens + focus align the embedding set with the
 * constellation's served node set. `retry: false` so a rag-down read surfaces
 * immediately as the designed fallback state rather than after backoff.
 */
export function useGraphEmbeddings(
  scope: unknown,
  enabled: boolean,
  lens?: unknown,
  focus?: unknown,
): SemanticEmbeddingsView {
  const request = normalizeGraphEmbeddingsRequestIdentity(scope, lens, focus);
  const active = request.scope !== null && enabled;
  const query = useQuery({
    queryKey: engineKeys.graphEmbeddings(
      request.scope ?? "",
      request.lens,
      request.focus,
    ),
    queryFn: () =>
      engineClient.graphEmbeddings({
        scope: request.scope!,
        lens: request.lens,
        focus: request.focus,
      }),
    enabled: active,
    retry: false,
  });
  return deriveSemanticEmbeddingsView(
    query.data,
    query.error ?? null,
    active && query.isPending,
    active,
  );
}

/**
 * The graph slice's loading + degradation truth, derived inside the stores layer
 * so chrome (the nav toolbar's granularity descent) never reads the raw `tiers`
 * block (dashboard-layer-ownership / nav-controls ADR "States"). Contract §2: a
 * tier marked `available:false` OR absent from the served block is a designed
 * degraded state. The reasons travel through both the success envelope
 * (`data.tiers`) and the error envelope (`EngineError.tiers`, transport-preserved)
 * so a backend-down condition surfaces as designed degradation, never a bare
 * error. `loading` is the query's in-flight state for the affected slice. The nav
 * toolbar consumes this, never `slice.data.tiers`.
 */
export interface GraphSliceAvailability extends TierAvailability {
  /** The slice query is in flight (no held data yet). */
  loading: boolean;
  /** A re-query is in flight WHILE a previous slice is held on screen
   *  (`keepPreviousData`): the canvas renders this as a non-blocking corner
   *  refresh banner, never a blanking loading card (universal-data-loading
   *  ADR D2). */
  refreshing: boolean;
}

type GraphSliceAvailabilitySource = Pick<
  UseQueryResult<GraphSlice>,
  "data" | "error" | "isPending" | "isFetching"
>;

export function deriveGraphSliceAvailability(
  tiers: TiersBlock | undefined,
  loading: boolean,
  refreshing = false,
): GraphSliceAvailability {
  return { loading, refreshing, ...readTierAvailability(tiers, CANONICAL_TIERS) };
}

/**
 * Stores hook: the graph slice's loading + degradation truth for the active
 * scope and granularity, read through the wire client so the nav toolbar
 * consumes derived truth instead of the raw `tiers` block. Mirrors
 * `useVaultTreeAvailability`. The toolbar passes the same (scope, granularity)
 * it renders so the descent reflects the slice it is steering.
 */
export function useGraphSliceAvailability(
  slice: GraphSliceAvailabilitySource | null,
  active = true,
): GraphSliceAvailability {
  // Availability is a projection over the already-held canonical graph slice.
  // It must not issue an unfiltered /graph/query just to read the tiers block:
  // that second request can drift from the Stage's filter/lens/date identity and
  // duplicates the graph payload.
  return deriveGraphSliceAvailability(
    slice ? tiersFromQuery(slice) : undefined,
    active && Boolean(slice?.isPending),
    // Refreshing = a re-query behind a HELD slice (fetching, not the initial
    // pending, data present) — the keepPreviousData window the canvas must
    // signal without blanking (universal-data-loading ADR D2).
    active &&
      Boolean(slice?.isFetching) &&
      !slice?.isPending &&
      slice?.data !== undefined,
  );
}

/**
 * Whether an id addresses a REAL graph node the `/nodes/{id}` family can resolve.
 * Constellation FEATURE nodes are SYNTHESIZED aggregates (id `feature:<tag>`), not
 * stored graph nodes, so the engine 404s `/nodes/feature:…`, `…/evidence`, and
 * `…/neighbors`. The feature node's data (member_count, degree, the features it
 * links to via meta_edges) already rides the graph slice, so the chrome must NOT
 * fire a doc-detail fetch for one: gating these queries here stops the 404 storm
 * on the DEFAULT constellation view — and the false `degraded` policy trips those
 * 404s caused — without changing what the consumers render (they already coped
 * with absent detail). Every non-feature id (doc:, and any other real node kind)
 * stays addressable.
 */
export interface NodeScopedRequestIdentity {
  scope: string | null;
  nodeId: string | null;
  depth: number;
}

export const normalizeNodeScopedScope = normalizeGraphSliceScope;

export function normalizeNodeNeighborDepth(depth: unknown): number {
  return typeof depth === "number" && Number.isFinite(depth) && depth > 0
    ? Math.trunc(depth)
    : 1;
}

export function normalizeNodeScopedRequestIdentity(
  scope: unknown,
  nodeId: unknown,
  depth: unknown = 1,
): NodeScopedRequestIdentity {
  return {
    scope: normalizeNodeScopedScope(scope),
    nodeId: normalizeNodeId(nodeId),
    depth: normalizeNodeNeighborDepth(depth),
  };
}

export function isAddressableNode(id: unknown): id is string {
  const nodeId = normalizeNodeId(id);
  return nodeId !== null && featureTagFromNodeId(nodeId) === null;
}

export function useNodeDetail(id: unknown, scope: unknown) {
  const request = normalizeNodeScopedRequestIdentity(scope, id);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.node(request.scope ?? "", request.nodeId ?? ""),
    queryFn: () => engineClient.node(request.nodeId!, request.scope!),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export type NodeDetailSurfaceState = "idle" | "loading" | "unavailable" | "ready";

export interface NodeDetailView {
  state: NodeDetailSurfaceState;
  detail: NodeDetail | null;
  node: EngineNode | null;
}

export function deriveNodeDetailView(
  data: NodeDetail | undefined,
  loading: boolean,
  errored: boolean,
  enabled: boolean,
): NodeDetailView {
  if (!enabled) return { state: "idle", detail: null, node: null };
  if (loading) return { state: "loading", detail: null, node: null };
  if (errored || !data?.node) {
    return { state: "unavailable", detail: null, node: null };
  }
  return { state: "ready", detail: data, node: data.node };
}

/**
 * Stores selector for node-detail consumers. The inspector and node interiors
 * render a designed state from this view instead of branching on raw query flags
 * or re-guarding the possibly-missing `node` payload themselves.
 */
export function useNodeDetailView(id: unknown, scope: unknown): NodeDetailView {
  const request = normalizeNodeScopedRequestIdentity(scope, id);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useNodeDetail(request.nodeId, request.scope);
  return deriveNodeDetailView(
    query.data,
    enabled && query.isPending,
    query.isError,
    enabled,
  );
}

/**
 * Resolve a node's IDENTITY from the IN-MEMORY active stage graph slice — the
 * slice the Stage already holds — instead of the `/nodes/{id}` detail family.
 * Constellation FEATURE nodes (id `feature:<tag>`) are synthesized aggregates the
 * detail route 404s (see `isAddressableNode`), so `useNodeDetailView` returns a
 * null node for them; their identity (id, kind, title, member_count) nonetheless
 * already rides the graph slice. This selector reconstructs the SAME cached slice
 * query the Stage issues (a cache hit — never a new fetch; TanStack dedupes on the
 * shared key) and finds the node by id, so consumers like the hover card can show
 * a feature node's identity without a doc-detail round-trip. Returns the raw slice
 * node reference (stable between fetches) memoized on (nodeId, slice.data) per
 * stable-selectors. Addressable doc nodes also resolve here, but their richer
 * detail/evidence is sourced from the detail route by the caller.
 */
export function useGraphNodeFromActiveSlice(
  id: unknown,
  scope: unknown,
): EngineNode | null {
  const nodeId = normalizeNodeId(id);
  const { graphQuery } = useDashboardStageSceneView(scope);
  const slice = useGraphSlice(
    graphQuery?.scope ?? null,
    graphQuery?.filter,
    graphQuery?.asOf,
    graphQuery?.granularity,
    graphQuery?.lens,
    graphQuery?.focus,
  );
  const nodes = slice.data?.nodes;
  return useMemo(() => {
    if (nodeId === null || !nodes) return null;
    return nodes.find((n) => n.id === nodeId) ?? null;
  }, [nodeId, nodes]);
}

/** The lifecycle axis: every opened feature has the same internal grammar. */
export const FEATURE_LIFECYCLE_AXIS = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
] as const;

export type FeatureLifecycleDocType = (typeof FEATURE_LIFECYCLE_AXIS)[number];

export function featureLifecycleRank(docType: string): number {
  const i = (FEATURE_LIFECYCLE_AXIS as readonly string[]).indexOf(docType);
  return i === -1 ? FEATURE_LIFECYCLE_AXIS.length : i;
}

/** Resolve only engine-served document types that belong on the lifecycle axis. */
export function featureLifecycleDocType(
  node: EngineNode,
): FeatureLifecycleDocType | null {
  const docType = node.doc_type;
  return typeof docType === "string" &&
    featureLifecycleRank(docType) < FEATURE_LIFECYCLE_AXIS.length
    ? (docType as FeatureLifecycleDocType)
    : null;
}

/** Order a feature's documents along the lifecycle axis, stable by title. */
export function arrangeFeatureLifecycleAxis(
  nodes: readonly EngineNode[],
  locale: string,
): EngineNode[] {
  return nodes
    .flatMap((node) => {
      const docType = featureLifecycleDocType(node);
      return docType === null ? [] : [{ docType, node }];
    })
    .sort(
      (a, b) =>
        featureLifecycleRank(a.docType) - featureLifecycleRank(b.docType) ||
        compareAuthoredDisplayText(
          locale,
          authoredDisplayText(a.node.title ?? a.node.id),
          authoredDisplayText(b.node.title ?? b.node.id),
        ),
    )
    .map(({ node }) => node);
}

export type FeatureLifecycleState = "loading" | "ready";

export interface FeatureLifecycleView {
  state: FeatureLifecycleState;
  docs: EngineNode[];
}

export function deriveFeatureLifecycleView(
  nodes: readonly EngineNode[] | undefined,
  locale: string,
): FeatureLifecycleView {
  if (!nodes) return { state: "loading", docs: [] };
  return { state: "ready", docs: arrangeFeatureLifecycleAxis(nodes, locale) };
}

/**
 * Stores selector for a synthesized feature island's bounded document lifecycle.
 * Feature nodes are not addressable by `/nodes/{id}`, so the island consumes this
 * feature-filtered document slice instead of minting graph-query identity locally.
 */
export function useFeatureLifecycleView(
  id: string,
  scope: string | null,
  locale: string,
): FeatureLifecycleView {
  const tag = featureTagFromNodeId(id);
  const slice = useGraphSlice(
    tag === null ? null : scope,
    tag === null ? undefined : { feature_tags: [tag] },
    undefined,
    "document",
  );
  return deriveFeatureLifecycleView(slice.data?.nodes, locale);
}

export function useNodeNeighbors(id: unknown, scope: unknown, depth: unknown = 1) {
  const request = normalizeNodeScopedRequestIdentity(scope, id, depth);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.neighbors(
      request.scope ?? "",
      request.nodeId ?? "",
      request.depth,
    ),
    queryFn: () =>
      engineClient.nodeNeighbors(request.nodeId!, {
        scope: request.scope!,
        depth: request.depth,
      }),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

// The edge-tier bucketing order for the inspector's neighbor list. The engine
// never mints a semantic graph edge (ADR D3.5), so semantic is not an edge tier.
export const INSPECTOR_EDGE_TIER_ORDER = [
  "declared",
  "structural",
  "temporal",
] as const;

export interface InspectorNeighborTierView {
  tiers: Map<EngineEdge["tier"], EngineEdge[]>;
  tierKeys: EngineEdge["tier"][];
}

export function deriveInspectorNeighborTierView(
  edges: readonly EngineEdge[] | undefined,
): InspectorNeighborTierView {
  const tiers = new Map<EngineEdge["tier"], EngineEdge[]>();
  for (const tier of INSPECTOR_EDGE_TIER_ORDER) {
    const members = (edges ?? []).filter((edge) => edge.tier === tier && !edge.meta);
    if (members.length > 0) tiers.set(tier, members);
  }
  return { tiers, tierKeys: [...tiers.keys()] };
}

export function useInspectorNeighborTierView(
  id: string | null,
  scope: string | null,
): InspectorNeighborTierView {
  const neighbors = useNodeNeighbors(id, scope);
  return useMemo(
    () => deriveInspectorNeighborTierView(neighbors.data?.edges),
    [neighbors.data?.edges],
  );
}
