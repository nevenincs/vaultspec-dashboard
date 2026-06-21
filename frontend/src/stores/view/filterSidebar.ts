import { useEffect, useMemo } from "react";
import { create } from "zustand";

import {
  normalizeDashboardFilterFacet,
  normalizeDashboardFilterFacetValue,
  type DashboardFilterFacet,
} from "../server/dashboardState";
import { docTypeLabel } from "../server/docTypeVocabulary";
import type { DashboardFilterSidebarView } from "../server/queries";
import { normalizeSearchQuery } from "../searchQuery";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

// Stage filter-sidebar chrome state. Filter VALUES are canonical dashboard-state;
// this store owns only whether the data-driven filter instrument is visible and
// its visual disclosure state. The view store resets it on scope/workspace swaps
// and the sidebar registers its scoped vocabulary identity so disclosure state
// never rides across a different corpus vocabulary.
export type FilterSidebarSectionKey =
  | "kind"
  | "feature"
  | "status"
  | "health"
  | "edited";
export type FilterSidebarListKey = "doc-types" | "feature-tags";

const FILTER_SIDEBAR_SECTION_KEYS = [
  "kind",
  "feature",
  "status",
  "health",
  "edited",
] as const satisfies readonly FilterSidebarSectionKey[];
const FILTER_SIDEBAR_SECTION_KEY_SET = new Set<string>(FILTER_SIDEBAR_SECTION_KEYS);
const FILTER_SIDEBAR_LIST_KEYS = [
  "doc-types",
  "feature-tags",
] as const satisfies readonly FilterSidebarListKey[];
const FILTER_SIDEBAR_LIST_KEY_SET = new Set<string>(FILTER_SIDEBAR_LIST_KEYS);

export interface FilterSidebarFacetRowView {
  value: string;
  checked: boolean;
  inputClassName: string;
  labelClassName: string;
  valueClassName: string;
}

export interface FilterSidebarFacetListView {
  shown: string[];
  rows: FilterSidebarFacetRowView[];
  overflow: number;
  overflowLabel: string | null;
  emptyMessage: string | null;
  ariaBusy: boolean | undefined;
}

export interface FilterSidebarFacetOptionView {
  value: string;
  label?: string;
  count?: number;
  dot?: FilterSidebarFacetDotTone;
}

interface FilterSidebarCheckboxSectionView {
  type: "checkbox";
  key: string;
  label: string;
  options: FilterSidebarFacetOptionView[];
  selected: string[];
  onToggle: (value: string) => void;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    ariaLabel?: string;
  };
  loading?: boolean;
  emptyLabel?: string;
}

interface FilterSidebarRadioSectionView {
  type: "radio";
  key: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onSelect: (value: string) => void;
}

export type FilterSidebarMenuSectionView =
  | FilterSidebarCheckboxSectionView
  | FilterSidebarRadioSectionView;

export type FilterSidebarFacetDotTone =
  | "active"
  | "complete"
  | "archived"
  | "stale"
  | "broken"
  | "provisional"
  | "danger";

export const FILTER_SIDEBAR_FEATURE_SEARCH_MAX_CHARS = 128;
export const FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS = 256;
export const FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES = 512;
export const FILTER_SIDEBAR_VISUAL_STATE_KEY_MAX_CHARS = 1024 * 1024;

export function normalizeFilterSidebarFeatureSearch(value: unknown): string {
  return normalizeSearchQuery(value).slice(0, FILTER_SIDEBAR_FEATURE_SEARCH_MAX_CHARS);
}

