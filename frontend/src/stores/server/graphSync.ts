// Live graph sync (ADR D3 / constellation-live-delta S06): subscribe the live
// `graph` SSE channel, drive targeted cache invalidation of the constellation,
// and — when keyframeSeq is supplied — extract feature-granularity deltas for
// direct `apply-deltas` scene splice (the no-refetch delta-apply path). Gap
// detection falls back to invalidation. Connection signal drives the live-state
// degradation truth.

import { useEffect, useMemo, useRef } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import type { QueryClient } from "@tanstack/react-query";

import { debounce, throttleTrailing, type Debounced } from "../../platform/timing";
import {
  engineClient,
  type GraphDeltaEntry,
  type GraphFilter,
  type GraphSlice,
  type GraphSliceDeltaResponse,
  type SalienceLens,
} from "./engine";
import { advanceLiveSeq, setLiveStreamConnected } from "./liveStatus";
import type { RowReconcileAction, StreamChunk } from "./queries";
import {
  applyRowReconcile,
  engineKeys,
  engineStreamOptions,
  invalidateGraphGenerationReads,
  invalidateGraphGenerationSiblingReads,
  tiersReportBuilding,
} from "./queries";
// Source scope normalization DIRECTLY (not via the `./queries` barrel): graph.ts imports
// this module for the building poll, so a barrel-aliased `normalizeGraphSliceScope`
// would snapshot `undefined` at init under the graph.ts↔graphSync cycle. The
// scopeIdentity module is cycle-free, so this alias is always defined. `tiersReportBuilding`
// stays a barrel import — it is only read at CALL time (live binding), never at init.
import { normalizeStoreScope } from "./scopeIdentity";

const normalizeGraphSliceScope = normalizeStoreScope;

/** Collapse a delta burst into one trailing constellation refetch (P-HIGH-1). */
const GRAPH_INVALIDATE_DEBOUNCE_MS = 150;
export const GRAPH_FEATURE_DELTAS_CAP = 128;
export const GRAPH_LIVE_GAP_COUNT_MAX = 1_000_000;

/** The D1 refetch-storm floor (graph-slice-delta ADR): under sustained corpus churn,
 *  the FALLBACK full-sweep is spaced at least this far apart (trailing-edge, so the
 *  final state always lands). ~15s balances staleness against the storm ceiling; the
 *  D4 delta path is exempt (it is cheap by construction). */
export const GRAPH_REFETCH_COOLDOWN_MS = 15_000;

/** Bounded poll cadence (ms) while a held slice's tiers report a tier mid-build
 *  (graph-slice-delta ADR): re-read the tiers through the DELTA path (sub-KB) on this
 *  interval instead of the old full-slice `refetchInterval` that perpetually re-pulled
 *  ~3.5 MB on a corpus under continuous edit. Stops the moment the tier flips ready. */
export const GRAPH_BUILDING_REFETCH_MS = 4_000;

/** Merge an id-keyed graph-slice delta onto a held slice (graph-slice-delta ADR D4):
 *  drop `removed`, replace/insert `changed`, at the new generation. The scene keys by
 *  node/edge id (object constancy via `prewarmReflow` on the existing set-data path),
 *  so within-slice order is irrelevant — survivors keep their order and changed rows
 *  append. `slice_token`, `filter`, and `lens` ride through from the held slice (same
 *  params), so the NEXT delta reuses the token at the new generation. */
export function mergeGraphSliceDelta(
  held: GraphSlice,
  delta: GraphSliceDeltaResponse,
): GraphSlice {
  const changedNodes = delta.changed_nodes ?? [];
  const changedEdges = delta.changed_edges ?? [];
  const removedNodeIds = new Set(delta.removed_node_ids ?? []);
  const removedEdgeIds = new Set(delta.removed_edge_ids ?? []);
  const changedNodeIds = new Set(changedNodes.map((n) => n.id));
  const changedEdgeIds = new Set(changedEdges.map((e) => e.id));
  return {
    ...held,
    nodes: [
      ...held.nodes.filter(
        (n) => !removedNodeIds.has(n.id) && !changedNodeIds.has(n.id),
      ),
      ...changedNodes,
    ],
    edges: [
      ...held.edges.filter(
        (e) => !removedEdgeIds.has(e.id) && !changedEdgeIds.has(e.id),
      ),
      ...changedEdges,
    ],
    generation: delta.generation,
    truncated: delta.truncated ?? null,
    tiers: delta.tiers,
  };
}

