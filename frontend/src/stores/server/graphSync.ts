// Live graph sync (ADR D3 / constellation-live-delta S06): subscribe the live
// `graph` SSE channel, drive targeted cache invalidation of the constellation,
// and — when keyframeSeq is supplied — extract feature-granularity deltas for
// direct `apply-deltas` scene splice (the no-refetch delta-apply path). Gap
// detection falls back to invalidation. Connection signal drives the live-state
// degradation truth.

import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { debounce } from "../../platform/timing";
import type { GraphDeltaEntry } from "./engine";
import { useLiveStatusStore } from "./liveStatus";
import type { StreamChunk } from "./queries";
import { engineKeys, engineStreamOptions } from "./queries";

/** Collapse a delta burst into one trailing constellation refetch (P-HIGH-1). */
const GRAPH_INVALIDATE_DEBOUNCE_MS = 150;

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
 * increments `gapCount` so Stage can trigger a targeted `invalidateQueries`
 * re-keyframe (the resilient floor). Document-granularity deltas still drive
 * debounced constellation invalidation. Connection state updates the
 * live-connection degradation slice.
 *
 * Return shape:
 * - `featureDeltas`: the freshest batch of feature-granularity entries; a new
 *   array reference on every batch so Stage's `useEffect` fires exactly once
 *   per arrival. Empty on reset or when only document deltas arrived.
 * - `gapCount`: starts at 0, increments once per detected seq gap. Stage's
 *   `useEffect([gapCount])` fires once per increment and re-keyframes.
 */
export function useGraphLiveSync(
  scope: string | null,
  enabled: boolean,
  keyframeSeq: number | null = null,
): { featureDeltas: GraphDeltaEntry[]; gapCount: number } {
  const queryClient = useQueryClient();
  const active = enabled && scope !== null;

  // When a keyframe seq anchor is available, subscribe with `since=` so only
  // deltas after the keyframe arrive. The since value folds into the queryKey
  // (stream-01 adversarial property: different `since` values must not share
  // cached data). Stable during the session — TanStack retries on error ride
  // the same key; the streamReducer dedup handles any replay overlap.
  const sinceArg = typeof keyframeSeq === "number" ? keyframeSeq : undefined;
  // Subscribe against THIS scope's own clock (W02.P04.S14 per-scope stream):
  // pass the active scope so `since=` resume stays correct and independent per
  // worktree, and so two scopes' streams never share a cache entry.
  const scopeArg = scope ?? undefined;
  const stream = useQuery({
    ...engineStreamOptions(["graph"], sinceArg, scopeArg),
    enabled: active,
  });
  const { data: chunks, isError, isSuccess, fetchStatus } = stream;

  // Debounced, scope-keyed invalidation: a burst of deltas collapses to one
  // trailing constellation refetch instead of one refetch per delta (P-HIGH-1).
  const invalidateConstellation = useMemo(
    () =>
      debounce((scopeArg: string) => {
        void queryClient.invalidateQueries({
          queryKey: [...engineKeys.all, "graph", scopeArg],
          exact: false,
        });
      }, GRAPH_INVALIDATE_DEBOUNCE_MS),
    [queryClient],
  );
  useEffect(() => () => invalidateConstellation.cancel(), [invalidateConstellation]);

  // Connection state -> the live-connection slice. An open or successful stream
  // is connected; an errored stream (StreamLostError) is lost. When inactive we
  // leave the signal untouched (null/last value) - "not expected", not "lost".
  useEffect(() => {
    if (!active) return;
    const { setStreamConnected } = useLiveStatusStore.getState();
    if (isError) setStreamConnected(false);
    else if (isSuccess || fetchStatus === "fetching") setStreamConnected(true);
  }, [active, isError, isSuccess, fetchStatus]);

  // spliceLive state: the freshest feature-delta batch and a gap counter.
  const [featureDeltas, setFeatureDeltas] = useState<GraphDeltaEntry[]>([]);
  const [gapCount, setGapCount] = useState(0);
  // How many entries from `chunks[]` we have already processed. The ring-cap
  // (STREAM_RETENTION=256) bounds the array length so this index stays bounded.
  const processedRef = useRef(0);
  // Last seq confirmed gaplessly; seeded from the keyframe anchor so the first
  // delta after the keyframe is not falsely flagged as a gap.
  const lastSeqRef = useRef<number | null>(keyframeSeq);

  // Reset on scope or keyframe change (new lifecycle).
  useEffect(() => {
    setFeatureDeltas([]);
    processedRef.current = 0;
    lastSeqRef.current = keyframeSeq;
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
  }, [scope, keyframeSeq, sinceArg, scopeArg, queryClient]);

  // Process newly arrived chunks: advance lastSeq, extract feature-granularity
  // deltas with gap detection, and trigger debounced invalidation for all.
  useEffect(() => {
    if (!active || scope === null || !chunks || chunks.length === 0) return;

    // Stream reconnect: the streamed query's reducer empties `chunks` back to
    // [] on a refetch, so an array shorter than what we have already consumed
    // means the stream reset. Re-consume from the rebuilt head and re-anchor
    // gap detection — else every post-reconnect delta is silently dropped, the
    // invalidation never fires, and the re-keyframe fallback dies (review HIGH-1).
    if (chunks.length < processedRef.current) {
      processedRef.current = 0;
      lastSeqRef.current = keyframeSeq;
    }

    const newChunks = chunks.slice(processedRef.current);
    if (newChunks.length === 0) return;
    processedRef.current = chunks.length;

    // Advance the global resume point for reconnect anchoring.
    const topSeq = maxSeq(newChunks);
    if (topSeq !== null) useLiveStatusStore.getState().setLastSeq(topSeq);

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
        entry.seq > lastSeqRef.current + 1
      ) {
        // Seq discontinuity: missed deltas, scene state would be inconsistent.
        gapDetected = true;
        break;
      }
      if (typeof entry.seq === "number") lastSeqRef.current = entry.seq;
      batch.push(entry);
    }

    if (gapDetected) {
      // Discard the partial batch; Stage's gapCount effect will re-keyframe.
      setFeatureDeltas([]);
      setGapCount((n) => n + 1);
    } else if (batch.length > 0) {
      setFeatureDeltas(batch);
    }

    // Realize the no-refetch path (review MED-1): only invalidate the
    // constellation when a feature batch could NOT be spliced incrementally — a
    // document-granularity delta arrived, a gap forced a re-keyframe, or nothing
    // was applied. A clean feature-only batch animates via `apply-deltas` with
    // no refetch (that is the whole point of the spliceLive path).
    if (sawDocumentDelta || gapDetected || batch.length === 0) {
      invalidateConstellation(scope);
    }
  }, [active, scope, chunks, keyframeSeq, invalidateConstellation]);

  return { featureDeltas, gapCount };
}
