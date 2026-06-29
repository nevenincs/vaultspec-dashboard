// Pure helpers for the fixed two-handle date-range selector (Issue #14 timeline
// rebuild). The timeline is no longer a scrolling diachronic lineage view: it is a
// FIXED range over the corpus span (left edge = oldest vault doc, right edge =
// latest, by the active date criterion) whose start/end IS the canonical
// `date_range` filter (filtering-has-one-canonical-surface — the timeline is the
// sole date_range writer). These helpers are DOM-free and unit-tested; the
// component (`./TimelineRange`) composes them.

export const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Parse an ISO date string to epoch ms, or null when absent/unparseable. */
export function parseISO(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** "12 Jun 2026" compact date readout. */
export function dateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "12 Jun" day+month readout (no year) — the approved thin-strip readout form. */
export function dayMonth(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]}`;
}

/** The UTC day (yyyy-mm-dd) for a date_range bound — the engine compares on the
 *  date prefix, so day precision is the canonical wire form. */
export function dayISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Up to `max` month-start tick labels across the corpus span (inclusive). */
export function monthTicks(minMs: number, maxMs: number, max = 6): string[] {
  if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || maxMs <= minMs) return [];
  const out: string[] = [];
  const cur = new Date(minMs);
  cur.setUTCDate(1);
  cur.setUTCHours(0, 0, 0, 0);
  while (cur.getTime() <= maxMs && out.length < max) {
    if (cur.getTime() >= minMs) out.push(SHORT_MONTHS[cur.getUTCMonth()]!);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

/** Position (0..1) of `ms` within the corpus span `[lo, hi]`. */
export function spanRatio(ms: number, lo: number, hi: number): number {
  if (!(hi > lo)) return 0;
  return Math.min(1, Math.max(0, (ms - lo) / (hi - lo)));
}

/** The epoch ms at a fractional position `r` (0..1) within `[lo, hi]`. */
export function msAtRatio(r: number, lo: number, hi: number): number {
  const clamped = Math.min(1, Math.max(0, r));
  return lo + clamped * (hi - lo);
}

/** Clamp an epoch ms into the corpus span `[lo, hi]`. */
export function clampToSpan(ms: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, ms));
}

/** The fractional position of a client X over a track rect `[left, left+width]`. */
export function ratioAtClientX(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - left) / width));
}

/** The next date_range when dragging the `from` (start) or `to` (end) handle to a
 *  new instant — each handle is clamped so the start never crosses the end. The
 *  bounds are emitted as yyyy-mm-dd day strings (the canonical wire form). */
export function nextRangeForHandle(
  which: "from" | "to",
  ms: number,
  fromMs: number,
  toMs: number,
): { from: string; to: string } {
  return which === "from"
    ? { from: dayISO(Math.min(ms, toMs)), to: dayISO(toMs) }
    : { from: dayISO(fromMs), to: dayISO(Math.max(ms, fromMs)) };
}

/** Whether the committed range narrows the corpus (a real filter is active). */
export function rangeIsNarrowed(
  source: string,
  fromMs: number,
  toMs: number,
  lo: number,
  hi: number,
): boolean {
  return source === "dashboard" && (fromMs > lo || toMs < hi);
}

/**
 * The date_range write payload for a dragged range over the corpus `[lo, hi]`. When
 * the range covers the WHOLE corpus, returns `{}` (clear) rather than an explicit
 * full-span — because the engine's date predicate EXCLUDES undated documents whenever
 * any range is set, so an explicit full-span would permanently hide undated rail/graph
 * items even after widening. Clearing on full coverage keeps the widen reversible
 * (Issue #14 filtering regression: "items don't come back when the range widens").
 */
export function rangeWritePayload(
  next: { from: string; to: string },
  lo: number,
  hi: number,
): { from: string; to: string } | Record<string, never> {
  const from = Date.parse(next.from);
  const to = Date.parse(next.to);
  if (Number.isFinite(from) && Number.isFinite(to) && from <= lo && to >= hi) {
    return {};
  }
  return next;
}
