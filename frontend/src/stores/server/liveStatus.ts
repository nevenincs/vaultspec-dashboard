// Live-connection state (ADR D1): the runtime state of the engine graph SSE
// stream that the degradation derivation and the stream resume both read. The
// state system did not model liveness as a first-class state before this; the
// two degradation rows that depend on it (stream-lost, structural-broken) were
// hardwired (GUI audit finding 036). Scope-keyed in spirit: the graph-sync hook
// resets it on a wholesale scope swap (findings 022/023), like the view stores.

import { create } from "zustand";
import { useEffect } from "react";

export interface LiveStatusState {
  /**
   * Stream connection state. `null` means no graph stream is expected yet
   * (initial / between scopes) - that is NOT "lost". Only an explicit `false`
   * is a lost stream.
   */
  streamConnected: boolean | null;
  /** Highest graph delta seq observed - the `since=` resume point (contract section 7). */
  lastSeq: number | null;
  /** Broken structural edges in the held slice - a degradation input (section 8). */
  brokenLinkCount: number;
  setStreamConnected: (connected: unknown) => void;
  /** Advance the resume point; never moves backward. */
  setLastSeq: (seq: unknown) => void;
  setBrokenLinkCount: (count: unknown) => void;
  /** Reset on scope swap: a new corpus has its own live plane. */
  reset: () => void;
}

const INITIAL = {
  streamConnected: null as boolean | null,
  lastSeq: null as number | null,
  brokenLinkCount: 0,
};

export const LIVE_SEQ_MAX = Number.MAX_SAFE_INTEGER;
export const LIVE_BROKEN_LINK_COUNT_MAX = 10_000;

export function normalizeLiveStreamConnected(connected: unknown): boolean | null {
  return typeof connected === "boolean" ? connected : null;
}

export function normalizeLiveSeq(seq: unknown): number | null {
  if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 0) return null;
  const normalized = Math.floor(seq);
  return Number.isSafeInteger(normalized) && normalized <= LIVE_SEQ_MAX
    ? normalized
    : null;
}

export function normalizeLiveBrokenLinkCount(count: unknown): number | null {
  if (typeof count !== "number" || !Number.isFinite(count)) return null;
  return Math.min(LIVE_BROKEN_LINK_COUNT_MAX, Math.max(0, Math.floor(count)));
}

export const useLiveStatusStore = create<LiveStatusState>((set) => ({
  ...INITIAL,
  setStreamConnected: (streamConnected) =>
    set((state) => {
      const connected = normalizeLiveStreamConnected(streamConnected);
      return connected === null || state.streamConnected === connected
        ? state
        : { streamConnected: connected };
    }),
  setLastSeq: (seq) =>
    set((state) => {
      const lastSeq = normalizeLiveSeq(seq);
      return lastSeq === null || (state.lastSeq !== null && lastSeq <= state.lastSeq)
        ? state
        : { lastSeq };
    }),
  setBrokenLinkCount: (brokenLinkCount) =>
    set((state) => {
      const count = normalizeLiveBrokenLinkCount(brokenLinkCount);
      return count === null || state.brokenLinkCount === count
        ? state
        : { brokenLinkCount: count };
    }),
  reset: () => set({ ...INITIAL }),
}));

export function setLiveStreamConnected(connected: unknown): void {
  useLiveStatusStore.getState().setStreamConnected(connected);
}

export function markLiveStreamLost(): void {
  setLiveStreamConnected(false);
}

export function advanceLiveSeq(seq: unknown): void {
  useLiveStatusStore.getState().setLastSeq(seq);
}

export function setLiveBrokenLinkCount(count: unknown): void {
  useLiveStatusStore.getState().setBrokenLinkCount(count);
}

function liveEdgeState(edge: unknown): unknown {
  return edge !== null && typeof edge === "object"
    ? (edge as { state?: unknown }).state
    : undefined;
}

export function countBrokenLinks(edges: unknown): number {
  if (!Array.isArray(edges)) return 0;
  let count = 0;
  for (const edge of edges) {
    if (liveEdgeState(edge) === "broken") count += 1;
    if (count >= LIVE_BROKEN_LINK_COUNT_MAX) break;
  }
  return count;
}

export function setLiveBrokenLinkCountFromEdges(edges: unknown): void {
  setLiveBrokenLinkCount(countBrokenLinks(edges));
}

/**
 * React seam for graph-derived live degradation state. Producers pass the held
 * graph edges; liveStatus owns the reduction and store write so app surfaces do
 * not compose graph-derived degradation state locally.
 */
export function useLiveBrokenLinkCountFromEdges(
  edges: unknown,
  enabled: unknown,
): void {
  useEffect(() => {
    if (enabled !== true) return;
    setLiveBrokenLinkCountFromEdges(edges);
  }, [edges, enabled]);
}

export function resetLiveStatus(): void {
  useLiveStatusStore.getState().reset();
}

/** A lost stream is a stream that was connected and is now explicitly down. */
export function isStreamLost(state: Pick<LiveStatusState, "streamConnected">): boolean {
  return state.streamConnected === false;
}
