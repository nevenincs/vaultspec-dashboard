// The scroll-strip model (dashboard-timeline ADR "Density, bundling, and the
// scroll model", W03.P05.S28-S30): the fit-to-window `TimeWindow` is replaced by
// a horizontally-scrollable strip defined by a pixels-per-time scale (`pxPerMs`)
// and a scroll offset (`scrollOffset`, in CSS pixels from the strip origin). LIVE
// (the present) docks at the RIGHT edge of the viewport and scrolling left walks
// back in time; marks and arcs are virtualized to the visible range plus a margin
// so the surface stays bounded at any corpus age, and a belt-and-suspenders
// client cap guarantees the surface never renders an unbounded item count even if
// the engine somehow serves one.
//
// Coordinate model. The strip has a fixed time origin (`originMs`, t=0 in strip
// space). A time `t` maps to a STRIP x of `(t - originMs) * pxPerMs` — an
// absolute position along the whole-corpus strip independent of scroll. The
// VIEWPORT shows a window of that strip: the viewport's left edge sits at
// `scrollOffset` strip-pixels from the origin, so a strip x maps to a VIEWPORT x
// by subtracting `scrollOffset`. `scrollOffset` grows as you scroll right (toward
// the present); LIVE is the largest meaningful offset (`liveEdgeOffset`).
//
// Pure + deterministic. Every helper is a referentially-transparent function of
// its arguments; `now` is always PASSED IN, never read from `Date.now()` inside a
// helper, so the model is fully unit-testable and the component owns the clock.

/**
 * The canonical strip time origin (t=0 in strip space): the Unix epoch. STRIP x
 * is `(t - originMs) * pxPerMs`, so with the epoch origin a STRIP x is just the
 * absolute epoch-ms position scaled by `pxPerMs`. The whole surface (marks,
 * playhead, range band) shares this one origin so the store's `scrollOffset`
 * means the same thing for every coordinate consumer (S42/S43).
 */
export const TIMELINE_ORIGIN_MS = 0;

/** Minimum pixels-per-millisecond: the most zoomed-OUT (compressed) the strip
 *  goes. ~5 years across 100px keeps a whole-corpus overview in frame. */
export const MIN_PX_PER_MS = 100 / (5 * 365 * 24 * 3600_000);

/** Maximum pixels-per-millisecond: the most zoomed-IN (spread out) the strip
 *  goes. ~1 hour across 100px resolves individual same-day marks. */
export const MAX_PX_PER_MS = 100 / 3600_000;

/** Clamp a pixels-per-time scale into the supported zoom band. A non-finite or
 *  non-positive scale collapses the strip, so it falls back to the minimum. */
export function clampPxPerMs(pxPerMs: number): number {
  if (!Number.isFinite(pxPerMs) || pxPerMs <= 0) return MIN_PX_PER_MS;
  return Math.min(MAX_PX_PER_MS, Math.max(MIN_PX_PER_MS, pxPerMs));
}

/**
 * The STRIP x (absolute position along the whole-corpus strip, scroll-independent)
 * for a time, given the strip's time origin and scale.
 */
export function timeToStripX(tMs: number, originMs: number, pxPerMs: number): number {
  return (tMs - originMs) * pxPerMs;
}

/** The time at a STRIP x — the inverse of `timeToStripX`. */
export function stripXToTime(
  stripX: number,
  originMs: number,
  pxPerMs: number,
): number {
  return originMs + stripX / pxPerMs;
}

/**
 * The VIEWPORT x (position within the visible viewport, with the viewport's left
 * edge at `scrollOffset` strip-pixels) for a time. This is where a mark is drawn.
 */
export function timeToX(
  tMs: number,
  originMs: number,
  pxPerMs: number,
  scrollOffset: number,
): number {
  return timeToStripX(tMs, originMs, pxPerMs) - scrollOffset;
}

/** The time at a VIEWPORT x — the inverse of `timeToX`. */
export function xToTime(
  x: number,
  originMs: number,
  pxPerMs: number,
  scrollOffset: number,
): number {
  return stripXToTime(x + scrollOffset, originMs, pxPerMs);
}

