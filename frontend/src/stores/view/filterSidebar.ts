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
  authoredFilterLabel,
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

interface FilterSidebarDateSectionView {
  type: "date";
  key: string;
  label: MessageDescriptor;
  options: { value: string; label: MessageDescriptor }[];
  /** The named window the CANONICAL date_range currently is — "custom" for any
   *  range the timeline's handles produced that matches no named window. */
  value: string;
  onSelect: (value: string) => void;
  /** The explicit two-input range, rendered when the active window is custom. Its
   *  bounds are `yyyy-mm-dd` day strings (the canonical wire form). */
  custom: {
    from: string;
    to: string;
    min: string;
    max: string;
    fromLabel: MessageDescriptor;
    toLabel: MessageDescriptor;
    onChange: (from: string, to: string) => void;
  } | null;
}

export type FilterSidebarMenuSectionView =
  | FilterSidebarCheckboxSectionView
  | FilterSidebarRadioSectionView
  | FilterSidebarDateSectionView;

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
  /** Whether the temporal section's explicit two-input range is disclosed. Pure
   *  local chrome: the RANGE itself is the canonical `dashboardState.date_range`,
   *  written only through the timeline's Setter seam. */
  customDateOpen: boolean;
  sections: Partial<Record<FilterSidebarSectionKey, boolean>>;
  expandedLists: Partial<Record<FilterSidebarListKey, boolean>>;
  setOpen: (open: unknown) => void;
  toggle: () => void;
  close: () => void;
  syncVisualStateKey: (key: unknown) => void;
  setFeatureSearch: (value: unknown) => void;
  clearFeatureSearch: () => void;
  setCustomDateOpen: (open: unknown) => void;
  setSectionOpen: (key: unknown, open: unknown) => void;
  expandList: (key: unknown) => void;
  resetForScope: () => void;
}

