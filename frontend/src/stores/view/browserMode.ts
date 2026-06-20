import { create } from "zustand";
import { useCallback } from "react";

// Browser-region view-local state (dashboard-left-rail ADR "Browser"): the chosen
// mode (vault | code), re-keyed per scope so it does not bleed across a
// worktree/workspace swap. Filter text is canonical dashboard-state now.
//
// The ADR is explicit on two points this store realizes:
//   1. The mode is "view-local state re-keyed per scope so it does not bleed
//      across a swap" — a stale `code` mode (or a stale filter) must not ride
//      into a new corpus.
// This lives in `stores/view/` (the view-local-state home), NOT in the server
// stores: it touches no wire, holds no query cache, and reads no `tiers` block
// (dashboard-layer-ownership). The wholesale reset in `viewStore.setScope` /
// `viewStore.swapWorkspace` calls `resetBrowserMode()` so the mode reset stays in
// ONE place — the rail control never resets this itself (the
// single-navigation-law "no surface owns the reset; the stores layer does").

// The two file-thinking modes (dashboard-left-rail / Figma `LeftRail_*`): VAULT
// (the `/vault-tree` projection nested feature → doc_type → document, the
// default) and CODE (the `/file-tree` projection). The dropped middle Tree tab is
// folded into Vault so the rail exposes only vault·code.
export type BrowserMode = "vault" | "code";

export interface BrowserModeOption {
  id: BrowserMode;
  label: string;
}

// vault -> code, left to right: the binding board's browser-mode segmented
// control. Labels live with the mode domain so app chrome does not duplicate the
// option set.
export const BROWSER_MODE_OPTIONS: readonly BrowserModeOption[] = [
  { id: "vault", label: "Vault" },
  { id: "code", label: "Code" },
];

export function normalizeBrowserMode(value: unknown): BrowserMode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return BROWSER_MODE_OPTIONS.find((option) => option.id === normalized)?.id ?? null;
}

export function isBrowserMode(value: unknown): value is BrowserMode {
  return normalizeBrowserMode(value) !== null;
}

/** The default mode for a fresh scope: vault, "the corpus the product is about"
 *  (ADR "Browser" — the default mode is vault). */
export const DEFAULT_BROWSER_MODE: BrowserMode = "vault";

export interface BrowserModeState {
  /** The active browser mode for the CURRENT scope. Reset to the default on a
   *  wholesale scope/workspace swap so it never bleeds across corpora. */
  mode: BrowserMode;

  setMode: (mode: unknown) => void;
  /**
   * Reset the browser-region view state to a fresh-scope baseline: the default
   * (vault) mode. Called by the view store's wholesale reset (`setScope` /
   * `swapWorkspace`) so a scope or workspace swap can never carry a stale mode
   * into the new corpus.
   */
  resetForScope: () => void;
}

export const useBrowserModeStore = create<BrowserModeState>((set) => ({
  mode: DEFAULT_BROWSER_MODE,
  setMode: (mode) =>
    set((state) => {
      const normalizedMode = normalizeBrowserMode(mode);
      return normalizedMode === null || state.mode === normalizedMode
        ? state
        : { mode: normalizedMode };
    }),
  resetForScope: () => set({ mode: DEFAULT_BROWSER_MODE }),
}));

export function useBrowserMode(): BrowserMode {
  return useBrowserModeStore((state) => state.mode);
}

export function setBrowserMode(mode: unknown): void {
  useBrowserModeStore.getState().setMode(mode);
}

export function nextBrowserMode(current: BrowserMode): BrowserMode {
  const index = BROWSER_MODE_OPTIONS.findIndex((option) => option.id === current);
  return BROWSER_MODE_OPTIONS[(index + 1) % BROWSER_MODE_OPTIONS.length]!.id;
}

export function cycleBrowserMode(): void {
  const current = useBrowserModeStore.getState().mode;
  useBrowserModeStore.getState().setMode(nextBrowserMode(current));
}

export function useBrowserModeIntent(): (mode: unknown) => void {
  return useCallback((mode: unknown) => setBrowserMode(mode), []);
}

/** Imperative reset for the view store's wholesale swap — called from outside a
 *  React render (the same shape as the filter/pin/lens store resets the view
 *  store already invokes). Keeps the reset in the stores layer, one place. */
export function resetBrowserMode(): void {
  useBrowserModeStore.getState().resetForScope();
}
