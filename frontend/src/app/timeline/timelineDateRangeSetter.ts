// The timeline's date-range SETTER seam — the one place the canonical
// `dashboardState.date_range` is written from.
//
// The filtering rule names the timeline's interactive Setter as the sole
// date_range writer. This module IS that Setter, lifted out of the selector
// component so a SECOND surface can commit a range without becoming a second
// writer: the filter flyout's temporal presets (owner review [msacfd3s]) call this
// seam, which composes the identical `{from, to}` day payload a handle drag emits
// and clears on full-span coverage exactly as `rangeWritePayload` prescribes. One
// payload builder, one mutation, one record — which is what makes the timeline and
// the flyout reflect each other instead of drifting.
//
// The deliberate extension is the seam's SHAPE, not its authority: nothing else may
// call `setDateRange` directly, and every caller here still goes through the same
// stores mutation the selector always used.

import { useCallback, useMemo, useRef } from "react";

import { useDashboardStateMutations } from "../../stores/server/dashboardState";
import { clampToSpan, dayISO, rangeWritePayload } from "./timelineRangeMath";
import {
  timelineRangeForPreset,
  type TimelineRangePreset,
} from "./timelineRangePresets";

/** The corpus span the committed range is composed against (epoch ms). */
export interface TimelineRangeSpan {
  lo: number;
  hi: number;
}

export interface TimelineDateRangeSetter {
  /** Commit an explicit `{from, to}` day pair (the handle-drag path). Clears when
   *  it covers the whole corpus span, so widening stays reversible. */
  setDateRange: (next: { from: string; to: string }) => void;
  /** Commit a named window ("Last 30 days"…). `any` clears the range. */
  setDateRangePreset: (preset: TimelineRangePreset) => void;
  /** Restore the full range — the double-click/double-tap escape hatch and the
   *  explicit clear action. */
  resetDateRange: () => void;
}

/** Two epoch-ms instants as a day pair, ordered and clamped to the corpus span. */
export function spanDayPair(
  fromMs: number,
  toMs: number,
  span: TimelineRangeSpan,
): { from: string; to: string } {
  const lo = Math.min(fromMs, toMs);
  const hi = Math.max(fromMs, toMs);
  return {
    from: dayISO(clampToSpan(lo, span.lo, span.hi)),
    to: dayISO(clampToSpan(hi, span.lo, span.hi)),
  };
}

export function useTimelineDateRangeSetter(
  scope: unknown,
  span: TimelineRangeSpan,
): TimelineDateRangeSetter {
  const mutations = useDashboardStateMutations(scope);
  // The mutations object is rebuilt every render; hold the commit in a ref so the
  // returned setter stays referentially stable for effect/memo consumers.
  const commitRef = useRef(mutations.setDateRange);
  commitRef.current = mutations.setDateRange;
  const { lo, hi } = span;

  const setDateRange = useCallback(
    (next: { from: string; to: string }) => {
      void commitRef.current(rangeWritePayload(next, lo, hi));
    },
    [hi, lo],
  );
  const resetDateRange = useCallback(() => void commitRef.current({}), []);
  const setDateRangePreset = useCallback(
    (preset: TimelineRangePreset) => {
      const window = timelineRangeForPreset(preset, Date.now());
      if (window === null) {
        // `any` names no window: the honest write is the CLEARED range, never an
        // explicit full span (which would permanently hide undated documents).
        if (preset === "any") resetDateRange();
        return;
      }
      setDateRange(window);
    },
    [resetDateRange, setDateRange],
  );

  return useMemo(
    () => ({ setDateRange, setDateRangePreset, resetDateRange }),
    [resetDateRange, setDateRange, setDateRangePreset],
  );
}