export function normalizeFilterSidebarOpen(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizeFilterSidebarVisualStateKey(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= FILTER_SIDEBAR_VISUAL_STATE_KEY_MAX_CHARS
    ? value
    : null;
}

export const normalizeFilterSidebarScope = normalizeViewStoreSessionString;

export function normalizeFilterSidebarSectionKey(
  value: unknown,
): FilterSidebarSectionKey | null {
  return typeof value === "string" && FILTER_SIDEBAR_SECTION_KEY_SET.has(value)
    ? (value as FilterSidebarSectionKey)
    : null;
}

export function normalizeFilterSidebarListKey(
  value: unknown,
): FilterSidebarListKey | null {
  return typeof value === "string" && FILTER_SIDEBAR_LIST_KEY_SET.has(value)
    ? (value as FilterSidebarListKey)
    : null;
}

export function normalizeFilterSidebarSections(
  value: unknown,
): Partial<Record<FilterSidebarSectionKey, boolean>> {
  if (value === null || typeof value !== "object") return {};
  const normalized: Partial<Record<FilterSidebarSectionKey, boolean>> = {};
  for (const [rawKey, rawOpen] of Object.entries(value)) {
    const key = normalizeFilterSidebarSectionKey(rawKey);
    const open = normalizeFilterSidebarOpen(rawOpen);
    if (key !== null && open !== null) normalized[key] = open;
  }
  return normalized;
}

export function normalizeFilterSidebarExpandedLists(
  value: unknown,
): Partial<Record<FilterSidebarListKey, boolean>> {
  if (value === null || typeof value !== "object") return {};
  const normalized: Partial<Record<FilterSidebarListKey, boolean>> = {};
  for (const [rawKey, rawOpen] of Object.entries(value)) {
    const key = normalizeFilterSidebarListKey(rawKey);
    const open = normalizeFilterSidebarOpen(rawOpen);
    if (key !== null && open !== null) normalized[key] = open;
  }
  return normalized;
}

const FILTER_SIDEBAR_STATUS_DOT: Record<string, FilterSidebarFacetDotTone> = {
  accepted: "complete",
  finished: "complete",
  complete: "complete",
  proposed: "provisional",
  draft: "provisional",
  "in-progress": "active",
  active: "active",
  rejected: "broken",
  deprecated: "archived",
  archived: "archived",
};

const FILTER_SIDEBAR_HEALTH_DOT: Record<string, FilterSidebarFacetDotTone> = {
  dangling: "broken",
  invalid: "danger",
  "empty-scaffold": "stale",
  orphaned: "archived",
};

const FILTER_SIDEBAR_HEALTH_LABEL: Record<string, string> = {
  dangling: "dangling links",
  invalid: "invalid frontmatter",
  "empty-scaffold": "empty scaffold",
  orphaned: "orphaned",
};

export interface FilterSidebarState {
  open: boolean;
  visualStateKey: string | null;
  featureSearch: string;
  sections: Partial<Record<FilterSidebarSectionKey, boolean>>;
  expandedLists: Partial<Record<FilterSidebarListKey, boolean>>;
  setOpen: (open: unknown) => void;
  toggle: () => void;
  close: () => void;
  syncVisualStateKey: (key: unknown) => void;
  setFeatureSearch: (value: unknown) => void;
  clearFeatureSearch: () => void;
  setSectionOpen: (key: unknown, open: unknown) => void;
  expandList: (key: unknown) => void;
  resetForScope: () => void;
}

export const useFilterSidebarStore = create<FilterSidebarState>((set) => ({
  open: false,
  visualStateKey: null,
  featureSearch: "",
  sections: {},
  expandedLists: {},
  setOpen: (open) =>
    set((state) => {
      const normalized = normalizeFilterSidebarOpen(open);
      return normalized === null || state.open === normalized
        ? state
        : { open: normalized };
    }),
  toggle: () =>
    set((state) => ({ open: !(normalizeFilterSidebarOpen(state.open) ?? false) })),
  close: () => set({ open: false }),
  syncVisualStateKey: (key) =>
    set((state) => {
      const visualStateKey = normalizeFilterSidebarVisualStateKey(key);
      if (visualStateKey === null) return state;
      return state.visualStateKey === visualStateKey
        ? state
        : {
            visualStateKey,
            featureSearch: "",
            sections: {},
            expandedLists: {},
          };
    }),
  setFeatureSearch: (value) =>
    set((state) => {
      const featureSearch = normalizeFilterSidebarFeatureSearch(value);
      return state.featureSearch === featureSearch ? state : { featureSearch };
    }),
  clearFeatureSearch: () => set({ featureSearch: "" }),
  setSectionOpen: (key, open) =>
    set((state) => {
      const sectionKey = normalizeFilterSidebarSectionKey(key);
      const sectionOpen = normalizeFilterSidebarOpen(open);
      if (sectionKey === null || sectionOpen === null) return state;
      return {
        sections: {
          ...normalizeFilterSidebarSections(state.sections),
          [sectionKey]: sectionOpen,
        },
      };
    }),
  expandList: (key) =>
    set((state) => {
      const listKey = normalizeFilterSidebarListKey(key);
      if (listKey === null) return state;
      return {
        expandedLists: {
          ...normalizeFilterSidebarExpandedLists(state.expandedLists),
          [listKey]: true,
        },
      };
    }),
  resetForScope: () =>
    set({
      open: false,
      visualStateKey: null,
      featureSearch: "",
      sections: {},
      expandedLists: {},
    }),
}));

export function useFilterSidebarOpen(): boolean {
  return useFilterSidebarStore(
    (state) => normalizeFilterSidebarOpen(state.open) ?? false,
  );
}

export function useFilterSidebarVisualStateKey(
  key: unknown,
  canSync: unknown = true,
): void {
  useEffect(() => {
    if (canSync !== true) return;
    useFilterSidebarStore.getState().syncVisualStateKey(key);
  }, [canSync, key]);
}

function normalizeFilterSidebarVocabularyValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 &&
    normalized.length <= FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeFilterSidebarVocabularyPart(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const normalizedValues = new Set<string>();
  for (const value of values) {
    const normalized = normalizeFilterSidebarVocabularyValue(value);
    if (normalized === null) continue;
    normalizedValues.add(normalized);
    if (normalizedValues.size >= FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES) break;
  }
  return [...normalizedValues].sort((a, b) => a.localeCompare(b));
}

export function normalizeFilterSidebarFacetValues(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const normalizedValues: string[] = [];
  for (const value of values) {
    const normalized = normalizeFilterSidebarVocabularyValue(value);
    if (normalized === null || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedValues.push(normalized);
    if (normalizedValues.length >= FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES) break;
  }
  return normalizedValues;
}

export function normalizeFilterSidebarFacetLimit(max: unknown): number | undefined {
  return typeof max === "number" && Number.isFinite(max) && max > 0
    ? Math.trunc(max)
    : undefined;
}

function visualStateVocabularyPart(values: unknown): string[] {
  return normalizeFilterSidebarVocabularyPart(values);
}

export function deriveFilterSidebarVisualStateKey(
  scope: unknown,
  docTypes: unknown,
  featureTags: unknown,
  statuses: unknown,
  health: unknown,
): string {
  return JSON.stringify([
    normalizeFilterSidebarScope(scope),
    visualStateVocabularyPart(docTypes),
    visualStateVocabularyPart(featureTags),
    visualStateVocabularyPart(statuses),
    visualStateVocabularyPart(health),
  ]);
}

export function canSyncFilterSidebarVisualStateScope(scope: unknown): boolean {
  return scope === null || normalizeFilterSidebarScope(scope) !== null;
}

export function useFilterSidebarVisualState(
  scope: unknown,
  docTypes: unknown,
  featureTags: unknown,
  statuses: unknown,
  health: unknown,
): string {
  const canSync = useMemo(() => canSyncFilterSidebarVisualStateScope(scope), [scope]);
  const key = useMemo(
    () =>
      deriveFilterSidebarVisualStateKey(scope, docTypes, featureTags, statuses, health),
    [docTypes, featureTags, health, scope, statuses],
  );
  useFilterSidebarVisualStateKey(key, canSync);
  return key;
}

export function useFilterSidebarFeatureSearch(): string {
  return useFilterSidebarStore((state) =>
    normalizeFilterSidebarFeatureSearch(state.featureSearch),
  );
}

export function useFilterSidebarSectionOpen(
  key: unknown,
  defaultOpen: unknown,
): boolean {
  const sectionKey = normalizeFilterSidebarSectionKey(key);
  const fallbackOpen = normalizeFilterSidebarOpen(defaultOpen) ?? false;
  return useFilterSidebarStore((state) =>
    sectionKey === null
      ? fallbackOpen
      : (normalizeFilterSidebarSections(state.sections)[sectionKey] ?? fallbackOpen),
  );
}

export function useFilterSidebarListExpanded(key: unknown): boolean {
  const listKey = normalizeFilterSidebarListKey(key);
  return useFilterSidebarStore((state) =>
    listKey === null
      ? false
      : (normalizeFilterSidebarExpandedLists(state.expandedLists)[listKey] ?? false),
  );
}

export function deriveFilterSidebarFacetListView(
  values: unknown,
  selected: unknown,
  max: unknown,
  showAll: unknown,
  loading: unknown,
): FilterSidebarFacetListView {
  const normalizedValues = normalizeFilterSidebarFacetValues(values);
  const normalizedSelected = new Set(normalizeFilterSidebarFacetValues(selected));
  const limit = normalizeFilterSidebarFacetLimit(max);
  const showAllValues = showAll === true;
  const loadingValue = loading === true;
  const shown =
    limit === undefined || showAllValues
      ? [...normalizedValues]
      : normalizedValues.slice(0, limit);
  const overflow =
    limit === undefined ? 0 : Math.max(0, normalizedValues.length - limit);
  return {
    shown,
    rows: shown.map((value) => ({
      value,
      checked: normalizedSelected.has(value),
      inputClassName: "accent-accent",
      labelClassName:
        "flex cursor-pointer items-center gap-fg-2 rounded-fg-xs px-fg-1 py-fg-0-5 text-label hover:bg-paper-sunken",
      valueClassName: normalizedSelected.has(value) ? "text-ink" : "text-ink-muted",
    })),
    overflow,
    overflowLabel: overflow > 0 && !showAllValues ? `+${overflow} more` : null,
    emptyMessage:
      normalizedValues.length === 0
        ? loadingValue
          ? "loading..."
          : "none in corpus"
        : null,
    ariaBusy: loadingValue || undefined,
  };
}

export function filterSidebarFeatureOptions(
  featureTags: unknown,
  featureSearch: unknown,
): string[] {
  const query = normalizeFilterSidebarFeatureSearch(featureSearch).trim().toLowerCase();
  const normalizedFeatureTags = normalizeFilterSidebarFacetValues(featureTags);
  return query
    ? normalizedFeatureTags.filter((tag) => tag.toLowerCase().includes(query))
    : normalizedFeatureTags;
}

export interface FilterSidebarMenuSectionsInput {
  vocabulary: unknown;
  filterView: unknown;
  onToggleFacet: (facet: unknown, value: unknown) => void;
  /** Select an edited-window option (the EDITED date-range radios). The caller
   *  maps the window key to a canonical date range and writes it through the
   *  date-range intent. Omit to render the section read-only (e.g. in tests). */
  onSelectEditedWindow?: (window: unknown) => void;
}

function isFilterSidebarRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizeFilterSidebarFacetToggle(
  facet: unknown,
  value: unknown,
): [DashboardFilterFacet, string] | null {
  const normalizedFacet = normalizeDashboardFilterFacet(facet);
  const normalizedValue = normalizeDashboardFilterFacetValue(value);
  return normalizedFacet === null || normalizedValue === null
    ? null
    : [normalizedFacet, normalizedValue];
}

function filterSidebarToggleHandler(
  facet: DashboardFilterFacet,
  onToggleFacet: (facet: unknown, value: unknown) => void,
): (value: unknown) => void {
  return (value) => {
    const normalized = normalizeFilterSidebarFacetToggle(facet, value);
    if (normalized === null) return;
    onToggleFacet(normalized[0], normalized[1]);
  };
}

export function deriveFilterSidebarMenuSections({
  vocabulary,
  filterView,
  onToggleFacet,
  onSelectEditedWindow,
}: FilterSidebarMenuSectionsInput): FilterSidebarMenuSectionView[] {
  const vocabularyRecord = isFilterSidebarRecord(vocabulary) ? vocabulary : {};
  const filterViewRecord = isFilterSidebarRecord(filterView) ? filterView : {};
  const presentation =
    isFilterSidebarRecord(filterViewRecord.presentation) &&
    "kindSectionLabel" in filterViewRecord.presentation &&
    "featureSectionLabel" in filterViewRecord.presentation
      ? (filterViewRecord.presentation as unknown as DashboardFilterSidebarView["presentation"])
      : ({} as DashboardFilterSidebarView["presentation"]);
  const docTypes = normalizeFilterSidebarFacetValues(vocabularyRecord.docTypes);
  const statuses = normalizeFilterSidebarFacetValues(vocabularyRecord.statuses);
  const health = normalizeFilterSidebarFacetValues(vocabularyRecord.health);
  const selectedDocTypes = normalizeFilterSidebarFacetValues(filterViewRecord.docTypes);
  const selectedStatuses = normalizeFilterSidebarFacetValues(filterViewRecord.statuses);
  const selectedHealth = normalizeFilterSidebarFacetValues(filterViewRecord.health);
  // EDITED — the date-range radios (Any time / Last 7 days / …). The window options
  // and the selected window are interpreted in the stores filter-sidebar view; here
  // they become a radio section whose select maps to a canonical date range through
  // the caller's `onSelectEditedWindow`. Always present (the windows are static, not
  // vocabulary-gated) and never a dead control — it writes the consumed date range.
  const editedWindow =
    typeof filterViewRecord.editedWindow === "string"
      ? filterViewRecord.editedWindow
      : "any";
  const editedWindowOptions = (
    Array.isArray(filterViewRecord.editedWindowRows)
      ? filterViewRecord.editedWindowRows
      : []
  )
    .filter(
      (row): row is Record<string, unknown> =>
        isFilterSidebarRecord(row) && typeof row.key === "string",
    )
    .map((row) => ({
      value: row.key as string,
      label: typeof row.label === "string" ? row.label : (row.key as string),
    }));
  return [
    {
      type: "checkbox",
      key: "kind",
      label: presentation.kindSectionLabel,
      selected: selectedDocTypes,
      onToggle: filterSidebarToggleHandler("doc_types", onToggleFacet),
      loading: vocabularyRecord.facetsLoading === true,
      options: docTypes.map((value) => ({
        value,
        label: filterSidebarDocTypeLabel(value),
      })),
    },
    ...(statuses.length > 0
      ? [
          {
            type: "checkbox" as const,
            key: "status",
            label: "STATUS",
            selected: selectedStatuses,
            onToggle: filterSidebarToggleHandler("statuses", onToggleFacet),
            options: statuses.map((value) => ({
              value,
              label: value,
              dot: filterSidebarStatusDot(value),
            })),
          },
        ]
      : []),
    ...(health.length > 0
      ? [
          {
            type: "checkbox" as const,
            key: "health",
            label: "HEALTH",
            selected: selectedHealth,
            onToggle: filterSidebarToggleHandler("health", onToggleFacet),
            options: health.map((value) => ({
              value,
              label: filterSidebarHealthLabel(value),
              dot: filterSidebarHealthDot(value),
            })),
          },
        ]
      : []),
    ...(editedWindowOptions.length > 0
      ? [
          {
            type: "radio" as const,
            key: "edited",
            label: presentation.editedSectionLabel ?? "EDITED",
            options: editedWindowOptions,
            value: editedWindow,
            onSelect: (value: string) => onSelectEditedWindow?.(value),
          },
        ]
      : []),
  ];
}

export function filterSidebarDocTypeLabel(value: string): string {
  return docTypeLabel(value);
}

export function filterSidebarStatusDot(value: string): FilterSidebarFacetDotTone {
  return FILTER_SIDEBAR_STATUS_DOT[value.toLowerCase()] ?? "provisional";
}

export function filterSidebarHealthDot(value: string): FilterSidebarFacetDotTone {
  return FILTER_SIDEBAR_HEALTH_DOT[value.toLowerCase()] ?? "stale";
}

export function filterSidebarHealthLabel(value: string): string {
  return FILTER_SIDEBAR_HEALTH_LABEL[value.toLowerCase()] ?? value;
}

export function setFilterSidebarOpen(open: unknown): void {
  useFilterSidebarStore.getState().setOpen(open);
}

export function toggleFilterSidebar(): void {
  useFilterSidebarStore.getState().toggle();
}

export function closeFilterSidebar(): void {
  useFilterSidebarStore.getState().close();
}

export function setFilterSidebarFeatureSearch(value: unknown): void {
  useFilterSidebarStore.getState().setFeatureSearch(value);
}

export function clearFilterSidebarFeatureSearch(): void {
  useFilterSidebarStore.getState().clearFeatureSearch();
}

export function setFilterSidebarSectionOpen(key: unknown, open: unknown): void {
  useFilterSidebarStore.getState().setSectionOpen(key, open);
}

export function expandFilterSidebarList(key: unknown): void {
  useFilterSidebarStore.getState().expandList(key);
}

/** Imperative reset for viewStore's wholesale scope/workspace swap. */
export function resetFilterSidebar(): void {
  useFilterSidebarStore.getState().resetForScope();
}