/** The reconcile decision (ADR D4), PURE so every branch is deterministic: `patch` a
 *  held slice from the delta; `full-drain` on `full_required` OR a delta touching more
 *  than half the held NODE set (guard #3 — a large delta is not worth patching);
 *  `noop` when the generation is unchanged AND the building-tier state is unchanged.
 *  The same-generation TIERS-REFRESH branch preserves the old full-`refetchInterval`'s
 *  unconditional banner-flip: the tiers block is a fresh per-response snapshot, so if a
 *  fold ever clears the "building" sentinel WITHOUT bumping the generation, the held
 *  slice's tiers are still refreshed (sub-KB) so the "Still loading links…" banner
 *  clears — rather than sticking until an unrelated refetch. */
export function planGraphSliceReconcile(
  held: GraphSlice,
  delta: GraphSliceDeltaResponse,
): RowReconcileAction<GraphSlice> {
  if (delta.full_required) return { kind: "full-drain" };
  if (delta.generation === held.generation) {
    if (tiersReportBuilding(held.tiers) && !tiersReportBuilding(delta.tiers)) {
      return { kind: "patch", value: { ...held, tiers: delta.tiers } };
    }
    return { kind: "noop" };
  }
  const touched =
    (delta.changed_nodes?.length ?? 0) + (delta.removed_node_ids?.length ?? 0);
  if (touched > held.nodes.length / 2) return { kind: "full-drain" };
  return { kind: "patch", value: mergeGraphSliceDelta(held, delta) };
}

/**
 * Reconcile every ACTIVE present-view document graph slice for `scope` from the
 * generation-keyed delta (ADR D4), patching each via the SHARED identity guard
 * (`applyRowReconcile`). The delta body is reconstructed from the query key (the
 * request identity, by TanStack law: `[…, "graph", scope, filterKey, asOf,
 * granularity, lens, focus, corpus]`) plus the held slice's echoed `filter` and its
 * opaque `slice_token`. A document-vault observer with no baseline, or any
 * `full_required`/error/oversized delta, falls back to the D1-floored `sweep`.
 * Feature/code/as-of observers are DELIBERATELY skipped, not unhandled: the feature
 * constellation stays fresh through its OWN feature-delta splice path
 * (`apply-deltas`, zero refetch), code granularity is lazy, and as-of reads are
 * immutable per sha. A document delta does not stale any of them, so do NOT re-add
 * feature/code handling here — that would double-refresh the feature slice this
 * document path never touches. Fire-and-forget.
 */
export async function reconcileGraphSlice(
  queryClient: QueryClient,
  scope: string,
  sweep: (scope: string) => void,
): Promise<void> {
  const observers = queryClient
    .getQueryCache()
    .findAll({ queryKey: [...engineKeys.all, "graph", scope], type: "active" });
  let needsSweep = false;
  for (const observer of observers) {
    const key = observer.queryKey;
    // key[4]=asOf key[5]=granularity key[6]=lens key[7]=focus key[8]=corpus.
    // Only the present-view document vault slice is delta-eligible.
    if (key[4] !== "live" || key[5] !== "document" || key[8] !== "vault") continue;
    const held = observer.state.data as GraphSlice | undefined;
    if (
      held === undefined ||
      typeof held.generation !== "number" ||
      typeof held.slice_token !== "string"
    ) {
      // A document-vault observer with no delta baseline must re-drain.
      needsSweep = true;
      continue;
    }
    const body = {
      scope,
      filter: held.filter as GraphFilter | undefined,
      granularity: "document" as const,
      lens: (typeof key[6] === "string" ? key[6] : "status") as SalienceLens,
      focus: key[7] === "none" ? null : (key[7] as string),
      corpus: "vault" as const,
    };
    let delta: GraphSliceDeltaResponse;
    try {
      delta = await engineClient.graphSliceDelta(
        body,
        held.generation,
        held.slice_token,
      );
    } catch {
      needsSweep = true;
      continue;
    }
    const action = planGraphSliceReconcile(held, delta);
    if (action.kind === "full-drain") {
      needsSweep = true;
      continue;
    }
    applyRowReconcile(queryClient, key, held, action, () => {
      needsSweep = true;
    });
  }
  if (needsSweep) sweep(scope);
}

