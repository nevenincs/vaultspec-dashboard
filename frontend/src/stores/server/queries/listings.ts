// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import {
  featureQueryMatches,
  featureQueryPlainText,
  featureTagDisplayName,
  type FeatureQuery,
} from "../../featureQuery";
import {
  DEFAULT_RAIL_SORT,
  type RailSortKey,
  type RailSortValue,
} from "../../view/railSort";
import {
  dashboardLineageFilterArg,
  normalizeDashboardGraphCorpus,
} from "../dashboardState";
import {
  engineClient,
  readTierAvailability,
  tiersFromQuery,
  type FileTreeEntry,
  type FileTreeResponse,
  type FiltersVocabulary,
  type GraphCorpus,
  type SettingsSchema,
  type SettingsState,
  type TierAvailability,
  type TiersBlock,
  type VaultTreeEntry,
  type VaultTreeResponse,
} from "../engine";
import { stemFromPath } from "../liveAdapters";
import { CONSUMED_SETTING_KEYS, resolveEffectiveSetting } from "../settingsSelectors";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDashboardState } from "./dashboard";
import { normalizeGraphSliceScope } from "./graph";
import { engineKeys, noopRetry, withManualRetry } from "./internal";
import { useSettings, useSettingsSchema } from "./settings";

export interface VaultTreeRequestIdentity {
  scope: string | null;
}

export function normalizeVaultTreeRequestIdentity(
  scope: unknown,
): VaultTreeRequestIdentity {
  return { scope: normalizeGraphSliceScope(scope) };
}

export function useVaultTree(scope: unknown) {
  const request = normalizeVaultTreeRequestIdentity(scope);
  const enabled = request.scope !== null;
  const queryClient = useQueryClient();
  const queryKey = engineKeys.vaultTree(request.scope ?? "");
  const query = useQuery({
    queryKey,
    // Progressive listing (universal-data-loading ADR D5): each accumulated
    // page prefix is written into THIS query's cache entry (`complete: false`)
    // so the rail paints the first page immediately; the resolved value — the
    // whole drained listing, `complete: true` — replaces it on settle. A
    // failed walk falls back to normal query-error semantics.
    queryFn: () =>
      engineClient.vaultTree(request.scope!, (partial) => {
        queryClient.setQueryData(queryKey, partial);
      }),
    enabled,
  });
  return withManualRetry(enabled ? query : { ...query, data: undefined });
}

export interface CodeFilesRequestIdentity {
  scope: string | null;
}

export function normalizeCodeFilesRequestIdentity(
  scope: unknown,
): CodeFilesRequestIdentity {
  return { scope: normalizeGraphSliceScope(scope) };
}

/** The complete code-file listing (search-providers ADR): the client walks the
 *  cursor to completion, so the files(code) provider holds the WHOLE set to
 *  narrow client-side (the complete-paginated-set rule). Bounded cache keyed on
 *  scope, mirroring `useVaultTree`; default gcTime bounds retention. */
export function useCodeFiles(scope: unknown) {
  const request = normalizeCodeFilesRequestIdentity(scope);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.codeFiles(request.scope ?? ""),
    queryFn: () => engineClient.codeFiles(request.scope!),
    enabled,
  });
  return withManualRetry(enabled ? query : { ...query, data: undefined });
}

/**
 * The vault-tree's degradation truth, derived inside the stores layer so chrome
 * never reads the raw `tiers` block (dashboard-layer-ownership). Contract §2: a
 * tier marked `available:false` OR absent from the block is a designed degraded
 * state — absence is degradation, not availability. The reasons the engine
 * attached travel through both the success envelope (`data.tiers`) and the
 * error envelope (`EngineError.tiers`, preserved by the transport) so a
 * backend-down condition surfaces as designed degradation rather than a bare
 * error. Returns `degraded` plus the per-tier reasons for copy-tone rendering;
 * the sidebar consumes this, never `tree.data.tiers`.
 */
export type VaultTreeAvailability = TierAvailability;
export type VaultTreeSurfaceState = "loading" | "error" | "ready";

// The vault tree LISTS DOCUMENTS, so its "are documents available" truth is the
// STRUCTURAL tier alone — that tier is what carries the document graph. A down
// `semantic` tier (rag search), a `declared` tier still "building", or an absent
// `temporal` tier do NOT make documents unavailable: with `structural` up, every
// document is present and listable. Reading ALL canonical tiers here made the rail
// cry "Some documents are temporarily unavailable" whenever semantic search was off
// — a false alarm, and inconsistent with the global/search surface, which correctly
// treats semantic-offline as a search-tier state, not a documents-gone condition.
// Semantic/temporal degradation is surfaced by THOSE features (search, timeline),
// not by the document list.
const VAULT_TREE_CONTENT_TIERS = ["structural"] as const;

export function deriveVaultTreeAvailability(
  tiers: TiersBlock | undefined,
): VaultTreeAvailability {
  return readTierAvailability(tiers, VAULT_TREE_CONTENT_TIERS);
}

