// The ONE data-activity projection (universal-data-loading ADR D1): the
// stores-owned truth for "data is moving", aggregating TanStack's fetch and
// mutation counts, the drain-progress slice (the multi-page listing walks,
// ADR D3), and nothing else. Chrome renders this view once per shell branch
// (ADR D2); no surface re-derives activity from transport events, and
// degradation stays a separate, tiers-read concern (wire-contract) — this
// view says only that work is in flight, never that a backend is down.
//
// Stream queries are EXCLUDED by key predicate: the multiplexed SSE
// subscriptions (`["engine","stream",...]`) hold `fetchStatus: "fetching"`
// for their whole mounted lifetime, so counting them would pin the indicator
// permanently on. This predicate is the maintenance point when a new
// stream-shaped query family lands (ADR consequences).

import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { rollupDrainProgress, useDrainProgressStore } from "./drainProgress";

/** Anti-flicker show grace: activity shorter than this never surfaces, so a
 *  cache hit or a sub-frame refetch cannot blink the indicator. */
export const ACTIVITY_SHOW_GRACE_MS = 300;
/** Minimum visible hold once shown, so the indicator never strobes. */
export const ACTIVITY_MIN_VISIBLE_MS = 600;

export type DataActivityKind = "idle" | "fetching" | "mutating" | "draining";

/** The interpreted activity view chrome consumes (ADR D1). `visible` is the
 *  debounced signal the indicator renders; `determinate` carries the drain
 *  rollup ("N rows…") when a listing walk is the activity, else null and the
 *  indicator renders indeterminate. */
export interface DataActivityView {
  /** Raw signal: at least one counted fetch/mutation/drain is in flight. */
  active: boolean;
  /** Grace-and-hold debounced visibility for the indicator. */
  visible: boolean;
  /** Rolled-up drain progress across in-flight listing walks, or null. */
  determinate: { rowsLoaded: number; drainCount: number } | null;
  /** The dominant activity kind, for the sr-only label. */
  kind: DataActivityKind;
}

/** A TanStack key belonging to a multiplexed SSE stream subscription —
 *  perpetually "fetching" by construction, so excluded from the count. */
export function isStreamQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "engine" && queryKey[1] === "stream";
}

/**
 * Grace-and-hold debounce: `active` must persist past the show grace before
 * `visible` turns on, and once shown it holds for the minimum visible window
 * so the indicator neither blinks on cache hits nor strobes on bursts.
 */
export function useDebouncedActivityVisible(
  active: boolean,
  showGraceMs: number = ACTIVITY_SHOW_GRACE_MS,
  minVisibleMs: number = ACTIVITY_MIN_VISIBLE_MS,
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef(0);
  useEffect(() => {
    if (active) {
      if (visible) return;
      const timer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, showGraceMs);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    const remaining = Math.max(0, minVisibleMs - (Date.now() - shownAtRef.current));
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [active, visible, showGraceMs, minVisibleMs]);
  return visible;
}

/** Pure kind resolution, precedence: a determinate drain names itself, a
 *  mutation beats a background fetch, else fetching, else idle. */
export function resolveActivityKind(
  fetching: number,
  mutating: number,
  draining: boolean,
): DataActivityKind {
  if (draining) return "draining";
  if (mutating > 0) return "mutating";
  if (fetching > 0) return "fetching";
  return "idle";
}

/**
 * Stores hook: the one interpreted data-activity view (ADR D1). Selector
 * discipline (frontend-store-selectors): the drain selector returns the RAW
 * record; the rollup derives in `useMemo` keyed on it.
 */
export function useDataActivityView(): DataActivityView {
  const fetching = useIsFetching({
    predicate: (query) => !isStreamQueryKey(query.queryKey),
  });
  const mutating = useIsMutating();
  const drains = useDrainProgressStore((s) => s.drains);
  const determinate = useMemo(() => rollupDrainProgress(drains), [drains]);
  const active = fetching > 0 || mutating > 0 || determinate !== null;
  const visible = useDebouncedActivityVisible(active);
  const kind = resolveActivityKind(fetching, mutating, determinate !== null);
  return useMemo(
    () => ({ active, visible, determinate, kind }),
    [active, visible, determinate, kind],
  );
}