/** The D1 graph-only floored fallback sweep (graph-slice-delta ADR), as a reusable
 *  hook: a memoized trailing-throttled invalidation of ONLY the `graph` subtree for a
 *  scope, spaced at least `GRAPH_REFETCH_COOLDOWN_MS` apart so a corpus under sustained
 *  edit cannot storm full ~3.5 MB refetches. Cancels its pending trailing call on
 *  teardown. Shared by the live-sync document-delta fallback and the building poll. */
function useGraphSliceFloorSweep(): Debounced<[string]> {
  const queryClient = useQueryClient();
  const sweep = useMemo(
    () =>
      throttleTrailing((scopeArg: string) => {
        void queryClient.invalidateQueries({
          queryKey: [...engineKeys.all, "graph", scopeArg],
          exact: false,
        });
      }, GRAPH_REFETCH_COOLDOWN_MS),
    [queryClient],
  );
  useEffect(() => () => sweep.cancel(), [sweep]);
  return sweep;
}

/**
 * Building-tier poll (graph-slice-delta ADR): while a held graph slice reports a tier
 * mid-build, re-read the tiers on the `GRAPH_BUILDING_REFETCH_MS` cadence through the
 * SAME graph-slice DELTA path (`reconcileGraphSlice`) — a sub-KB round-trip whose fresh
 * tiers flip the "Still loading links…" banner and whose fold-completion edge splice
 * arrives as part of the patch. This REPLACES `useGraphSlice`'s old full-slice
 * `refetchInterval`, which perpetually re-pulled the ~3.5 MB slice on a corpus under
 * continuous edit (the declared fold never settles, so the predicate never cleared).
 * `deltaEligible` mirrors `reconcileGraphSlice`'s guard #2 (present-view document-vault
 * only): an eligible building slice re-reads via the sub-KB delta; a non-eligible one
 * (the feature constellation, the code corpus, an as-of read) degrades through the
 * graph-only floored sweep directly — the D1 floor turns its full re-pull into at most
 * one per `GRAPH_REFETCH_COOLDOWN_MS`. (`reconcileGraphSlice` intentionally SKIPS
 * non-eligible observers without sweeping — a document delta must not stale the feature
 * constellation — so the poll must route them to the sweep itself.) The poll is bounded
 * and cancels on unmount, and stops the instant `isBuilding` flips false (the fold
 * reached ready), re-arming only if a later build reopens.
 */
export function useGraphSliceBuildingReconcilePoll(
  scope: unknown,
  isBuilding: boolean,
  deltaEligible: boolean,
): void {
  const queryClient = useQueryClient();
  const normalizedScope = normalizeGraphSliceScope(scope);
  const floorSweep = useGraphSliceFloorSweep();
  useEffect(() => {
    if (!isBuilding || normalizedScope === null) return;
    const timer = setInterval(() => {
      if (deltaEligible) {
        void reconcileGraphSlice(queryClient, normalizedScope, floorSweep);
      } else {
        floorSweep(normalizedScope);
      }
    }, GRAPH_BUILDING_REFETCH_MS);
    return () => clearInterval(timer);
  }, [isBuilding, normalizedScope, deltaEligible, queryClient, floorSweep]);
}

