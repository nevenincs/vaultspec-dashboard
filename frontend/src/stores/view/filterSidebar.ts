import { useEffect, useMemo } from "react";
import { create } from "zustand";

import type { DashboardFilterFacet } from "../server/dashboardState";
import type {
  DashboardFilterSidebarView,
  FiltersVocabularyView,
} from "../server/queries";
import { normalizeSearchQuery } from "../searchQuery";
import { normalizeViewStoreSessionString } from "./scopeIdentity";

// Stage filter-sidebar chrome state. Filter VALUES are canonical dashboard-state;
// this store owns only whether the data-driven filter instrument is visible and
// its visual disclosure state. The view store resets it on scope/workspace swaps
// and the sidebar registers its scoped vocabulary identity so disclosure state
// never rides across a different corpus vocabulary.
export type FilterSidebarSectionKey = "kind" | "topic" | "status" | "health" | "edited";
export type FilterSidebarListKey = "doc-types" | "feature-tags";

const FILTER_SIDEBAR_SECTION_KEYS = [
  "kind",
  "topic",
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

export const FILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS = 128;
export const FILTER_SIDEBAR_VOCABULARY_VALUE_MAX_CHARS = 256;
export const FILTER_SIDEBAR_VOCABULARY_PART_MAX_VALUES = 512;

export function normalizeFilterSidebarTopicSearch(value: unknown): string {
  return normalizeSearchQuery(value).slice(0, FILTER_SIDEBAR_TOPIC_SEARCH_MAX_CHARS);
}

export function normalizeFilterSidebarOpen(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizeFilterSidebarVisualStateKey(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

const FILTER_SIDEBAR_DOC_TYPE_LABEL: Record<string, string> = {
  research: "Research",
  adr: "Decisions",
  plan: "Plans",
  exec: "Steps",
  audit: "Audits",
  reference: "Reference",
  index: "Indexes",
  summary: "Summaries",
};

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
  topicSearch: string;
  sections: Partial<Record<FilterSidebarSectionKey, boolean>>;
  expandedLists: Partial<Record<FilterSidebarListKey, boolean>>;
  setOpen: (open: unknown) => void;
  toggle: () => void;
  close: () => void;
  syncVisualStateKey: (key: unknown) => void;
  setTopicSearch: (value: unknown) => void;
  clearTopicSearch: () => void;
  setSectionOpen: (key: unknown, open: unknown) => void;
  expandList: (key: unknown) => void;
  resetForScope: () => void;
}

export const useFilterSidebarStore = create<FilterSidebarState>((set) => ({
  open: false,
  visualStateKey: null,
  topicSearch: "",
  sections: {},
  expandedLists: {},
  setOpen: (open) =>
    set((state) => {
      const normalized = normalizeFilterSidebarOpen(open);
      return normalized === null || state.open === normalized
        ? state
        : { open: normalized };
    }),
  toggle: () => set((state) => ({ open: !state.open })),
  close: () => set({ open: false }),
  syncVisualStateKey: (key) =>
    set((state) => {
      const visualStateKey = normalizeFilterSidebarVisualStateKey(key);
      if (visualStateKey === null) return state;
      return state.visualStateKey === visualStateKey
        ? state
        : {
            visualStateKey,
            topicSearch: "",
            sections: {},
            expandedLists: {},
          };
    }),
  setTopicSearch: (value) =>
    set((state) => {
      const topicSearch = normalizeFilterSidebarTopicSearch(value);
      return state.topicSearch === topicSearch ? state : { topicSearch };
    }),
  clearTopicSearch: () => set({ topicSearch: "" }),
  setSectionOpen: (key, open) =>
    set((state) => {
      const sectionKey = normalizeFilterSidebarSectionKey(key);
      const sectionOpen = normalizeFilterSidebarOpen(open);
      if (sectionKey === null || sectionOpen === null) return state;
      return {
        sections: { ...state.sections, [sectionKey]: sectionOpen },
      };
    }),
  expandList: (key) =>
    set((state) => {
      const listKey = normalizeFilterSidebarListKey(key);
      if (listKey === null) return state;
      return {
        expandedLists: { ...state.expandedLists, [listKey]: true },
      };
    }),
  resetForScope: () =>
    set({
      open: false,
      visualStateKey: null,
      topicSearch: "",
      sections: {},
      expandedLists: {},
    }),
}));

export function useFilterSidebarOpen(): boolean {
  return useFilterSidebarStore((state) => state.open);
}

export function useFilterSidebarVisualStateKey(key: string): void {
  useEffect(() => {
    useFilterSidebarStore.getState().syncVisualStateKey(key);
  }, [key]);
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

export function useFilterSidebarVisualState(
  scope: unknown,
  docTypes: unknown,
  featureTags: unknown,
  statuses: unknown,
  health: unknown,
): string {
  const key = useMemo(
    () =>
      deriveFilterSidebarVisualStateKey(scope, docTypes, featureTags, statuses, health),
    [docTypes, featureTags, health, scope, statuses],
  );
  useFilterSidebarVisualStateKey(key);
  return key;
}

export function useFilterSidebarTopicSearch(): string {
  return useFilterSidebarStore((state) => state.topicSearch);
}

export function useFilterSidebarSectionOpen(
  key: FilterSidebarSectionKey,
  defaultOpen: boolean,
): boolean {
  return useFilterSidebarStore((state) => state.sections[key] ?? defaultOpen);
}

export function useFilterSidebarListExpanded(key: FilterSidebarListKey): boolean {
  return useFilterSidebarStore((state) => state.expandedLists[key] ?? false);
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
  const overflow = limit === undefined ? 0 : Math.max(0, normalizedValues.length - limit);
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

export function filterSidebarTopicOptions(
  featureTags: unknown,
  topicSearch: unknown,
): string[] {
  const query = normalizeFilterSidebarTopicSearch(topicSearch).trim().toLowerCase();
  const normalizedFeatureTags = normalizeFilterSidebarFacetValues(featureTags);
  return query
    ? normalizedFeatureTags.filter((tag) => tag.toLowerCase().includes(query))
    : normalizedFeatureTags;
}

export function deriveFilterSidebarMenuSections({
  vocabulary,
  filterView,
  topicSearch,
  onTopicSearchChange,
  onToggleFacet,
}: {
  vocabulary: FiltersVocabularyView;
  filterView: DashboardFilterSidebarView;
  topicSearch: string;
  onTopicSearchChange: (value: string) => void;
  onToggleFacet: (facet: DashboardFilterFacet, value: string) => void;
}): FilterSidebarMenuSectionView[] {
  const presentation = filterView.presentation;
  const docTypes = normalizeFilterSidebarFacetValues(vocabulary.docTypes);
  const featureTags = normalizeFilterSidebarFacetValues(vocabulary.featureTags);
  const statuses = normalizeFilterSidebarFacetValues(vocabulary.statuses);
  const health = normalizeFilterSidebarFacetValues(vocabulary.health);
  const selectedDocTypes = normalizeFilterSidebarFacetValues(filterView.docTypes);
  const selectedFeatureTags = normalizeFilterSidebarFacetValues(filterView.featureTags);
  const selectedStatuses = normalizeFilterSidebarFacetValues(filterView.statuses);
  const selectedHealth = normalizeFilterSidebarFacetValues(filterView.health);
  return [
    {
      type: "checkbox",
      key: "kind",
      label: presentation.kindSectionLabel,
      selected: selectedDocTypes,
      onToggle: (value) => onToggleFacet("doc_types", value),
      loading: vocabulary.facetsLoading,
      options: docTypes.map((value) => ({
        value,
        label: filterSidebarDocTypeLabel(value),
      })),
    },
    {
      type: "checkbox",
      key: "topic",
      label: presentation.topicSectionLabel,
      selected: selectedFeatureTags,
      onToggle: (value) => onToggleFacet("feature_tags", value),
      loading: vocabulary.facetsLoading,
      search: {
        value: topicSearch,
        onChange: onTopicSearchChange,
        placeholder: "Search topics…",
      },
      options: filterSidebarTopicOptions(featureTags, topicSearch).map(
        (value) => ({ value, label: value }),
      ),
    },
    ...(statuses.length > 0
      ? [
          {
            type: "checkbox" as const,
            key: "status",
            label: "STATUS",
            selected: selectedStatuses,
            onToggle: (value: string) => onToggleFacet("statuses", value),
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
            onToggle: (value: string) => onToggleFacet("health", value),
            options: health.map((value) => ({
              value,
              label: filterSidebarHealthLabel(value),
              dot: filterSidebarHealthDot(value),
            })),
          },
        ]
      : []),
  ];
}

export function filterSidebarDocTypeLabel(value: string): string {
  return (
    FILTER_SIDEBAR_DOC_TYPE_LABEL[value] ??
    value.charAt(0).toUpperCase() + value.slice(1)
  );
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

export function setFilterSidebarTopicSearch(value: unknown): void {
  useFilterSidebarStore.getState().setTopicSearch(value);
}

export function clearFilterSidebarTopicSearch(): void {
  useFilterSidebarStore.getState().clearTopicSearch();
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
