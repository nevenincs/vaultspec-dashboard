import { create } from "zustand";

// Browser-region view-local state (dashboard-left-rail ADR "Browser" + "In-rail
// filter"): the chosen mode (vault | code) and the in-rail filter text, BOTH
// re-keyed per scope so they do not bleed across a worktree or workspace swap.
//
// The ADR is explicit on two points this store realizes:
//   1. The mode is "view-local state re-keyed per scope so it does not bleed
//      across a swap" — a stale `code` mode (or a stale filter) must not ride
//      into a new corpus.
//   2. The in-rail filter "issues no wire request and clears on scope swap" — it
//      is a client-side narrowing of the ALREADY-FETCHED listing, categorically
//      distinct from the global right-rail search pillar (a `POST /search`).
//
// This lives in `stores/view/` (the view-local-state home), NOT in the server
// stores: it touches no wire, holds no query cache, and reads no `tiers` block
// (dashboard-layer-ownership). The wholesale reset in `viewStore.setScope` /
// `viewStore.swapWorkspace` calls `resetBrowserMode()` so the reset stays in ONE
// place — the rail control never resets this itself (the single-navigation-law
// "no surface owns the reset; the stores layer does").

export type BrowserMode = "vault" | "code";

/** The default mode for a fresh scope: vault, "the corpus the product is about"
 *  (ADR "Browser" — the default mode is vault). */
export const DEFAULT_BROWSER_MODE: BrowserMode = "vault";

export interface BrowserModeState {
  /** The active browser mode for the CURRENT scope. Reset to the default on a
   *  wholesale scope/workspace swap so it never bleeds across corpora. */
  mode: BrowserMode;
  /** The in-rail filter text for the CURRENT scope and mode — a client-side
   *  narrowing, never a wire query. Cleared on a wholesale swap. */
  filter: string;

  setMode: (mode: BrowserMode) => void;
  setFilter: (filter: string) => void;
  /**
   * Reset the browser-region view state to a fresh-scope baseline: the default
   * (vault) mode and an empty filter. Called by the view store's wholesale reset
   * (`setScope` / `swapWorkspace`) so a scope or workspace swap can never carry a
   * stale mode or a stale filter into the new corpus. Switching the FILTER alone
   * when the mode changes is handled by `setMode` clearing the filter, because a
   * filter scoped to the vault listing is meaningless against the code listing.
   */
  resetForScope: () => void;
}

export const useBrowserModeStore = create<BrowserModeState>((set) => ({
  mode: DEFAULT_BROWSER_MODE,
  filter: "",
  setMode: (mode) =>
    set((state) =>
      // Switching modes clears the filter: a filter typed against the vault
      // listing has no meaning against the code listing (the filter is "scoped
      // to the active browser mode", ADR "In-rail filter"). A no-op mode set
      // leaves the filter intact.
      state.mode === mode ? state : { mode, filter: "" },
    ),
  setFilter: (filter) => set({ filter }),
  resetForScope: () => set({ mode: DEFAULT_BROWSER_MODE, filter: "" }),
}));

/** Imperative reset for the view store's wholesale swap — called from outside a
 *  React render (the same shape as the filter/pin/lens store resets the view
 *  store already invokes). Keeps the reset in the stores layer, one place. */
export function resetBrowserMode(): void {
  useBrowserModeStore.getState().resetForScope();
}