export function normalizeGraphFeatureDeltas(deltas: unknown): GraphDeltaEntry[] {
  if (!Array.isArray(deltas)) return [];
  let changed = deltas.length > GRAPH_FEATURE_DELTAS_CAP;
  const start = Math.max(0, deltas.length - GRAPH_FEATURE_DELTAS_CAP);
  const normalized: GraphDeltaEntry[] = [];
  for (let index = start; index < deltas.length; index += 1) {
    const delta = deltas[index];
    if (
      delta?.granularity === "feature" &&
      typeof delta.seq === "number" &&
      Number.isFinite(delta.seq)
    ) {
      normalized.push(delta);
    } else {
      changed = true;
    }
  }
  if (!changed && normalized.length === deltas.length) {
    return deltas as GraphDeltaEntry[];
  }
  return normalized.length > GRAPH_FEATURE_DELTAS_CAP
    ? normalized.slice(normalized.length - GRAPH_FEATURE_DELTAS_CAP)
    : normalized;
}

export function normalizeGraphLiveGapCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.min(GRAPH_LIVE_GAP_COUNT_MAX, Math.trunc(value))
    : 0;
}

export const normalizeGraphLiveScope = normalizeGraphSliceScope;

export function normalizeGraphLiveKeyframeSeq(seq: unknown): number | null {
  return typeof seq === "number" && Number.isFinite(seq) ? seq : null;
}

export function normalizeGraphLiveEnabled(enabled: unknown): boolean {
  return enabled === true;
}

export interface GraphLiveDeltaState {
  scope: string | null;
  keyframeSeq: number | null;
  featureDeltas: GraphDeltaEntry[];
  gapCount: number;
  setLifecycle: (scope: unknown, keyframeSeq: unknown) => void;
  setFeatureDeltas: (deltas: unknown) => void;
  clearFeatureDeltas: () => void;
  incrementGap: () => void;
}

export const useGraphLiveDeltaStore = create<GraphLiveDeltaState>((set) => ({
  scope: null,
  keyframeSeq: null,
  featureDeltas: [],
  gapCount: 0,
  setLifecycle: (scope, keyframeSeq) => {
    const normalizedScope = normalizeGraphLiveScope(scope);
    const normalizedKeyframeSeq =
      normalizedScope === null ? null : normalizeGraphLiveKeyframeSeq(keyframeSeq);
    set((state) =>
      state.scope === normalizedScope && state.keyframeSeq === normalizedKeyframeSeq
        ? state
        : {
            scope: normalizedScope,
            keyframeSeq: normalizedKeyframeSeq,
            featureDeltas: [],
            gapCount: 0,
          },
    );
  },
  setFeatureDeltas: (featureDeltas) =>
    set({ featureDeltas: [...normalizeGraphFeatureDeltas(featureDeltas)] }),
  clearFeatureDeltas: () => set({ featureDeltas: [] }),
  incrementGap: () =>
    set((state) => ({
      featureDeltas: [],
      gapCount: normalizeGraphLiveGapCount(state.gapCount + 1),
    })),
}));

const EMPTY_GRAPH_LIVE_DELTA_VIEW = {
  featureDeltas: [] as GraphDeltaEntry[],
  gapCount: 0,
};

export function resetGraphLiveDeltaState(): void {
  useGraphLiveDeltaStore.setState({
    scope: null,
    keyframeSeq: null,
    featureDeltas: [],
    gapCount: 0,
  });
}

export function useGraphLiveDeltaView(
  scope: unknown,
  keyframeSeq: unknown,
): { featureDeltas: GraphDeltaEntry[]; gapCount: number } {
  const normalizedScope = normalizeGraphLiveScope(scope);
  const normalizedKeyframeSeq =
    normalizedScope === null ? null : normalizeGraphLiveKeyframeSeq(keyframeSeq);
  // Select the RAW stable slices; derive in useMemo (stable-selectors) — never
  // inside the selector, even under useShallow. `normalize*` here are the
  // ref-preserving normalizers (GIR-009), so the memo output stays ref-stable.
  const stateScope = useGraphLiveDeltaStore((state) => state.scope);
  const stateKeyframeSeq = useGraphLiveDeltaStore((state) => state.keyframeSeq);
  const featureDeltas = useGraphLiveDeltaStore((state) => state.featureDeltas);
  const gapCount = useGraphLiveDeltaStore((state) => state.gapCount);
  return useMemo(
    () =>
      stateScope === normalizedScope && stateKeyframeSeq === normalizedKeyframeSeq
        ? {
            featureDeltas: normalizeGraphFeatureDeltas(featureDeltas),
            gapCount: normalizeGraphLiveGapCount(gapCount),
          }
        : EMPTY_GRAPH_LIVE_DELTA_VIEW,
    [
      stateScope,
      stateKeyframeSeq,
      featureDeltas,
      gapCount,
      normalizedScope,
      normalizedKeyframeSeq,
    ],
  );
}

