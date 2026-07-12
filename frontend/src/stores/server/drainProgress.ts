// Drain-progress slice (universal-data-loading ADR D3): the ONLY place the
// wire client's multi-page cursor walks (`vaultTree`, `codeFiles`) report
// their per-page progress. The walks run to completion INSIDE one queryFn, so
// without this seam the largest payloads in the product are invisible to any
// loading affordance — TanStack sees one opaque in-flight promise. The
// data-activity projection (ADR D1) reads this slice to render a determinate
// "N rows" indicator; nothing else consumes it directly.
//
// Bounded at creation (resource-bounds): the entry map is capped at
// MAX_DRAIN_ENTRIES (oldest evicted first — in practice at most a couple of
// drains run concurrently), every entry is a fixed-size scalar record, and
// entries are DELETED on settle or error, so the slice holds state only while
// a drain is genuinely in flight. Write access is plain functions (no React)
// so the wire client can call the seam without importing chrome or hooks.

import { create } from "zustand";

/** One in-flight cursor walk's progress. `rowsLoaded` is honest-so-far; the
 *  walk cannot know its total up front, so the view renders "N…" (at least N),
 *  never a fabricated percentage. */
export interface DrainProgressEntry {
  /** Pages fetched so far (1-based after the first page lands). */
  pagesLoaded: number;
  /** Rows accumulated across the fetched pages. */
  rowsLoaded: number;
}

export interface DrainProgressState {
  /** In-flight drains keyed by listing id (e.g. `vault-tree:<scope>`). */
  drains: Record<string, DrainProgressEntry>;
  report: (id: unknown, pagesLoaded: unknown, rowsLoaded: unknown) => void;
  settle: (id: unknown) => void;
  reset: () => void;
}

/** Cap on concurrently-tracked drains (bounded-by-default). Two listing walks
 *  exist today; the headroom absorbs new listings without unbounded growth. */
export const MAX_DRAIN_ENTRIES = 8;

function normalizeDrainId(id: unknown): string | null {
  return typeof id === "string" && id.length > 0 ? id : null;
}

function normalizeDrainCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

export const useDrainProgressStore = create<DrainProgressState>((set) => ({
  drains: {},
  report: (id, pagesLoaded, rowsLoaded) =>
    set((state) => {
      const drainId = normalizeDrainId(id);
      const pages = normalizeDrainCount(pagesLoaded);
      const rows = normalizeDrainCount(rowsLoaded);
      if (drainId === null || pages === null || rows === null) return state;
      const drains = { ...state.drains };
      // Evict the oldest entry when a NEW id would exceed the cap (insertion
      // order is the Record's key order; drains are few and short-lived).
      if (!(drainId in drains)) {
        const keys = Object.keys(drains);
        if (keys.length >= MAX_DRAIN_ENTRIES) delete drains[keys[0]];
      }
      drains[drainId] = { pagesLoaded: pages, rowsLoaded: rows };
      return { drains };
    }),
  settle: (id) =>
    set((state) => {
      const drainId = normalizeDrainId(id);
      if (drainId === null || !(drainId in state.drains)) return state;
      const drains = { ...state.drains };
      delete drains[drainId];
      return { drains };
    }),
  reset: () => set({ drains: {} }),
}));

/** Wire-client seam: report a walk's progress after each fetched page. */
export function reportDrainProgress(
  id: unknown,
  pagesLoaded: unknown,
  rowsLoaded: unknown,
): void {
  useDrainProgressStore.getState().report(id, pagesLoaded, rowsLoaded);
}

/** Wire-client seam: the walk settled (success OR error) — drop its entry. */
export function settleDrainProgress(id: unknown): void {
  useDrainProgressStore.getState().settle(id);
}

export function resetDrainProgress(): void {
  useDrainProgressStore.getState().reset();
}

/** The rolled-up determinate progress across every in-flight drain, or null
 *  when none is active. Pure over the raw slice so the activity view derives
 *  it in a `useMemo` (stable-selectors: the hook returns the RAW record). */
export function rollupDrainProgress(
  drains: Record<string, DrainProgressEntry>,
): { rowsLoaded: number; drainCount: number } | null {
  const ids = Object.keys(drains);
  if (ids.length === 0) return null;
  let rowsLoaded = 0;
  for (const id of ids) rowsLoaded += drains[id].rowsLoaded;
  return { rowsLoaded, drainCount: ids.length };
}
