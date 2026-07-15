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

import type { MessageDescriptor } from "../../platform/localization/message";

/** The sort criteria (plain-language labels in RAIL_SORT_OPTIONS; these ids are
 *  internal). `recency` is the historical default: features by member count,
 *  documents newest-modified-first. `docs` is the explicit document-count order
 *  (feature folders; document lists keep recency). `weight` is the corpus-weight
 *  order: a feature's summed served byte size — displayed as its normalized
 *  share of the whole vault. */
export type RailSortKey =
  | "recency"
  | "docs"
  | "name"
  | "created"
  | "modified"
  | "size"
  | "weight";
export type RailSortDirection = "asc" | "desc";

export interface RailSortValue {
  key: RailSortKey;
  direction: RailSortDirection;
}

/** The default = the tree's historical order, byte-for-byte (ADR D3). */
export const DEFAULT_RAIL_SORT: RailSortValue = Object.freeze({
  key: "recency",
  direction: "desc",
});

/** Raw identities and menu order remain locale-independent. */
export const RAIL_SORT_KEYS = Object.freeze([
  "recency",
  "docs",
  "name",
  "created",
  "modified",
  "size",
  "weight",
] as const) satisfies readonly RailSortKey[];

type RailSortLabelKey =
  | "documents:sortOptions.latestActivity"
  | "documents:sortOptions.documentCount"
  | "documents:sortOptions.name"
  | "documents:sortOptions.creationDate"
  | "documents:sortOptions.editDate"
  | "documents:sortOptions.length"
  | "documents:sortOptions.workspaceShare";
type RailSortActionKey =
  | "documents:actions.sortByLatestActivity"
  | "documents:actions.sortByDocumentCount"
  | "documents:actions.sortByName"
  | "documents:actions.sortByCreationDate"
  | "documents:actions.sortByEditDate"
  | "documents:actions.sortByLength"
  | "documents:actions.sortByWorkspaceShare";
type RailSortAccessibilityKey =
  | "documents:accessibility.treeOptionsSortedByLatestActivity"
  | "documents:accessibility.treeOptionsSortedByDocumentCount"
  | "documents:accessibility.treeOptionsSortedByName"
  | "documents:accessibility.treeOptionsSortedByCreationDate"
  | "documents:accessibility.treeOptionsSortedByEditDate"
  | "documents:accessibility.treeOptionsSortedByLength"
  | "documents:accessibility.treeOptionsSortedByWorkspaceShare";

interface RailSortPresentationBase<
  Id extends RailSortKey,
  LabelKey extends RailSortLabelKey,
  ActionKey extends RailSortActionKey,
  AccessibilityKey extends RailSortAccessibilityKey,
> {
  readonly id: Id;
  readonly label: MessageDescriptor<LabelKey>;
  readonly actionLabel: MessageDescriptor<ActionKey>;
  readonly triggerLabel: MessageDescriptor<AccessibilityKey>;
}

export type RailSortPresentation =
  | RailSortPresentationBase<
      "recency",
      "documents:sortOptions.latestActivity",
      "documents:actions.sortByLatestActivity",
      "documents:accessibility.treeOptionsSortedByLatestActivity"
    >
  | RailSortPresentationBase<
      "docs",
      "documents:sortOptions.documentCount",
      "documents:actions.sortByDocumentCount",
      "documents:accessibility.treeOptionsSortedByDocumentCount"
    >
  | RailSortPresentationBase<
      "name",
      "documents:sortOptions.name",
      "documents:actions.sortByName",
      "documents:accessibility.treeOptionsSortedByName"
    >
  | RailSortPresentationBase<
      "created",
      "documents:sortOptions.creationDate",
      "documents:actions.sortByCreationDate",
      "documents:accessibility.treeOptionsSortedByCreationDate"
    >
  | RailSortPresentationBase<
      "modified",
      "documents:sortOptions.editDate",
      "documents:actions.sortByEditDate",
      "documents:accessibility.treeOptionsSortedByEditDate"
    >
  | RailSortPresentationBase<
      "size",
      "documents:sortOptions.length",
      "documents:actions.sortByLength",
      "documents:accessibility.treeOptionsSortedByLength"
    >
  | RailSortPresentationBase<
      "weight",
      "documents:sortOptions.workspaceShare",
      "documents:actions.sortByWorkspaceShare",
      "documents:accessibility.treeOptionsSortedByWorkspaceShare"
    >;

type RailSortPresentationMap = Readonly<{
  [Id in RailSortKey]: Extract<RailSortPresentation, { readonly id: Id }>;
}>;

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

export const RAIL_SORT_PRESENTATION = Object.freeze({
  recency: Object.freeze({
    id: "recency",
    label: descriptor("documents:sortOptions.latestActivity"),
    actionLabel: descriptor("documents:actions.sortByLatestActivity"),
    triggerLabel: descriptor(
      "documents:accessibility.treeOptionsSortedByLatestActivity",
    ),
  }),
  docs: Object.freeze({
    id: "docs",
    label: descriptor("documents:sortOptions.documentCount"),
    actionLabel: descriptor("documents:actions.sortByDocumentCount"),
    triggerLabel: descriptor(
      "documents:accessibility.treeOptionsSortedByDocumentCount",
    ),
  }),
  name: Object.freeze({
    id: "name",
    label: descriptor("documents:sortOptions.name"),
    actionLabel: descriptor("documents:actions.sortByName"),
    triggerLabel: descriptor("documents:accessibility.treeOptionsSortedByName"),
  }),
  created: Object.freeze({
    id: "created",
    label: descriptor("documents:sortOptions.creationDate"),
    actionLabel: descriptor("documents:actions.sortByCreationDate"),
    triggerLabel: descriptor("documents:accessibility.treeOptionsSortedByCreationDate"),
  }),
  modified: Object.freeze({
    id: "modified",
    label: descriptor("documents:sortOptions.editDate"),
    actionLabel: descriptor("documents:actions.sortByEditDate"),
    triggerLabel: descriptor("documents:accessibility.treeOptionsSortedByEditDate"),
  }),
  size: Object.freeze({
    id: "size",
    label: descriptor("documents:sortOptions.length"),
    actionLabel: descriptor("documents:actions.sortByLength"),
    triggerLabel: descriptor("documents:accessibility.treeOptionsSortedByLength"),
  }),
  weight: Object.freeze({
    id: "weight",
    label: descriptor("documents:sortOptions.workspaceShare"),
    actionLabel: descriptor("documents:actions.sortByWorkspaceShare"),
    triggerLabel: descriptor(
      "documents:accessibility.treeOptionsSortedByWorkspaceShare",
    ),
  }),
} as const satisfies RailSortPresentationMap);

/** Resolve presentation only for an exact raw sort identity. */
export function railSortPresentation(value: unknown): RailSortPresentation | null {
  return value === "recency" ||
    value === "docs" ||
    value === "name" ||
    value === "created" ||
    value === "modified" ||
    value === "size" ||
    value === "weight"
    ? RAIL_SORT_PRESENTATION[value]
    : null;
}

export function normalizeRailSortKey(value: unknown): RailSortKey | null {
  if (typeof value !== "string") return null;
  return RAIL_SORT_KEYS.find((key) => key === value.trim()) ?? null;
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