export function deriveVaultTreeSurfaceState(
  query: Pick<UseQueryResult<VaultTreeResponse>, "isPending" | "isError">,
  availability: VaultTreeAvailability,
): VaultTreeSurfaceState {
  if (query.isPending) return "loading";
  if (query.isError && !availability.degraded) return "error";
  return "ready";
}

/** Stores hook: the vault-tree degradation, read through the wire client so the
 *  sidebar consumes derived truth instead of the raw `tiers` block. Reads the
 *  FRESH error envelope's tiers over a stale held-success block via
 *  `tiersFromQuery` (degradation-is-read-from-tiers-not-guessed-from-errors). */
export function useVaultTreeAvailability(scope: unknown): VaultTreeAvailability {
  return deriveVaultTreeAvailability(tiersFromQuery(useVaultTree(scope)));
}

export interface VaultTreeSurfaceView {
  tree: ReturnType<typeof useVaultTree>;
  availability: VaultTreeAvailability;
  state: VaultTreeSurfaceState;
  /** False while a progressive partial listing is held (the drain is still
   *  walking — universal-data-loading ADR D5): the rail renders its honest
   *  partial-narrow affordance until this flips true. */
  complete: boolean;
}

/**
 * Stores selector for the vault browser root surface. Degradation remains a
 * non-terminal banner for this surface, but the loading/error classification is
 * still stores-owned so the browser chrome does not branch on raw query flags.
 */
export function useVaultTreeSurface(scope: unknown): VaultTreeSurfaceView {
  const tree = useVaultTree(scope);
  const availability = deriveVaultTreeAvailability(tiersFromQuery(tree));
  return {
    tree,
    availability,
    state: deriveVaultTreeSurfaceState(tree, availability),
    // Absent flag (older cached shapes) reads as complete; only an explicit
    // in-flight partial (`complete: false`) triggers the partial affordance.
    complete: tree.data?.complete !== false,
  };
}

export interface VaultTreeDocTypeGroup {
  docType: string;
  entries: VaultTreeEntry[];
}

export interface VaultTreeFeatureGroup {
  /** The feature tag, without the leading `#`; untagged documents use `(untagged)`. */
  feature: string;
  /** Total document count across every doc-type group in this feature bucket. */
  count: number;
  /** Summed served byte weight of this feature's members (left-rail-tree-controls
   *  corpus-weight sort): 0 when no member carries a served size. A multi-tag
   *  document weighs into each of its features (shares need not sum to 100%). */
  weightBytes: number;
  /** Doc-type sub-groups, in canonical `.vault/` order then alphabetical. */
  docTypes: VaultTreeDocTypeGroup[];
}

export interface VaultTreeBrowserView {
  activeFilter: string;
  entries: VaultTreeEntry[];
  groups: VaultTreeFeatureGroup[];
  filteredToNothing: boolean;
}

// Pipeline reading order (terminology-standardization ADR D2); `index` is never a
// displayed group (ADR D5), so it is omitted here and the feature projection skips
// index entries outright.
const VAULT_TREE_DOC_TYPE_ORDER = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
] as const;

function vaultTreeDocTypeOrder(present: Iterable<string>): string[] {
  const presentSet = new Set(present);
  const order: string[] = [...VAULT_TREE_DOC_TYPE_ORDER];
  for (const extra of [...presentSet].sort()) {
    if (!order.includes(extra)) order.push(extra);
  }
  return order.filter((docType) => presentSet.has(docType));
}

export function projectVaultTreeFeatureGroups(
  entries: readonly VaultTreeEntry[],
  sort: RailSortValue = DEFAULT_RAIL_SORT,
): VaultTreeFeatureGroup[] {
  const UNTAGGED = "(untagged)";
  const byFeature = new Map<string, Map<string, VaultTreeEntry[]>>();
  for (const entry of entries) {
    // `index` is never a displayed node (terminology-standardization ADR D5): a
    // generated feature index must not appear inside a feature's category sub-groups.
    if (entry.doc_type === "index") continue;
    const features = entry.feature_tags.length > 0 ? entry.feature_tags : [UNTAGGED];
    for (const feature of features) {
      let docMap = byFeature.get(feature);
      if (!docMap) {
        docMap = new Map();
        byFeature.set(feature, docMap);
      }
      const list = docMap.get(entry.doc_type) ?? [];
      list.push(entry);
      docMap.set(entry.doc_type, list);
    }
  }

  const groups: VaultTreeFeatureGroup[] = [];
  for (const [feature, docMap] of byFeature) {
    const docTypes = vaultTreeDocTypeOrder(docMap.keys()).map((docType) => ({
      docType,
      entries: docMap
        .get(docType)!
        .slice()
        .sort((a, b) =>
          // The historical sub-folder order is path-ascending (chronological by
          // the date-stamped stem); a chosen sort key reorders it through the
          // ONE comparator (ADR D3 — one sort concept for the whole tree).
          sort.key === "recency" || sort.key === "docs"
            ? (sort.direction === "desc" ? 1 : -1) * a.path.localeCompare(b.path)
            : compareVaultEntriesBySort(sort, a, b),
        ),
    }));
    const count = docTypes.reduce((n, group) => n + group.entries.length, 0);
    const weightBytes = docTypes.reduce(
      (n, group) =>
        n + group.entries.reduce((m, entry) => m + (entry.size?.bytes ?? 0), 0),
      0,
    );
    groups.push({ feature, count, weightBytes, docTypes });
  }
  return groups;
}

