// Live-connection state (ADR D1): the runtime state of the engine graph SSE
// stream that the degradation derivation and the stream resume both read. The
// state system did not model liveness as a first-class state before this; the
// two degradation rows that depend on it (stream-lost, structural-broken) were
// hardwired (GUI audit finding 036). Scope-keyed in spirit: the graph-sync hook
// resets it on a wholesale scope swap (findings 022/023), like the view stores.

import { create } from "zustand";

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
  setStreamConnected: (connected: boolean) => void;
  /** Advance the resume point; never moves backward. */
  setLastSeq: (seq: number) => void;
  setBrokenLinkCount: (count: number) => void;
  /** Reset on scope swap: a new corpus has its own live plane. */
  reset: () => void;
}

const INITIAL = {
  streamConnected: null as boolean | null,
  lastSeq: null as number | null,
  brokenLinkCount: 0,
};

export const useLiveStatusStore = create<LiveStatusState>((set) => ({
  ...INITIAL,
  setStreamConnected: (streamConnected) => set({ streamConnected }),
  setLastSeq: (seq) =>
    set((state) =>
      state.lastSeq !== null && seq <= state.lastSeq ? state : { lastSeq: seq },
    ),
  setBrokenLinkCount: (brokenLinkCount) =>
    set((state) =>
      state.brokenLinkCount === brokenLinkCount ? state : { brokenLinkCount },
    ),
  reset: () => set({ ...INITIAL }),
}));

/** A lost stream is a stream that was connected and is now explicitly down. */
export function isStreamLost(state: Pick<LiveStatusState, "streamConnected">): boolean {
  return state.streamConnected === false;
}
