import { useEffect, useMemo } from "react";
import { create } from "zustand";

import {
  normalizeDashboardFilterFacet,
  normalizeDashboardFilterFacetValue,
  type DashboardFilterFacet,
} from "../server/dashboardState";
import type { MessageDescriptor } from "../../platform/localization/message";
import { normalizeSearchQuery } from "../searchQuery";
import {
  FILTER_MESSAGES,
  filterHealthPresentation,
  filterMessageLabel,
  filterPlanStatusPresentation,
  filterStatusPresentation,
  type FilterOptionLabel,
  type FilterTokenPresentation,
} from "./filterPresentation";
import { normalizeViewStoreSessionString } from "./scopeIdentity";
import {
  compareStableIdentifiers,
  stableIdentifier,
} from "../../platform/localization/displayText";

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

export interface FilterSidebarFacetOptionView {
  value: string;
  label: FilterOptionLabel;
  count?: number;
  dot?: FilterSidebarFacetDotTone;
}

interface FilterSidebarCheckboxSectionView {
  type: "checkbox";
  key: string;
  label: MessageDescriptor;
  options: FilterSidebarFacetOptionView[];
  selected: string[];
  onToggle: (value: string) => void;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: MessageDescriptor;
  };
  loading?: boolean;
  emptyLabel?: MessageDescriptor;
}

interface FilterSidebarRadioSectionView {
  type: "radio";
  key: string;
  label: MessageDescriptor;
  options: { value: string; label: MessageDescriptor }[];
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
  return [...normalizedValues].sort((a, b) =>
    compareStableIdentifiers(stableIdentifier(a), stableIdentifier(b)),
  );
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

export interface FilterSidebarMenuSectionsInput {
  vocabulary: unknown;
  filterView: unknown;
  onToggleFacet: (facet: unknown, value: unknown) => void;
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

function closedFilterOptions(
  values: readonly string[],
  presentationFor: (value: unknown) => FilterTokenPresentation | null,
): FilterSidebarFacetOptionView[] {
  return values.flatMap((value) => {
    const presentation = presentationFor(value);
    return presentation === null
      ? []
      : [
          {
            value,
            label: filterMessageLabel(presentation.label),
            dot: presentation.dot,
          },
        ];
  });
}

export function deriveFilterSidebarMenuSections({
  vocabulary,
  filterView,
  onToggleFacet,
}: FilterSidebarMenuSectionsInput): FilterSidebarMenuSectionView[] {
  const vocabularyRecord = isFilterSidebarRecord(vocabulary) ? vocabulary : {};
  const filterViewRecord = isFilterSidebarRecord(filterView) ? filterView : {};
  const statuses = normalizeFilterSidebarFacetValues(vocabularyRecord.statuses);
  const planStates = normalizeFilterSidebarFacetValues(vocabularyRecord.planStates);
  const health = normalizeFilterSidebarFacetValues(vocabularyRecord.health);
  const selectedStatuses = normalizeFilterSidebarFacetValues(filterViewRecord.statuses);
  const selectedPlanStates = normalizeFilterSidebarFacetValues(
    filterViewRecord.planStates,
  );
  const selectedHealth = normalizeFilterSidebarFacetValues(filterViewRecord.health);
  // The flyout hosts ONLY the doc-type-scoped STATUS groups + HEALTH. Category
  // filtering lives on the graph legend and date filtering on the timeline, so
  // neither has a section here — one concept, one place
  // (filtering-has-one-canonical-surface). Each section renders only when the
  // corpus serves its vocabulary, so it is never a dead control.
  return [
    // DECISION STATUS — the ADR lifecycle (proposed/accepted/rejected/deprecated/…).
    // The served `statuses` vocabulary is ADR-only, so this group is decision-scoped.
    ...(statuses.length > 0
      ? [
          {
            type: "checkbox" as const,
            key: "status",
            label: FILTER_MESSAGES.sections.decisionStatus,
            selected: selectedStatuses,
            onToggle: filterSidebarToggleHandler("statuses", onToggleFacet),
            options: closedFilterOptions(statuses, filterStatusPresentation),
          },
        ]
      : []),
    // PLAN STATUS — the plan COMPLETION the ENGINE serves (derived from step
    // progress: not-started / in-progress / finished), never frontend-derived.
    // Plan-scoped (only `plan` docs carry it). Shown only when the corpus serves
    // plan states, so it is never a dead control.
    ...(planStates.length > 0
      ? [
          {
            type: "checkbox" as const,
            key: "plan-status",
            label: FILTER_MESSAGES.sections.planStatus,
            selected: selectedPlanStates,
            onToggle: filterSidebarToggleHandler("plan_states", onToggleFacet),
            options: closedFilterOptions(planStates, filterPlanStatusPresentation),
          },
        ]
      : []),
    // HEALTH — validity conditions the engine derives from the graph (dangling /
    // orphans).
    ...(health.length > 0
      ? [
          {
            type: "checkbox" as const,
            key: "health",
            label: FILTER_MESSAGES.sections.health,
            selected: selectedHealth,
            onToggle: filterSidebarToggleHandler("health", onToggleFacet),
            options: closedFilterOptions(health, filterHealthPresentation),
          },
        ]
      : []),
  ];
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
