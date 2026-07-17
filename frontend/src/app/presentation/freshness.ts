// Shared compact recency indicator for chrome surfaces.
//
// Pure presentation only: no wire access, no node identity, no query state. It
// returns a localized message descriptor (resolved at the render boundary) plus
// a stable liveness flag, so a consumer renders the compact label and ties the
// accent tone to genuine freshness without re-parsing a rendered string.

import type { AnyMessageDescriptor } from "../../platform/localization/message";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export interface Freshness {
  /** The compact recency label; resolve at the render boundary. */
  readonly descriptor: AnyMessageDescriptor;
  /** True only for the genuinely live `now` (<1h) bucket, so the accent tone
   *  stays tied to real liveness. */
  readonly fresh: boolean;
}

function aged(
  key: "common:freshness.hours" | "common:freshness.days" | "common:freshness.weeks",
  count: number,
): Freshness {
  return { descriptor: { key, values: { count } }, fresh: false };
}

/** Compact recency: <1h "Now" (fresh), then hour/day/week buckets; a cooled or
 *  unparseable timestamp reads as silence (null). */
export function freshness(modified: string | undefined, now: number): Freshness | null {
  if (!modified) return null;
  const at = Date.parse(modified);
  if (!Number.isFinite(at)) return null;
  const age = now - at;
  if (age < HOUR) return { descriptor: { key: "common:freshness.now" }, fresh: true };
  if (age < DAY) return aged("common:freshness.hours", Math.floor(age / HOUR));
  if (age < WEEK) return aged("common:freshness.days", Math.floor(age / DAY));
  if (age < MONTH) return aged("common:freshness.weeks", Math.floor(age / WEEK));
  return null;
}

/** The token class for a compact freshness indicator — accent only for the truly
 *  live bucket, muted otherwise. Pure of the boolean so it stays referentially
 *  stable for store selectors. */
export function freshnessToneClass(fresh: boolean): string {
  return fresh ? "text-state-active" : "text-ink-muted";
}