/** Highest seq across a batch of stream chunks, or null if none carry one. */
export function maxSeq(chunks: readonly StreamChunk[] | undefined): number | null {
  if (!chunks || chunks.length === 0) return null;
  let max = -1;
  for (const chunk of chunks) {
    const seq = (chunk.data as { seq?: unknown }).seq;
    if (typeof seq === "number" && seq > max) max = seq;
  }
  return max >= 0 ? max : null;
}

/**
 * Drive LIVE-mode reactivity from the `graph` stream.
 *
 * Mount in Stage in LIVE mode only (the time-travel driver owns the scene
 * otherwise). When `keyframeSeq` is supplied (constellation-live-delta S06),
 * the subscription anchors at `since=keyframeSeq` so only new deltas arrive;
 * the hook extracts `granularity=feature` entries and returns them as
 * `featureDeltas` for direct `apply-deltas` splicing. A seq discontinuity
 * increments `gapCount` and triggers the same stores-owned targeted
 * re-keyframe invalidation as document-granularity deltas (the resilient
 * floor). Connection state updates the
 * live-connection degradation slice.
 *
 * Return shape:
 * - `featureDeltas`: the freshest batch of feature-granularity entries; a new
 *   array reference on every batch so Stage's `useEffect` fires exactly once
 *   per arrival. Empty on reset or when only document deltas arrived.
 * - `gapCount`: starts at 0, increments once per detected seq gap for tests and
 *   observability; the hook itself owns the re-keyframe invalidation.
 */
