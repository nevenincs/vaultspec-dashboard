// Live graph sync (ADR D3): subscribe the live `graph` SSE channel and drive
// targeted cache invalidation of the constellation, plus track the stream
// connection and the resume seq. This is the contract's stated liveness path
// (the `queryClient` comment; contract section 7): "SSE streams will feed
// targeted cache invalidation + small live slices". The no-refetch delta-apply
// onto the held scene model is engine-blocked on the constellation seq baseline
// (S50) and is deliberately NOT done here - invalidation is the buildable half,
// and the connection signal is what makes the stream-lost degradation truthful.

import { useEffect, useMemo } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { debounce } from "../../platform/timing";
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
 * Drive LIVE-mode reactivity from the `graph` stream. Mount it in the stage in
 * LIVE mode only (the time-travel driver owns the scene otherwise). It updates
 * the live-connection slice (connection + resume seq) and invalidates the
 * scope's constellation query when new deltas arrive.
 */
export function useGraphLiveSync(scope: string | null, enabled: boolean): void {
  const queryClient = useQueryClient();
  const active = enabled && scope !== null;

  // Subscribe at the live tail (no `since=`) deliberately: a reconnect rides
  // TanStack's streamed-query retry from the tail, not a seq replay, so the
  // queryKey stays stable and there is no resubscribe churn as deltas arrive.
  // `lastSeq` is advanced below and staged for the future no-refetch delta
  // animation's precise resume (engine-blocked on the constellation seq, S50);
  // the seq-dedup reducer and the resume-key fix protect that future path and
  // the `since=`-bearing diff/scrub path, not this live-tail subscription.
  const stream = useQuery({ ...engineStreamOptions(["graph"]), enabled: active });
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

  // New deltas -> advance the resume point and invalidate the constellation
  // (targeted cache invalidation, the contract's liveness path).
  useEffect(() => {
    if (!active || scope === null) return;
    const seq = maxSeq(chunks);
    if (seq === null) return;
    useLiveStatusStore.getState().setLastSeq(seq);
    invalidateConstellation(scope);
  }, [active, scope, chunks, invalidateConstellation]);
}
