// Named temporal windows for the ONE canonical `date_range` filter — the preset
// vocabulary the filter flyout's temporal section offers ("Last 7 days", "Last 30
// days", "This year", "Any time") plus the "Custom" reflection of any range the
// timeline's handles produced.
//
// It lives beside `timelineRangeMath` on purpose: the timeline's interactive Setter
// is the SOLE date_range writer (filtering-has-one-canonical-surface), so every
// named window resolves to the SAME `{from, to}` day pair a handle drag would emit
// and is committed through the SAME seam (`useTimelineDateRangeSetter`). A preset
// picked in the flyout and a handle dragged on the track are one write path, which
// is what makes the two surfaces reflect each other rather than drift.
//
// DOM-free and unit-tested; the components compose it.

import { dayISO } from "./timelineRangeMath";

export type TimelineRangePreset = "any" | "7d" | "30d" | "year" | "custom";

/** The named windows, in presentation order. `any` clears the range; `custom` is
 *  never WRITTEN by a preset — it is the identity a range that matches no named
 *  window reflects back as. */
export const TIMELINE_RANGE_PRESETS = Object.freeze([
  "any",
  "7d",
  "30d",
  "year",
  "custom",
]) satisfies readonly TimelineRangePreset[];

const DAY_MS = 86_400_000;

export function timelineRangePreset(value: unknown): TimelineRangePreset | null {
  return value === "any" ||
    value === "7d" ||
    value === "30d" ||
    value === "year" ||
    value === "custom"
    ? value
    : null;
}

/** The `{from, to}` day pair a named window covers, anchored on `nowMs`. `any` and
 *  `custom` name no window of their own (`any` clears; `custom` carries whatever the
 *  two date inputs hold), so both resolve to null. Rolling windows are INCLUSIVE of
 *  today: "Last 7 days" spans today and the six days before it. */
export function timelineRangeForPreset(
  preset: TimelineRangePreset,
  nowMs: number,
): { from: string; to: string } | null {
  if (!Number.isFinite(nowMs)) return null;
  const to = dayISO(nowMs);
  if (preset === "7d") return { from: dayISO(nowMs - 6 * DAY_MS), to };
  if (preset === "30d") return { from: dayISO(nowMs - 29 * DAY_MS), to };
  if (preset === "year") {
    return { from: `${new Date(nowMs).getUTCFullYear()}-01-01`, to };
  }
  return null;
}

/**
 * Which named window a committed range IS. An unset range is "Any time"; a range
 * whose day bounds match a window anchored on `nowMs` is that window; anything else
 * — every hand-dragged timeline range — is "Custom". This is the reflection half of
 * the two-way sync: the timeline writes, and the flyout's radio reads back the
 * SAME record rather than holding its own idea of the window.
 */
export function timelineRangePresetForRange(
  range: { from?: string | null; to?: string | null } | null | undefined,
  nowMs: number,
): TimelineRangePreset {
  const from = range?.from ?? "";
  const to = range?.to ?? "";
  if (!from && !to) return "any";
  for (const preset of ["7d", "30d", "year"] as const) {
    const window = timelineRangeForPreset(preset, nowMs);
    if (window !== null && window.from === from && window.to === to) return preset;
  }
  return "custom";
}
