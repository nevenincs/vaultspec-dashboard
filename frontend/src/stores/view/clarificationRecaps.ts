// Answered-clarification recaps, keyed by run and request id (research C8;
// agent-panel-shell-integration D5).
//
// WHY THIS IS A STORE AND NOT COMPONENT STATE — the bug this exists to fix:
// `ClarificationCard` mounts only while `run-status` discloses a pending
// clarification, and answering SUCCESSFULLY invalidates run-status, whose refetch
// clears that very field. So a recap held in the card's own state is destroyed by
// the success it is recording. The "durable transcript object" C8 asks for cannot
// live inside the component whose unmount condition is the act of answering.
//
// HONEST DURABILITY BAR, stated once so nobody over-reads the word "durable":
// a recap here survives the success refetch, the card's unmount, and any remount of
// the transcript for as long as the run is being viewed. It does NOT survive a page
// reload. The authoritative Q&A record lives in the a2a checkpoint, and `run-status`
// does not re-serve an ANSWERED clarification — so there is nothing to recover it
// from, and this module will not pretend otherwise by persisting a client copy that
// could drift from the checkpoint. Closing that gap needs a served answered-history
// disclosure; it is named in the ADR's first-live-use review, not faked here.
//
// Bounded: recaps are held per run and dropped when the run's binding is cleared,
// and each run holds at most the engine's own clarification ceiling.

import { create } from "zustand";

import type { ClarificationRecapEntry } from "../../app/agent/clarification";

/** One answered clarification, in the order it was answered. */
export interface ClarificationRecapRecord {
  readonly requestId: string;
  readonly entries: readonly ClarificationRecapEntry[];
}

/** A run cannot park on more clarifications than this within one viewing session;
 *  the cap keeps an adversarial or looping graph from growing the list without
 *  bound (resource-bounds). */
export const CLARIFICATION_RECAP_CAP = 16;

interface ClarificationRecapState {
  /** run id -> the recaps answered during this viewing of that run. */
  byRun: Readonly<Record<string, readonly ClarificationRecapRecord[]>>;
  record: (
    runId: string,
    requestId: string,
    entries: readonly ClarificationRecapEntry[],
  ) => void;
  clearRun: (runId: string) => void;
  clearAll: () => void;
}

export const useClarificationRecaps = create<ClarificationRecapState>((set) => ({
  byRun: {},
  record: (runId, requestId, entries) =>
    set((state) => {
      if (runId.length === 0 || requestId.length === 0 || entries.length === 0) {
        return state;
      }
      const current = state.byRun[runId] ?? [];
      // Idempotent by request id: re-answering the same parked request replaces its
      // recap rather than stacking a second copy of the same decision.
      const without = current.filter((record) => record.requestId !== requestId);
      const next = [...without, { requestId, entries }].slice(-CLARIFICATION_RECAP_CAP);
      return { byRun: { ...state.byRun, [runId]: next } };
    }),
  clearRun: (runId) =>
    set((state) => {
      if (state.byRun[runId] === undefined) return state;
      const next = { ...state.byRun };
      delete next[runId];
      return { byRun: next };
    }),
  clearAll: () =>
    set((state) => (Object.keys(state.byRun).length === 0 ? state : { byRun: {} })),
}));

/** Record an answered clarification. Called by the card on a SUCCESSFUL respond,
 *  before the status refetch that unmounts it. */
export function recordClarificationRecap(
  runId: string,
  requestId: string,
  entries: readonly ClarificationRecapEntry[],
): void {
  useClarificationRecaps.getState().record(runId, requestId, entries);
}

/** Drop a run's recaps (the panel clears them when it unbinds the run). */
export function clearClarificationRecaps(runId: string): void {
  useClarificationRecaps.getState().clearRun(runId);
}

/** The recaps answered while viewing this run, oldest first. A stable empty array
 *  for an unknown run keeps the selector referentially stable. */
const EMPTY_RECAPS: readonly ClarificationRecapRecord[] = Object.freeze([]);

export function useRunClarificationRecaps(
  runId: string | null,
): readonly ClarificationRecapRecord[] {
  return useClarificationRecaps((state) =>
    runId === null ? EMPTY_RECAPS : (state.byRun[runId] ?? EMPTY_RECAPS),
  );
}
