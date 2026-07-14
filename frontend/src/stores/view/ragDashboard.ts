// The rag job-dashboard view-local presentation state (rag-job-dashboard ADR D7).
// Sort key, phase facets, the two filter-text fields, the selected job (which
// joins the log pane), and the log lines window — all PRESENTATION state, bounded
// and non-persisted, in the `settingsDialog`/`controlPanels` view-store idiom.
//
// This is presentation, NOT a corpus filter: it never touches
// `dashboardState.filters` (filter-vs-presentation law). Every write goes through
// a boundary normalizer (unknown-tolerant, length-capped, enum-clamped); every
// selector returns raw, referentially-stable state (derive in useMemo at the
// consumer — never mint a fresh reference in a selector).

import { create } from "zustand";

import {
  RAG_JOB_PHASE_GROUPS,
  RAG_JOB_SORT_KEYS,
  type RagJobPhaseGroup,
  type RagJobSortKey,
} from "../server/ragDashboardView";

/** The discrete log-window choices the lines selector offers (ADR D4). */
// 500 is the engine broker's served ceiling (MAX_RAG_LOG_LINES); offering a
// larger choice would silently under-deliver (ADR constraint amended 2026-07-14).
export type RagLogLinesChoice = 50 | 200 | 500;
export const RAG_LOG_LINES_CHOICES: readonly RagLogLinesChoice[] = [50, 200, 500];
export const RAG_DASHBOARD_LINES_DEFAULT: RagLogLinesChoice = 200;

/** Max length of either filter-text field (bounded accumulator). */
export const RAG_DASHBOARD_FILTER_MAX_CHARS = 200;
/** Max length of a selected job id held in view state. */
export const RAG_DASHBOARD_JOB_ID_MAX_CHARS = 256;

const DEFAULT_SORT: RagJobSortKey = "recency";

export function normalizeRagJobSort(value: unknown): RagJobSortKey {
  return typeof value === "string" &&
    (RAG_JOB_SORT_KEYS as readonly string[]).includes(value)
    ? (value as RagJobSortKey)
    : DEFAULT_SORT;
}

export function normalizeRagPhaseFacet(value: unknown): RagJobPhaseGroup | null {
  return typeof value === "string" &&
    (RAG_JOB_PHASE_GROUPS as readonly string[]).includes(value)
    ? (value as RagJobPhaseGroup)
    : null;
}

/** Canonicalize a facet set: known groups only, deduped, in chip order (so the
 *  stored array is referentially comparable across equivalent sets). */
export function normalizeRagPhaseFacets(value: unknown): RagJobPhaseGroup[] {
  if (!Array.isArray(value)) return [];
  const present = new Set<RagJobPhaseGroup>();
  for (const entry of value) {
    const facet = normalizeRagPhaseFacet(entry);
    if (facet !== null) present.add(facet);
  }
  return RAG_JOB_PHASE_GROUPS.filter((g) => present.has(g));
}

export function normalizeRagDashboardFilterText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, RAG_DASHBOARD_FILTER_MAX_CHARS);
}

export function normalizeRagSelectedJobId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= RAG_DASHBOARD_JOB_ID_MAX_CHARS
    ? trimmed
    : null;
}

export function normalizeRagLogLinesChoice(value: unknown): RagLogLinesChoice {
  const parsed = typeof value === "number" ? value : Number(value);
  return (RAG_LOG_LINES_CHOICES as readonly number[]).includes(parsed)
    ? (parsed as RagLogLinesChoice)
    : RAG_DASHBOARD_LINES_DEFAULT;
}

function sameFacets(
  a: readonly RagJobPhaseGroup[],
  b: readonly RagJobPhaseGroup[],
): boolean {
  return a.length === b.length && a.every((g, i) => g === b[i]);
}

interface RagDashboardState {
  sort: RagJobSortKey;
  facets: RagJobPhaseGroup[];
  jobsFilter: string;
  logFilter: string;
  selectedJobId: string | null;
  lines: RagLogLinesChoice;
  setSort: (value: unknown) => void;
  toggleFacet: (value: unknown) => void;
  setFacets: (value: unknown) => void;
  setJobsFilter: (value: unknown) => void;
  setLogFilter: (value: unknown) => void;
  selectJob: (value: unknown) => void;
  setLines: (value: unknown) => void;
  reset: () => void;
}