export function filterVaultTreeEntries(
  entries: readonly VaultTreeEntry[],
  filter: string,
): VaultTreeEntry[] {
  const q = filter.trim().toLowerCase();
  if (q.length === 0) return [...entries];
  return entries.filter(
    (entry) =>
      stemFromPath(entry.path).toLowerCase().includes(q) ||
      entry.path.toLowerCase().includes(q) ||
      entry.feature_tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

export function deriveVaultTreeBrowserView(
  entries: readonly VaultTreeEntry[],
  filter: string,
): VaultTreeBrowserView {
  const activeFilter = filter.trim();
  const filteredEntries = filterVaultTreeEntries(entries, activeFilter);
  return {
    activeFilter,
    entries: filteredEntries,
    groups: projectVaultTreeFeatureGroups(filteredEntries),
    filteredToNothing: activeFilter.length > 0 && filteredEntries.length === 0,
  };
}

// --- editor linking corpus (document-editor-redesign ADR) ------------------------
//
// The pickable corpus for the document editor's Related and Feature link pickers:
// the existing vault documents (stem + human title + first feature tag) and the
// existing feature-tag vocabulary. Both derive from the ALREADY-served
// `/vault-tree` listing, so the editor stays app/ leaf chrome that fetches nothing
// (dashboard-layer-ownership): the picker reads THIS selector, never the wire.
// Bounded by the vault tree's server ceiling; the combobox narrows this bounded
// slice client-side. Index documents are already excluded from `/vault-tree` rows
// (terminology-standardization ADR D5), so they never surface as link targets.

export interface EditorCorpusDocument {
  /** The document stem (`doc:` id tail) — the value persisted into `related`. */
  stem: string;
  /** The document's H1 title when the row carries one, else the stem. */
  title: string;
  /** The document's first feature tag (bare, no `#`), for the picker row's
   *  category dot; null when the document carries no feature tag. */
  feature: string | null;
}

export interface EditorLinkingCorpus {
  documents: readonly EditorCorpusDocument[];
  /** The distinct feature-tag vocabulary (bare, no `#`), sorted for stable rows. */
  featureTags: readonly string[];
}

export function deriveEditorLinkingCorpus(
  entries: readonly VaultTreeEntry[],
): EditorLinkingCorpus {
  const documents: EditorCorpusDocument[] = entries.map((entry) => {
    const stem = stemFromPath(entry.path);
    return { stem, title: entry.title ?? stem, feature: entry.feature_tags[0] ?? null };
  });
  const featureTags = Array.from(
    new Set(entries.flatMap((entry) => entry.feature_tags)),
  ).sort((a, b) => a.localeCompare(b));
  return { documents, featureTags };
}

/** Stores selector: the editor's link-picker corpus, derived in a useMemo over the
 *  raw vault-tree slice (store-selector law — never derived inside a selector). The
 *  corpus is empty until the tree resolves; the picker degrades to free entry. */
export function useEditorLinkingCorpus(scope: unknown): EditorLinkingCorpus {
  const entries = useVaultTree(scope).data?.entries;
  return useMemo(() => deriveEditorLinkingCorpus(entries ?? []), [entries]);
}

// --- left-rail Vault tab projections (binding `LeftRail` 238:600) -----------------
//
// The Vault tab renders TWO parallel collapsible sections over the SAME
// `/vault-tree` projection (views-are-projections-of-one-model): a FEATURES index
// (feature → its documents) and a doc-type-first DOCUMENTS tree (ADRs / Audits /
// Execution / Plans / References / Research → documents), each leaf a DocRow that
// carries the human title + date + status. Both are narrowed by ONE facet pass —
// the canonical left-rail filter (feature text, doc types, statuses, feature tags,
// date range) — so the rail tree agrees with the graph it filters (left-rail-top
// ADR D5). No engine work and no new wire field: `status`, `dates`, `doc_type`,
// and `feature_tags` are already on the `VaultTreeEntry` the projection reads.

/** Doc-type-first display order for the Documents section — the pipeline reading
 *  order (terminology-standardization ADR D2): Research · Decisions · Plans · Steps
 *  · Audits · References. `index` is hidden (the rail mirrors `.vault/` EXCEPT the
 *  generated index, ADR D5); unknown types append alphabetically. */
const VAULT_RAIL_DOC_TYPE_ORDER = [
  "research",
  "adr",
  "plan",
  "exec",
  "audit",
  "reference",
] as const;

export interface VaultDocTypeGroup {
  docType: string;
  count: number;
  /** Member documents, newest-modified first (the board lists recent ADRs top). */
  entries: VaultTreeEntry[];
}

/** Newest-modified first; ties broken by path for a stable order. */
function compareVaultRecency(a: VaultTreeEntry, b: VaultTreeEntry): number {
  const am = a.dates.modified ?? "";
  const bm = b.dates.modified ?? "";
  if (am !== bm) return am < bm ? 1 : -1;
  return a.path.localeCompare(b.path);
}

/** A document's sortable field for a non-recency sort key (left-rail-tree-
 *  controls ADR D3): the served H1 title (falling back to the stem) for `name`,
 *  the day-granular ISO date for `created`/`modified`, the served word count for
 *  `size`. `null` = the fact is absent — an absent fact sorts LAST regardless of
 *  direction (honest absence never floats to the top). */
function vaultEntrySortField(
  entry: VaultTreeEntry,
  key: RailSortKey,
): string | number | null {
  switch (key) {
    case "name":
      return (entry.title ?? stemFromPath(entry.path)).toLowerCase();
    case "created":
      return entry.dates.created ?? null;
    case "modified":
      return entry.dates.modified ?? null;
    case "size":
      return entry.size?.words ?? null;
    case "weight":
      return entry.size?.bytes ?? null;
    case "recency":
    case "docs":
      return null;
  }
}

/** The ONE document comparator the whole vault tree sorts by (ADR D3): `recency`
 *  is the historical newest-modified-first order (direction flips it); every
 *  other key compares its field with absent-last, path tiebreak. */
export function compareVaultEntriesBySort(
  sort: RailSortValue,
  a: VaultTreeEntry,
  b: VaultTreeEntry,
): number {
  // `docs` is a FOLDER-count order — a document list has no per-item count, so
  // its leaves keep the historical recency order (direction still applies).
  if (sort.key === "recency" || sort.key === "docs") {
    const cmp = compareVaultRecency(a, b);
    return sort.direction === "desc" ? cmp : -cmp;
  }
  const av = vaultEntrySortField(a, sort.key);
  const bv = vaultEntrySortField(b, sort.key);
  if (av === null && bv === null) return a.path.localeCompare(b.path);
  if (av === null) return 1;
  if (bv === null) return -1;
  const cmp =
    typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
  if (cmp === 0) return a.path.localeCompare(b.path);
  return sort.direction === "asc" ? cmp : -cmp;
}

/** Group vault entries by doc type (the Documents section), excluding `index`.
 *  Member order follows the rail sort plane; the default is the historical
 *  newest-modified-first. */
export function projectVaultDocTypeGroups(
  entries: readonly VaultTreeEntry[],
  sort: RailSortValue = DEFAULT_RAIL_SORT,
): VaultDocTypeGroup[] {
  const byType = new Map<string, VaultTreeEntry[]>();
  for (const entry of entries) {
    if (entry.doc_type === "index") continue;
    const list = byType.get(entry.doc_type) ?? [];
    list.push(entry);
    byType.set(entry.doc_type, list);
  }
  const order: string[] = [...VAULT_RAIL_DOC_TYPE_ORDER];
  for (const extra of [...byType.keys()].sort()) {
    if (extra !== "index" && !order.includes(extra)) order.push(extra);
  }
  return order
    .filter((docType) => byType.has(docType))
    .map((docType) => {
      const list = byType
        .get(docType)!
        .slice()
        .sort((a, b) => compareVaultEntriesBySort(sort, a, b));
      return { docType, count: list.length, entries: list };
    });
}

/** The canonical left-rail filter facets, read from `dashboardState.filters`
 *  (+ `date_range`). `featureQuery` is the rail's primary "filter by feature"
 *  control — the backend feature filter (glob/regex over feature_tags) the rail's
 *  feature search bar authors; the rail applies it client-side so it agrees with
 *  the graph the same filter narrows. */
export interface VaultRailFacets {
  featureQuery: FeatureQuery | null;
  docTypes: string[];
  statuses: string[];
  featureTags: string[];
  dateRange: { from?: string; to?: string };
  /** The active date criterion the `date_range` applies to (Issue #14/#38) — the
   *  SAME field the timeline and the engine narrow by. "created" is the default. */
  dateField: "created" | "modified" | "stamped";
}

/** Apply the canonical facet filters to the vault listing (D5): the rail tree
 *  honours the feature query, doc types, statuses, feature tags, and the edited
 *  date range — so it agrees with the graph the same filter narrows. The feature
 *  query is matched against each entry's RAW feature tags AND their sanitized
 *  display names, so a query narrows by either the hyphenated tag or the readable
 *  name (the dual-match the search bar's autofill also uses). */
export function narrowVaultRailEntries(
  entries: readonly VaultTreeEntry[],
  facets: VaultRailFacets,
): VaultTreeEntry[] {
  const { featureQuery, docTypes, statuses, featureTags, dateField } = facets;
  const { from, to } = facets.dateRange;
  return entries.filter((entry) => {
    if (featureQuery) {
      const candidates = entry.feature_tags.flatMap((tag) => [
        tag,
        featureTagDisplayName(tag),
      ]);
      if (!featureQueryMatches(featureQuery, candidates)) return false;
    }
    if (docTypes.length > 0 && !docTypes.includes(entry.doc_type)) return false;
    if (
      statuses.length > 0 &&
      !(entry.status !== undefined && statuses.includes(entry.status))
    ) {
      return false;
    }
    if (
      featureTags.length > 0 &&
      !entry.feature_tags.some((tag) => featureTags.includes(tag))
    ) {
      return false;
    }
    if (from || to) {
      // Compare the entry's ACTIVE-criterion date (created/modified/stamped) — the
      // SAME field the timeline + engine narrow by — against the day-granular ISO
      // bounds (Issue #38). Both sides are normalized to "YYYY-MM-DD", so a string
      // compare is chronological. An entry is excluded only when it lacks THAT
      // field (it cannot fall in range), never because a different/absent field is
      // missing — and after adaptation every entry carries all three dates.
      const value = entry.dates[dateField];
      if (value === undefined) return false;
      if (from && value < from) return false;
      if (to && value > to) return false;
    }
    return true;
  });
}

export interface VaultRailView {
  /** The FEATURES section: feature → its documents (DocRows), most-active first. */
  featureGroups: VaultTreeFeatureGroup[];
  /** The DOCUMENTS section: doc-type folders → documents (DocRows). */
  docTypeGroups: VaultDocTypeGroup[];
  featureCount: number;
  docTypeCount: number;
  /** A facet was active but narrowed everything away (vs. an empty corpus). */
  filteredToNothing: boolean;
  /** Total served byte weight of the WHOLE (unfiltered) vault listing — the
   *  corpus-weight share denominator, so a feature's share stays stable while a
   *  filter narrows the visible set. 0 when no entry carries a size. */
  totalCorpusBytes: number;
}

/** A feature folder's sortable aggregate for a non-recency key (ADR D3): its
 *  name, its newest member date, or its summed member word count. `null` =
 *  no member carries the fact — the folder sorts last. */
function featureGroupSortField(
  group: VaultTreeFeatureGroup,
  key: RailSortKey,
): string | number | null {
  if (key === "name") return group.feature.toLowerCase();
  if (key === "weight") return group.weightBytes > 0 ? group.weightBytes : null;
  let maxDate: string | null = null;
  let words: number | null = null;
  for (const sub of group.docTypes) {
    for (const entry of sub.entries) {
      if (key === "size" && entry.size) words = (words ?? 0) + entry.size.words;
      if (key === "created" || key === "modified") {
        const value = entry.dates[key];
        if (value !== undefined && (maxDate === null || value > maxDate)) {
          maxDate = value;
        }
      }
    }
  }
  return key === "size" ? words : maxDate;
}

/** Derive the whole Vault-tab view from the entries + the canonical facets,
 *  ordered by the ONE rail sort plane (left-rail-tree-controls ADR D3). The
 *  default is the historical order byte-for-byte: features most-active first,
 *  documents newest-modified first. */
export function deriveVaultRailView(
  entries: readonly VaultTreeEntry[],
  facets: VaultRailFacets,
  sort: RailSortValue = DEFAULT_RAIL_SORT,
): VaultRailView {
  const narrowed = narrowVaultRailEntries(entries, facets);
  const featureGroups = projectVaultTreeFeatureGroups(narrowed, sort).sort((a, b) => {
    if (sort.key === "recency" || sort.key === "docs") {
      const cmp = b.count - a.count;
      if (cmp !== 0) return sort.direction === "desc" ? cmp : -cmp;
      return a.feature.localeCompare(b.feature);
    }
    const av = featureGroupSortField(a, sort.key);
    const bv = featureGroupSortField(b, sort.key);
    if (av === null && bv === null) return a.feature.localeCompare(b.feature);
    if (av === null) return 1;
    if (bv === null) return -1;
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    if (cmp === 0) return a.feature.localeCompare(b.feature);
    return sort.direction === "asc" ? cmp : -cmp;
  });
  const docTypeGroups = projectVaultDocTypeGroups(narrowed, sort);
  const anyFacet =
    facets.featureQuery !== null ||
    facets.docTypes.length > 0 ||
    facets.statuses.length > 0 ||
    facets.featureTags.length > 0 ||
    Boolean(facets.dateRange.from) ||
    Boolean(facets.dateRange.to);
  return {
    featureGroups,
    docTypeGroups,
    featureCount: featureGroups.length,
    docTypeCount: docTypeGroups.length,
    filteredToNothing: anyFacet && narrowed.length === 0,
    totalCorpusBytes: entries.reduce((n, entry) => n + (entry.size?.bytes ?? 0), 0),
  };
}

/** Stores selector for the canonical left-rail facets. The rail reads the SAME
 *  `dashboardState.filters` the graph filter authors (no second source of truth),
 *  so the Vault tree and the graph narrow identically (dashboard-layer-ownership,
 *  filtering-has-one-canonical-surface). */
export function useVaultRailFacets(scope: unknown): VaultRailFacets {
  const dashboardState = useDashboardState(scope);
  // The rail narrows by the SAME date field the timeline + engine use: the active
  // criterion when the engine advertises it (capability gate), else the "created"
  // default the engine applies (Issue #14/#38). A primitive — stable-selector safe.
  const { criterion, served } = useTimelineDateCriterion(scope);
  const dateField = served ? criterion : "created";
  return useMemo(() => {
    const filters = dashboardState.data?.filters;
    return {
      featureQuery: filters?.feature_query ?? null,
      docTypes: filters?.doc_types ?? [],
      statuses: filters?.statuses ?? [],
      featureTags: filters?.feature_tags ?? [],
      dateRange: dashboardState.data?.date_range ?? {},
      dateField,
    };
  }, [dashboardState.data, dateField]);
}

/** The canonical facet filter serialized for the timeline's lineage read
 *  (unified-filter-plane D3): the timeline narrows by the SAME
 *  `dashboardState.filters` the rail authors and the graph consumes, so a feature
 *  filter set in the rail (or a category toggled on the graph) narrows the
 *  timeline too. Returns `undefined` when no facet is active. Selects the raw,
 *  stable filters slice and derives the string in `useMemo` — never inside the
 *  selector (stable-selectors). The date range is excluded by
 *  `dashboardLineageFilterArg`; the timeline owns its own date axis. */
export function useTimelineLineageFilterArg(scope: unknown): string | undefined {
  const dashboardState = useDashboardState(scope);
  const filters = dashboardState.data?.filters;
  const { criterion, served } = useTimelineDateCriterion(scope);
  // The active date criterion rides as the `date_field` facet so the timeline
  // narrows by the SAME field the graph does (Issue #14). Only sent for a
  // non-default criterion AND only when the engine advertises it (capability gate),
  // so an older engine — which rejects unknown filter fields — never receives it.
  const dateField = served && criterion !== "created" ? criterion : undefined;
  return useMemo(
    () => (filters ? dashboardLineageFilterArg({ filters }, dateField) : undefined),
    [filters, dateField],
  );
}

export type TimelineDateCriterion = "created" | "modified" | "stamped";

export interface TimelineDateCriterionView {
  /** The active date field (`created` default). */
  criterion: TimelineDateCriterion;
  /** Whether the engine serves the `timeline_date_criterion` setting — the
   *  capability gate for enabling Modified/Stamped + sending `date_field`. */
  served: boolean;
}

export function deriveTimelineDateCriterion(
  schema: SettingsSchema | undefined,
  settings: SettingsState | undefined,
  activeScope: unknown,
): TimelineDateCriterionView {
  const eff = resolveEffectiveSetting(
    schema,
    settings,
    activeScope,
    CONSUMED_SETTING_KEYS.timelineDateCriterion,
  );
  const value = eff?.value;
  const criterion: TimelineDateCriterion =
    value === "modified" || value === "stamped" ? value : "created";
  return { criterion, served: eff !== null };
}

/** The active timeline date criterion, read from the engine-served
 *  `timeline_date_criterion` setting (schema-driven persistence, Issue #14). */
export function useTimelineDateCriterion(scope: unknown): TimelineDateCriterionView {
  const schema = useSettingsSchema();
  const settings = useSettings();
  return useMemo(
    () => deriveTimelineDateCriterion(schema.data, settings.data, scope),
    [schema.data, settings.data, scope],
  );
}

/** A plain narrow string for the Files tree (which can only narrow paths by text):
 *  the canonical feature query stripped of its glob/regex grammar down to the
 *  literal a path match can use. The Vault tree narrows by the feature query
 *  proper; the Files tree shares the SAME canonical control through this reduction
 *  so one bar narrows both tabs. */
export function useVaultFilesNarrowText(scope: unknown): string {
  const dashboardState = useDashboardState(scope);
  return useMemo(
    () => featureQueryPlainText(dashboardState.data?.filters.feature_query),
    [dashboardState.data?.filters.feature_query],
  );
}

// --- code (worktree) file tree (dashboard-code-tree ADR) -------------------------
//
// The read-only codebase file-tree browser's wire seam, consumed through these
// stores hooks so the CodeTree (chrome) never fetches the engine or reads the raw
// `tiers` block (dashboard-layer-ownership). The tree is fetched ONE directory
// level at a time: `useFileTree(scope, path)` reads the children of `path`
// (absent = the worktree root), so the rail expands a directory lazily on
// interaction and each level is its own (scope, path)-keyed cache entry — the
// rail never requests the whole tree (the bounded-read discipline,
// graph-queries-are-bounded-by-default). `enabled` is gated on a non-null scope
// AND, for a non-root level, on the level being requested (the directory was
// expanded), mirroring `useNodeNeighbors`'s lazy-on-id pattern.

export interface FileTreeRequestIdentity {
  scope: string | null;
  path: string | undefined;
  enabled: boolean;
}

export function normalizeFileTreeRequestIdentity(
  scope: unknown,
  path: unknown = undefined,
  enabled: unknown = true,
): FileTreeRequestIdentity {
  const normalizedPath =
    path === undefined || path === null
      ? undefined
      : typeof path === "string"
        ? path.trim() || undefined
        : null;
  return {
    scope: normalizeGraphSliceScope(scope),
    path: normalizedPath ?? undefined,
    enabled: normalizedPath !== null && enabled === true,
  };
}

export function useFileTree(scope: unknown, path?: unknown, enabled: unknown = true) {
  const request = normalizeFileTreeRequestIdentity(scope, path, enabled);
  const active = request.scope !== null && request.enabled;
  const query = useQuery({
    queryKey: engineKeys.fileTree(request.scope ?? "", request.path),
    queryFn: () => engineClient.fileTree({ scope: request.scope!, path: request.path }),
    enabled: active,
  });
  return withManualRetry(active ? query : { ...query, data: undefined });
}

/**
 * The file-tree's degradation truth, derived inside the stores layer so the code
 * mode (chrome) never reads the raw `tiers` block (dashboard-layer-ownership /
 * dashboard-code-tree ADR "States"). The code tree is a WORKTREE-ONLY capability
 * resolved by the engine's STRUCTURAL read of the working tree, so the
 * `structural` tier gates the code mode's availability: a remote-ref scope (no
 * working tree) or a scope whose structural tier is absent renders the code mode
 * as a designed degraded state, distinct from empty. Contract §2: a tier marked
 * `available:false` OR absent from a served block is degradation (absence is
 * degradation, not availability). The reason travels through both the success
 * envelope (`data.tiers`) and the error envelope (`EngineError.tiers`). Mirrors
 * `useVaultTreeAvailability`, scoped to the structural tier.
 */
export type FileTreeAvailability = TierAvailability;

const FILE_TREE_TIERS = ["structural"] as const;
export type FileTreeRootSurfaceState = "loading" | "error" | "degraded" | "ready";

export function deriveFileTreeAvailability(
  tiers: TiersBlock | undefined,
): FileTreeAvailability {
  return readTierAvailability(tiers, FILE_TREE_TIERS);
}

export function deriveFileTreeRootSurfaceState(
  query: Pick<UseQueryResult<FileTreeResponse>, "isPending" | "isError">,
  availability: FileTreeAvailability,
): FileTreeRootSurfaceState {
  if (query.isPending) return "loading";
  if (query.isError && !availability.degraded) return "error";
  if (availability.degraded) return "degraded";
  return "ready";
}

export type FileTreeLevelState = "loading" | "error" | "empty" | "ready";

export interface FileTreeRowView {
  entry: FileTreeEntry;
  /** Final path segment rendered by the code browser row. */
  displayName: string;
}

export interface FileTreeLevelView {
  state: FileTreeLevelState;
  entries: FileTreeEntry[];
  /** Render-ready rows so app chrome does not parse file paths. */
  rows: FileTreeRowView[];
  truncated: FileTreeResponse["truncated"];
  retry: () => void;
}

function fileTreeEntryDisplayName(path: string): string {
  return path.replace(/\/+$/, "").replace(/^.*\//, "");
}

export function fileTreeChildStatusStyle(depth: number): { paddingLeft: string } {
  return { paddingLeft: `${0.25 + depth * 0.75}rem` };
}

export function deriveFileTreeLevelView(
  data: FileTreeResponse | undefined,
  loading: boolean,
  errored: boolean,
  retry: () => void = noopRetry,
): FileTreeLevelView {
  if (loading) {
    return { state: "loading", entries: [], rows: [], truncated: null, retry };
  }
  if (errored) {
    return { state: "error", entries: [], rows: [], truncated: null, retry };
  }
  const entries = data?.entries ?? [];
  const rows = entries.map((entry) => ({
    entry,
    displayName: fileTreeEntryDisplayName(entry.path),
  }));
  return {
    state: entries.length === 0 ? "empty" : "ready",
    entries,
    rows,
    truncated: data?.truncated ?? null,
    retry,
  };
}

/** Stores selector for one file-tree directory level. */
export function useFileTreeLevel(
  scope: unknown,
  path?: unknown,
  enabled: unknown = true,
): FileTreeLevelView {
  const level = useFileTree(scope, path, enabled);
  return useMemo(
    () =>
      deriveFileTreeLevelView(level.data, level.isPending, level.isError, level.retry),
    [level.data, level.isError, level.isPending, level.retry],
  );
}

/** Stores hook: the file-tree degradation for the worktree ROOT level, read
 *  through the wire client so the code mode consumes derived truth instead of the
 *  raw `tiers` block. The root level's tiers gate the whole code mode (a
 *  worktree-only capability); per-directory expansions inherit that availability. */
export function useFileTreeAvailability(scope: unknown): FileTreeAvailability {
  return deriveFileTreeAvailability(tiersFromQuery(useFileTree(scope)));
}

export interface FileTreeRootSurfaceView {
  rootLevel: FileTreeLevelView;
  state: FileTreeRootSurfaceState;
}

export function deriveFileTreeRootSurfaceView(
  data: FileTreeResponse | undefined,
  isPending: boolean,
  isError: boolean,
  retry: () => void,
  tiers: TiersBlock | undefined,
): FileTreeRootSurfaceView {
  const availability = deriveFileTreeAvailability(tiers);
  return {
    rootLevel: deriveFileTreeLevelView(data, isPending, isError, retry),
    state: deriveFileTreeRootSurfaceState({ isPending, isError }, availability),
  };
}

/**
 * Stores selector for the code browser root surface. Unlike the vault browser,
 * file-tree structural degradation is terminal for code mode: a remote/bare
 * scope has no worktree directory hierarchy to render.
 */
export function useFileTreeRootSurface(scope: unknown): FileTreeRootSurfaceView {
  const rootQuery = useFileTree(scope);
  return deriveFileTreeRootSurfaceView(
    rootQuery.data,
    rootQuery.isPending,
    rootQuery.isError,
    rootQuery.retry,
    tiersFromQuery(rootQuery),
  );
}

export interface FiltersVocabularyRequestIdentity {
  scope: string | null;
  /** The corpus whose facet vocabulary is served (codebase-graphing ADR D5 —
   *  `/filters` serves the ACTIVE corpus only; the code corpus carries its own
   *  mtime date span per the code-timeline-range ADR). */
  corpus: GraphCorpus;
}

export function normalizeFiltersVocabularyRequestIdentity(
  scope: unknown,
  corpus?: unknown,
): FiltersVocabularyRequestIdentity {
  return {
    scope: normalizeGraphSliceScope(scope),
    corpus: normalizeDashboardGraphCorpus(corpus),
  };
}

export function useFiltersVocabulary(scope: unknown, corpus?: unknown) {
  const request = normalizeFiltersVocabularyRequestIdentity(scope, corpus);
  const enabled = request.scope !== null;
  const query = useQuery({
    queryKey: engineKeys.filters(request.scope ?? "", request.corpus),
    queryFn: () => engineClient.filters(request.scope!, request.corpus),
    enabled,
  });
  return enabled ? query : { ...query, data: undefined };
}

export interface FiltersVocabularyView {
  vocabulary: FiltersVocabulary | undefined;
  /** The enabled vocabulary query is in flight. */
  loading: boolean;
  /** Facet controls should show loading instead of "none in corpus". */
  facetsLoading: boolean;
  docTypes: string[];
  featureTags: string[];
  /** STATUS lifecycle vocabulary (ADR adjectives + plan meta-states). */
  statuses: string[];
  /** PLAN STATUS lifecycle vocabulary (active/complete), engine-served. */
  planStates: string[];
  /** HEALTH validity vocabulary (dangling/orphaned, present-in-corpus). */
  health: string[];
  dateBounds: FiltersVocabulary["date_bounds"];
  /** Per-criterion corpus spans (Issue #14): the timeline's edges for each date
   *  field. Present only on an engine that serves it (the Modified/Stamped gate). */
  dateBoundsByField: FiltersVocabulary["date_bounds_by_field"];
}

export function deriveFiltersVocabularyView(
  vocabulary: FiltersVocabulary | undefined,
  loading: boolean,
  awaitingScope: boolean,
): FiltersVocabularyView {
  return {
    vocabulary,
    loading,
    facetsLoading: awaitingScope || loading,
    docTypes: vocabulary?.doc_types ?? [],
    featureTags: vocabulary?.feature_tags ?? [],
    statuses: vocabulary?.statuses ?? [],
    planStates: vocabulary?.plan_states ?? [],
    health: vocabulary?.health ?? [],
    dateBounds: vocabulary?.date_bounds,
    dateBoundsByField: vocabulary?.date_bounds_by_field,
  };
}

/**
 * Stores selector for filter-vocabulary UI consumers. It prepares the data-driven
 * facet lists and loading semantics once so palette/sidebar chrome does not
 * branch on raw query flags or repeat optional field fallbacks.
 */
export function useFiltersVocabularyView(
  scope: unknown,
  corpus?: unknown,
): FiltersVocabularyView {
  const request = normalizeFiltersVocabularyRequestIdentity(scope, corpus);
  const query = useFiltersVocabulary(scope, corpus);
  const loading = request.scope !== null && query.isPending;
  const awaitingScope = request.scope === null;
  return useMemo(
    () => deriveFiltersVocabularyView(query.data, loading, awaitingScope),
    [query.data, loading, awaitingScope],
  );
}