export const useFilterSidebarStore = create<FilterSidebarState>((set) => ({
  open: false,
  visualStateKey: null,
  featureSearch: "",
  customDateOpen: false,
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
            customDateOpen: false,
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
  setCustomDateOpen: (open) =>
    set((state) => {
      const customDateOpen = normalizeFilterSidebarOpen(open);
      return customDateOpen === null || state.customDateOpen === customDateOpen
        ? state
        : { customDateOpen };
    }),
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
      customDateOpen: false,
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

/** The temporal section's inputs. The RANGE is not owned here — it is the one
 *  canonical `dashboardState.date_range`, read back as the named window it
 *  currently is and committed only through the timeline's Setter seam, which the
 *  container hands in as `onSelectPreset` / `onSetRange`. */
export interface FilterSidebarDateInput {
  /** The named window the committed range matches ("any" | "7d" | "30d" | "year"
   *  | "custom"), derived by the caller from the SAME record the timeline reads. */
  preset: string;
  /** The committed day bounds, seeded to the corpus span when no range is set. */
  from: string;
  to: string;
  /** The corpus span, so the two date inputs cannot ask for an empty result. */
  min: string;
  max: string;
  /** Whether the explicit two-input range is disclosed (local chrome). */
  customOpen: boolean;
  onSelectPreset: (preset: string) => void;
  onSetRange: (from: string, to: string) => void;
}

export interface FilterSidebarMenuSectionsInput {
  vocabulary: unknown;
  filterView: unknown;
  onToggleFacet: (facet: unknown, value: unknown) => void;
  /** Replace one facet's values wholesale — the write the ALL-ON model needs, since
   *  unticking a value from the "everything shown" state means committing every
   *  OTHER value at once. */
  onSetFacetValues: (facet: unknown, values: string[]) => void;
  /** Omitted where the corpus serves no date span at all. */
  date?: FilterSidebarDateInput;
}

/**
 * The ALL-ON checkbox model (owner review [msach8nx]). The engine's `Filter`
 * grammar is an INCLUSION list, so an empty facet means "not narrowed" — which the
 * old rendering showed as every box UNTICKED, and a ticked box then meant "show only
 * this". The owner read that as a double negation ("Hide rejected, or show
 * rejected?"). The record is unchanged; the RENDERING is inverted: an unnarrowed
 * facet shows every value TICKED, and unticking one hides it.
 *
 * Two edges collapse to the cleared facet. Every value ticked IS "not narrowed".
 * And NO value ticked — "show nothing" — has no representation in an inclusion
 * grammar and no useful meaning, so unticking the last value re-ticks the set
 * rather than emptying the corpus.
 */
export function filterSidebarCheckedValues(
  vocabulary: readonly string[],
  selected: readonly string[],
): string[] {
  return selected.length === 0 ? [...vocabulary] : [...selected];
}

export function nextFilterSidebarFacetValues(
  vocabulary: readonly string[],
  selected: readonly string[],
  value: string,
): string[] {
  const checked = new Set(filterSidebarCheckedValues(vocabulary, selected));
  if (checked.has(value)) checked.delete(value);
  else checked.add(value);
  if (checked.size === 0 || checked.size >= vocabulary.length) return [];
  return vocabulary.filter((entry) => checked.has(entry));
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

/** The ALL-ON toggle: resolve the next inclusion list from what is DISPLAYED as
 *  ticked, then commit the whole facet in one write (never a value-at-a-time walk,
 *  which would leave the record briefly narrowed to nothing). */
function filterSidebarAllOnToggleHandler(
  facet: DashboardFilterFacet,
  vocabulary: readonly string[],
  selected: readonly string[],
  onSetFacetValues: (facet: unknown, values: string[]) => void,
): (value: unknown) => void {
  return (value) => {
    const normalized = normalizeFilterSidebarFacetToggle(facet, value);
    if (normalized === null) return;
    onSetFacetValues(
      normalized[0],
      nextFilterSidebarFacetValues(vocabulary, selected, normalized[1]),
    );
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
  onSetFacetValues,
  date,
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
  const selectedFeatureTags = normalizeFilterSidebarFacetValues(
    filterViewRecord.featureTags,
  );
  // The flyout hosts the ACTIVE feature narrowing, the doc-type-scoped STATUS
  // groups, HEALTH, and the temporal window. Category filtering stays on the graph
  // legend — one concept, one place (filtering-has-one-canonical-surface). Each
  // section renders only when the corpus serves its vocabulary, so it is never a
  // dead control. The three closed facets render under the ALL-ON model: every
  // value ticked when the facet is unnarrowed, unticking one hides it.
  return [
    // FEATURE — the ACTIVE feature narrowing only (owner review [msacfd3s]). The
    // full roster is a corpus-sized list that belongs to the rail's feature search
    // field, not to a flyout section; what the flyout owes the reader is what is
    // currently narrowing the corpus and a way to undo it. With no feature filter
    // active the section states so plainly rather than rendering an empty list.
    {
      type: "checkbox" as const,
      key: "feature",
      label: FILTER_MESSAGES.sections.feature,
      selected: selectedFeatureTags,
      onToggle: filterSidebarToggleHandler("feature_tags", onToggleFacet),
      options: selectedFeatureTags.map((value) => ({
        value,
        label: authoredFilterLabel(value),
      })),
      emptyLabel: FILTER_MESSAGES.noFeatureFilter,
    },
    // DECISION STATUS — the ADR lifecycle (proposed/accepted/rejected/deprecated/…).
    // The served `statuses` vocabulary is ADR-only, so this group is decision-scoped.
    ...(statuses.length > 0
      ? [
          {
            type: "checkbox" as const,
            key: "status",
            label: FILTER_MESSAGES.sections.decisionStatus,
            selected: filterSidebarCheckedValues(statuses, selectedStatuses),
            onToggle: filterSidebarAllOnToggleHandler(
              "statuses",
              statuses,
              selectedStatuses,
              onSetFacetValues,
            ),
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
            selected: filterSidebarCheckedValues(planStates, selectedPlanStates),
            onToggle: filterSidebarAllOnToggleHandler(
              "plan_states",
              planStates,
              selectedPlanStates,
              onSetFacetValues,
            ),
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
            selected: filterSidebarCheckedValues(health, selectedHealth),
            onToggle: filterSidebarAllOnToggleHandler(
              "health",
              health,
              selectedHealth,
              onSetFacetValues,
            ),
            options: closedFilterOptions(health, filterHealthPresentation),
          },
        ]
      : []),
    // EDITED — the temporal window, two-way bound to the timeline through the ONE
    // canonical `date_range` (owner review [msacfd3s]). A preset here writes the
    // equivalent range through the TIMELINE's Setter seam, so the handles move; a
    // range the handles produced reads back here as "Custom range" with the two
    // explicit day inputs. Neither surface holds a second copy of the window.
    ...(date === undefined
      ? []
      : [
          {
            type: "date" as const,
            key: "edited",
            label: FILTER_MESSAGES.sections.edited,
            value: date.preset,
            onSelect: date.onSelectPreset,
            options: [
              { value: "any", label: FILTER_MESSAGES.edited.any },
              { value: "7d", label: FILTER_MESSAGES.edited["7d"] },
              { value: "30d", label: FILTER_MESSAGES.edited["30d"] },
              { value: "year", label: FILTER_MESSAGES.edited.year },
              { value: "custom", label: FILTER_MESSAGES.edited.custom },
            ],
            custom:
              date.preset === "custom" || date.customOpen
                ? {
                    from: date.from,
                    to: date.to,
                    min: date.min,
                    max: date.max,
                    fromLabel: FILTER_MESSAGES.editedRange.from,
                    toLabel: FILTER_MESSAGES.editedRange.to,
                    onChange: date.onSetRange,
                  }
                : null,
          },
        ]),
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

export function useFilterSidebarCustomDateOpen(): boolean {
  return useFilterSidebarStore(
    (state) => normalizeFilterSidebarOpen(state.customDateOpen) ?? false,
  );
}

export function setFilterSidebarCustomDateOpen(open: unknown): void {
  useFilterSidebarStore.getState().setCustomDateOpen(open);
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