/**
 * The `scrollOffset` that docks LIVE (`nowMs`) at the RIGHT edge of a viewport of
 * `viewportWidth` pixels: the strip x of `nowMs` minus the viewport width, so
 * `now` lands exactly at viewport x = `viewportWidth`. Scrolling to a smaller
 * offset walks the present off the right edge and back in time. (May be negative
 * for a corpus younger than the viewport span — the caller clamps to the corpus
 * extent; the raw value is returned here so the model stays pure.)
 */
export function liveEdgeOffset(
  nowMs: number,
  viewportWidth: number,
  pxPerMs: number,
  originMs = 0,
): number {
  return timeToStripX(nowMs, originMs, pxPerMs) - viewportWidth;
}

/**
 * Rescale `pxPerMs` by `factor` while keeping the instant currently under the
 * cursor's VIEWPORT x pinned in place — the scroll-model analogue of `zoomWindow`.
 * Returns the new clamped scale AND the new `scrollOffset` that preserves the
 * anchored instant. With the scale clamped, the anchored instant is held exactly:
 * the time under `cursorX` before the zoom is the time under `cursorX` after it.
 */
export function zoomAt(
  pxPerMs: number,
  scrollOffset: number,
  cursorX: number,
  factor: number,
  originMs = 0,
): { pxPerMs: number; scrollOffset: number } {
  // The instant under the cursor before zooming — the invariant to preserve.
  const anchorT = xToTime(cursorX, originMs, pxPerMs, scrollOffset);
  const nextPxPerMs = clampPxPerMs(pxPerMs * factor);
  // Solve for the offset that puts `anchorT` back under `cursorX` at the new
  // scale: timeToStripX(anchorT) - offset == cursorX.
  const nextScrollOffset = timeToStripX(anchorT, originMs, nextPxPerMs) - cursorX;
  return { pxPerMs: nextPxPerMs, scrollOffset: nextScrollOffset };
}

/** A closed time range [fromMs, toMs] (inclusive) to fetch and render. */
export interface VisibleRange {
  fromMs: number;
  toMs: number;
}

/**
 * The time range to fetch and render for the current scroll position: the
 * viewport's [left, right] edges converted to time, PADDED by `marginPx` pixels
 * on each side so a mark or arc partly outside the viewport stays drawn while
 * scrolling (virtualization without pop-in). Bounded by construction — the range
 * is the viewport span plus a fixed margin, never the whole corpus — so the read
 * stays bounded at any corpus age.
 */
export function visibleRange(
  scrollOffset: number,
  viewportWidth: number,
  pxPerMs: number,
  marginPx: number,
  originMs = 0,
): VisibleRange {
  const fromMs = xToTime(-marginPx, originMs, pxPerMs, scrollOffset);
  const toMs = xToTime(viewportWidth + marginPx, originMs, pxPerMs, scrollOffset);
  return { fromMs, toMs };
}

/** Whether an instant falls within a visible range (inclusive of both bounds). */
export function isInVisibleRange(tMs: number, range: VisibleRange): boolean {
  return tMs >= range.fromMs && tMs <= range.toMs;
}

/**
 * The belt-and-suspenders client ceiling on dated marks the surface will render
 * (dashboard-timeline ADR "All reads are bounded and honest"). The engine bounds
 * the slice under its document node ceiling, but the client never trusts an
 * unbounded count: even a misbehaving origin cannot make the surface draw more
 * than this.
 */
export const MAX_TIMELINE_MARKS = 1000;

/** The belt-and-suspenders client ceiling on relation arcs the surface renders.
 *  Arcs are denser than marks (a node can carry several), so the ceiling is
 *  higher; it still caps the work at any corpus age. */
export const MAX_TIMELINE_ARCS = 3000;

/** The result of capping a collection: the kept items and how many were dropped. */
export interface Capped<T> {
  items: T[];
  dropped: number;
}

/**
 * Truncate `items` to at most `max`, reporting how many were dropped — the pure
 * cap the surface applies to marks and arcs so it never renders an unbounded
 * count even if served one. A non-positive or non-finite `max` is treated as 0
 * (drop everything) rather than throwing.
 */
export function capItems<T>(items: readonly T[], max: number): Capped<T> {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  if (items.length <= limit) {
    return { items: items.slice(), dropped: 0 };
  }
  return { items: items.slice(0, limit), dropped: items.length - limit };
}