export function useGraphLiveSync(
  scope: unknown,
  enabled: unknown,
  keyframeSeq: unknown = null,
): { featureDeltas: GraphDeltaEntry[]; gapCount: number } {
  const queryClient = useQueryClient();
  const normalizedScope = normalizeGraphLiveScope(scope);
  const normalizedKeyframeSeq =
    normalizedScope === null ? null : normalizeGraphLiveKeyframeSeq(keyframeSeq);
  const active = normalizeGraphLiveEnabled(enabled) && normalizedScope !== null;

  // When a keyframe seq anchor is available, subscribe with `since=` so only
  // deltas after the keyframe arrive. The since value folds into the queryKey
  // (stream-01 adversarial property: different `since` values must not share
  // cached data). Stable during the session — TanStack retries on error ride
  // the same key; the streamReducer dedup handles any replay overlap.
  const sinceArg = normalizedKeyframeSeq === null ? undefined : normalizedKeyframeSeq;
  // Subscribe against THIS scope's own clock (W02.P04.S14 per-scope stream):
  // pass the active scope so `since=` resume stays correct and independent per
  // worktree, and so two scopes' streams never share a cache entry.
  const scopeArg = normalizedScope ?? undefined;
  const stream = useQuery({
    ...engineStreamOptions(["graph"], sinceArg, scopeArg),
    enabled: active,
  });
  const { data: chunks, isError, isSuccess, fetchStatus } = stream;
  const liveDeltas = useGraphLiveDeltaView(normalizedScope, normalizedKeyframeSeq);

  // A gap / re-keyframe stales the WHOLE generation: sweep every graph-derived read
  // (including the graph slice itself) on a trailing debounce so a burst collapses to
  // one refetch instead of one per delta (P-HIGH-1).
  const invalidateConstellation = useMemo(
    () =>
      debounce((scopeArg: string) => {
        invalidateGraphGenerationReads(queryClient, scopeArg);
      }, GRAPH_INVALIDATE_DEBOUNCE_MS),
    [queryClient],
  );
  useEffect(() => () => invalidateConstellation.cancel(), [invalidateConstellation]);

  // A document-granularity delta keeps the open editor, the vault/code tree, the
  // filter facets, and the selected node's projections fresh on an external re-ingest
  // (W03.P04.S10) — on the same trailing debounce — WITHOUT dragging the ~3.5 MB graph
  // slice back over the wire. That slice is delta-patched (D4) below, or drained on
  // its own D1 floor on degradation. Only the graph subtree changes treatment; every
  // sibling's freshness is preserved.
  const refreshGenerationSiblings = useMemo(
    () =>
      debounce((scopeArg: string) => {
        invalidateGraphGenerationSiblingReads(queryClient, scopeArg);
      }, GRAPH_INVALIDATE_DEBOUNCE_MS),
    [queryClient],
  );
  useEffect(
    () => () => refreshGenerationSiblings.cancel(),
    [refreshGenerationSiblings],
  );

  // The D1 floored FALLBACK sweep (graph-slice-delta ADR): when the document-slice
  // delta can't patch, drain ONLY the graph subtree, rate-floored. Shared with the
  // building poll below.
  const graphSliceFloorSweep = useGraphSliceFloorSweep();

  // Connection state -> the live-connection slice. An open or successful stream
  // is connected; an errored stream (StreamLostError) is lost. When inactive we
  // leave the signal untouched (null/last value) - "not expected", not "lost".
  useEffect(() => {
    if (!active) return;
    if (isError) setLiveStreamConnected(false);
    else if (isSuccess || fetchStatus === "fetching") setLiveStreamConnected(true);
  }, [active, isError, isSuccess, fetchStatus]);

  // spliceLive state: the freshest feature-delta batch and a gap counter.
  // Stored centrally so the live graph splice output is a single server-store
  // projection, not hook-local state hidden inside the Stage subscription.
  // How many entries from `chunks[]` we have already processed. The ring-cap
  // (STREAM_RETENTION=256) bounds the array length so this index stays bounded.
  const processedRef = useRef(0);
  // Last seq confirmed gaplessly; seeded from the keyframe anchor so the first
  // delta after the keyframe is not falsely flagged as a gap.
  const lastSeqRef = useRef<number | null>(normalizedKeyframeSeq);

  // Reset on scope or keyframe change (new lifecycle).
  useEffect(() => {
    useGraphLiveDeltaStore
      .getState()
      .setLifecycle(normalizedScope, normalizedKeyframeSeq);
    processedRef.current = 0;
    lastSeqRef.current = normalizedKeyframeSeq;
    // Drop the prior since-keyed stream entry promptly (B7, resource-hardening):
    // each keyframe advance mints a new ["engine","stream","graph",<since>,scope]
    // key; the live subscription has already switched, so the old one is an
    // inactive 256-entry ring waiting out gcTime. The cleanup captures the OLD
    // sinceArg/scopeArg and removes that exact entry on the next change.
    return () => {
      queryClient.removeQueries({
        queryKey: engineKeys.stream(["graph"], sinceArg, scopeArg),
        exact: true,
      });
    };
  }, [normalizedScope, normalizedKeyframeSeq, sinceArg, scopeArg, queryClient]);

  // Process newly arrived chunks: advance lastSeq, extract feature-granularity
  // deltas with gap detection, and trigger debounced invalidation for all.
  useEffect(() => {
    // NB: do NOT early-return on `chunks.length === 0` — a reconnect that resumes
    // to an EMPTY stream (chunks shrank to []) is exactly the engine-restart signal
    // handled below, and must reach the re-keyframe path.
    if (!active || normalizedScope === null || !chunks) return;

    // Stream reconnect: the streamed query's reducer empties `chunks` back to
    // [] on a refetch, so an array shorter than what we have already consumed
    // means the stream reset. Re-consume from the rebuilt head and re-anchor
    // gap detection — else every post-reconnect delta is silently dropped, the
    // invalidation never fires, and the re-keyframe fallback dies (review HIGH-1).
    const wasReconnect = chunks.length < processedRef.current;
    if (wasReconnect) {
      processedRef.current = 0;
      lastSeqRef.current = normalizedKeyframeSeq;
    }

    const newChunks = chunks.slice(processedRef.current);
    if (newChunks.length === 0) {
      // A reconnect that resumes to an EMPTY stream is the signature of an engine
      // RESTART that reset the delta clock (a dev rebuild restarts the engine): the
      // held `since` is now stale/future relative to the new clock, so `/stream`
      // replays nothing and — without this — the graph silently stays stale at the
      // pre-restart state (the load-time artefact). Re-keyframe through the same
      // stores-owned path a gap uses, re-anchoring `since` at the new clock. On a
      // same-clock caught-up reconnect this is a harmless refetch; on a reset it is
      // the fix.
      if (wasReconnect) {
        useGraphLiveDeltaStore.getState().incrementGap();
        invalidateConstellation(normalizedScope);
      }
      return;
    }
    processedRef.current = chunks.length;

    // Advance the global resume point for reconnect anchoring.
    const topSeq = maxSeq(newChunks);
    if (topSeq !== null) advanceLiveSeq(topSeq);

    // Extract feature-granularity deltas with sequential gap detection.
    const batch: GraphDeltaEntry[] = [];
    let gapDetected = false;
    let sawDocumentDelta = false;
    for (const chunk of newChunks) {
      if (chunk.channel !== "graph") continue;
      const entry = chunk.data as GraphDeltaEntry;
      if (entry.granularity !== "feature") {
        sawDocumentDelta = true;
        continue;
      }

      if (
        lastSeqRef.current !== null &&
        typeof entry.seq === "number" &&
        (entry.seq > lastSeqRef.current + 1 || entry.seq < lastSeqRef.current)
      ) {
        // Seq discontinuity: a FORWARD gap (missed deltas) OR a BACKWARD reset (the
        // engine restarted and the delta clock reset to a LOWER seq, so this delta
        // belongs to a new generation the held scene state predates). A backward
        // seq must NOT be silently applied onto the stale graph (mixed-generation
        // edges = the load-time artefact); discard the partial batch and let the
        // stores-owned fallback re-keyframe at the new clock.
        gapDetected = true;
        break;
      }
      if (typeof entry.seq === "number") lastSeqRef.current = entry.seq;
      batch.push(entry);
    }

    if (gapDetected) {
      // Discard the partial batch; the stores-owned fallback will re-keyframe.
      useGraphLiveDeltaStore.getState().incrementGap();
    } else if (batch.length > 0) {
      useGraphLiveDeltaStore
        .getState()
        .setFeatureDeltas(normalizeGraphFeatureDeltas(batch));
    }

    // Realize the no-refetch path. A clean feature-only batch animates via
    // `apply-deltas` with no refetch. A gap forces the resilient re-keyframe floor
    // (the debounced FULL sweep, unchanged). A document-granularity delta (or a chunk
    // with nothing spliceable) refreshes the generation SIBLINGS on the debounce (so
    // the open editor / tree / facets re-read an external re-ingest, W03.P04.S10) and
    // attempts the DOCUMENT-SLICE delta (graph-slice-delta ADR D4) — patching the held
    // ~3.5 MB slice through the existing set-data path — falling back to the D1-floored
    // graph-only drain only when the delta can't apply. The feature constellation is
    // left to its own feature-delta splice; a document delta does not stale it.
    if (gapDetected) {
      invalidateConstellation(normalizedScope);
    } else if (sawDocumentDelta || batch.length === 0) {
      refreshGenerationSiblings(normalizedScope);
      void reconcileGraphSlice(queryClient, normalizedScope, graphSliceFloorSweep);
    }
  }, [
    active,
    normalizedScope,
    chunks,
    normalizedKeyframeSeq,
    invalidateConstellation,
    refreshGenerationSiblings,
    graphSliceFloorSweep,
    queryClient,
  ]);

  return liveDeltas;
}