const INITIAL: Pick<
  RagDashboardState,
  "sort" | "facets" | "jobsFilter" | "logFilter" | "selectedJobId" | "lines"
> = {
  sort: DEFAULT_SORT,
  facets: [],
  jobsFilter: "",
  logFilter: "",
  selectedJobId: null,
  lines: RAG_DASHBOARD_LINES_DEFAULT,
};

export const useRagDashboard = create<RagDashboardState>((set) => ({
  ...INITIAL,
  setSort: (value) =>
    set((state) => {
      const sort = normalizeRagJobSort(value);
      return state.sort === sort ? state : { sort };
    }),
  toggleFacet: (value) =>
    set((state) => {
      const facet = normalizeRagPhaseFacet(value);
      if (facet === null) return state;
      const next = state.facets.includes(facet)
        ? state.facets.filter((g) => g !== facet)
        : RAG_JOB_PHASE_GROUPS.filter((g) => g === facet || state.facets.includes(g));
      return sameFacets(state.facets, next) ? state : { facets: next };
    }),
  setFacets: (value) =>
    set((state) => {
      const facets = normalizeRagPhaseFacets(value);
      return sameFacets(state.facets, facets) ? state : { facets };
    }),
  setJobsFilter: (value) =>
    set((state) => {
      const jobsFilter = normalizeRagDashboardFilterText(value);
      return state.jobsFilter === jobsFilter ? state : { jobsFilter };
    }),
  setLogFilter: (value) =>
    set((state) => {
      const logFilter = normalizeRagDashboardFilterText(value);
      return state.logFilter === logFilter ? state : { logFilter };
    }),
  selectJob: (value) =>
    set((state) => {
      const selectedJobId = normalizeRagSelectedJobId(value);
      return state.selectedJobId === selectedJobId ? state : { selectedJobId };
    }),
  setLines: (value) =>
    set((state) => {
      const lines = normalizeRagLogLinesChoice(value);
      return state.lines === lines ? state : { lines };
    }),
  reset: () =>
    set((state) =>
      state.sort === INITIAL.sort &&
      state.facets.length === 0 &&
      state.jobsFilter === "" &&
      state.logFilter === "" &&
      state.selectedJobId === null &&
      state.lines === INITIAL.lines
        ? state
        : { ...INITIAL, facets: [] },
    ),
}));

// --- primitive/raw-ref selectors (derive in useMemo at the consumer) -----------

export function useRagDashboardSort(): RagJobSortKey {
  return useRagDashboard((state) => state.sort);
}

/** The raw facet array (referentially stable across equivalent sets). Consumers
 *  build a membership Set in useMemo keyed on this ref (stable-selectors). */
export function useRagDashboardFacets(): RagJobPhaseGroup[] {
  return useRagDashboard((state) => state.facets);
}

export function useRagDashboardJobsFilter(): string {
  return useRagDashboard((state) => state.jobsFilter);
}

export function useRagDashboardLogFilter(): string {
  return useRagDashboard((state) => state.logFilter);
}

export function useRagDashboardSelectedJob(): string | null {
  return useRagDashboard((state) => state.selectedJobId);
}

export function useRagDashboardLines(): RagLogLinesChoice {
  return useRagDashboard((state) => state.lines);
}

// --- imperative accessors (chrome dispatch, palette, keymap) -------------------

export function setRagDashboardSort(value: unknown): void {
  useRagDashboard.getState().setSort(value);
}

export function toggleRagDashboardFacet(value: unknown): void {
  useRagDashboard.getState().toggleFacet(value);
}

export function setRagDashboardJobsFilter(value: unknown): void {
  useRagDashboard.getState().setJobsFilter(value);
}

export function setRagDashboardLogFilter(value: unknown): void {
  useRagDashboard.getState().setLogFilter(value);
}

export function selectRagDashboardJob(value: unknown): void {
  useRagDashboard.getState().selectJob(value);
}

export function setRagDashboardLines(value: unknown): void {
  useRagDashboard.getState().setLines(value);
}

export function resetRagDashboard(): void {
  useRagDashboard.getState().reset();
}
