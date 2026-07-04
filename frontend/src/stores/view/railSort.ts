// The vault tree's sort plane (left-rail-tree-controls ADR D3): ONE view-local
// value `{key, direction}` governing the whole Vault-tab tree — the document
// order inside every category folder AND the feature-folder order — consumed by
// `deriveVaultRailView` (the one projection; no per-component sort).
//
// Sort is PRESENTATION, never a corpus filter: it changes how the one view
// renders the same corpus, so it lives here in `stores/view/` and never touches
// `dashboardState.filters` (the filter-vs-presentation split). It is a durable
// user preference (persisted, like the tree's disclosure folds) rather than a
// per-scope transient: reordering a listing is corpus-independent taste, and the
// `left-rail:reset-sorting` verb is the one restore-default path.
//
// Files (code) mode has NO sort plane (user direction 2026-07-04): the code tree
// keeps the engine's fixed directories-first alphabetical order.

import { create } from "zustand";
import { persist } from "zustand/middleware";

/** The sort criteria (plain-language labels in RAIL_SORT_OPTIONS; these ids are
 *  internal). `recency` is the historical default: features by member count,
 *  documents newest-modified-first. */
export type RailSortKey = "recency" | "name" | "created" | "modified" | "size";
export type RailSortDirection = "asc" | "desc";

export interface RailSortValue {
  key: RailSortKey;
  direction: RailSortDirection;
}

/** The default = the tree's historical order, byte-for-byte (ADR D3). */
export const DEFAULT_RAIL_SORT: RailSortValue = { key: "recency", direction: "desc" };

export interface RailSortOption {
  id: RailSortKey;
  /** Plain-language menu/palette label (ui-labels-are-user-facing). */
  label: string;
}

/** The user-facing option set, in menu order. */
export const RAIL_SORT_OPTIONS: readonly RailSortOption[] = [
  { id: "recency", label: "Latest Activity" },
  { id: "name", label: "Name" },
  { id: "created", label: "Date Created" },
  { id: "modified", label: "Date Modified" },
  { id: "size", label: "Length" },
];

export function normalizeRailSortKey(value: unknown): RailSortKey | null {
  if (typeof value !== "string") return null;
  return RAIL_SORT_OPTIONS.find((option) => option.id === value.trim())?.id ?? null;
}

/** The natural first direction per key: dates/size/activity read newest/biggest
 *  first; a name sort reads A→Z. Choosing the same key again flips direction. */
export function naturalRailSortDirection(key: RailSortKey): RailSortDirection {
  return key === "name" ? "asc" : "desc";
}

interface RailSortState {
  value: RailSortValue;
  setKey: (key: unknown) => void;
  setDirection: (direction: RailSortDirection) => void;
  reset: () => void;
}

export const useRailSortStore = create<RailSortState>()(
  persist(
    (set) => ({
      value: DEFAULT_RAIL_SORT,
      setKey: (key) =>
        set((state) => {
          const normalized = normalizeRailSortKey(key);
          if (normalized === null) return state;
          // Re-choosing the active key flips direction; a new key starts at its
          // natural direction (the standard listing-sort gesture).
          const direction =
            state.value.key === normalized
              ? state.value.direction === "desc"
                ? "asc"
                : "desc"
              : naturalRailSortDirection(normalized);
          return { value: { key: normalized, direction } };
        }),
      setDirection: (direction) =>
        set((state) => ({ value: { ...state.value, direction } })),
      reset: () => set({ value: DEFAULT_RAIL_SORT }),
    }),
    {
      name: "vaultspec:left-rail-sort",
      // Bounded by construction: one small record, no growth.
      partialize: (state) => ({ value: state.value }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<RailSortState>;
        const key = normalizeRailSortKey(saved.value?.key);
        const direction =
          saved.value?.direction === "asc" || saved.value?.direction === "desc"
            ? saved.value.direction
            : null;
        return key !== null && direction !== null
          ? { ...current, value: { key, direction } }
          : current;
      },
    },
  ),
);

/** The active sort value (raw, referentially stable — stable-selectors). */
export function useRailSort(): RailSortValue {
  return useRailSortStore((state) => state.value);
}

/** Choose a sort key (re-choosing the active key flips direction). */
export function setRailSortKey(key: unknown): void {
  useRailSortStore.getState().setKey(key);
}

/** Restore the default order (the `left-rail:reset-sorting` verb's effect). */
export function resetRailSort(): void {
  useRailSortStore.getState().reset();
}
