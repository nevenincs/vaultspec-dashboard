// A one-shot composer SEED (plan P06.S20). The begin state's starter verbs put an
// opening into the composer's draft; the composer owns that draft as local state, so
// this is the narrow seam between them rather than a lift of the whole draft into a
// store.
//
// One-shot by design: the seed is CONSUMED on delivery, so a starter click seeds
// exactly once and never re-applies over text the user has since typed. That is the
// whole reason it is not a plain shared value.
//
// Layer law: local view chrome. No wire, no React — a tiny store plus two seams.

import { create } from "zustand";

interface ComposerDraftState {
  /** The pending seed, or null when nothing is waiting to be delivered. */
  seed: string | null;
  setSeed: (seed: string) => void;
  clearSeed: () => void;
}

export const useComposerDraft = create<ComposerDraftState>((set) => ({
  seed: null,
  setSeed: (seed) => set({ seed }),
  clearSeed: () => set((state) => (state.seed === null ? state : { seed: null })),
}));

/** Seed the composer draft (fired by a starter affordance). */
export function setComposerDraft(seed: string): void {
  useComposerDraft.getState().setSeed(seed);
}

/** The pending seed, for the composer's consume effect. */
export function useComposerSeed(): string | null {
  return useComposerDraft((state) => state.seed);
}

/** Mark the pending seed delivered. */
export function clearComposerDraft(): void {
  useComposerDraft.getState().clearSeed();
}
