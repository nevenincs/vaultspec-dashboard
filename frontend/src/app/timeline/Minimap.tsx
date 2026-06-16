// The timeline minimap (dashboard-timeline ADR "Density, bundling, and the scroll
// model" / "Control surfaces", W04.P08.S54): an overview ribbon spanning the WHOLE
// corpus that doubles as a scrubber. It is a DUMB projection — it reads the corpus
// date span (the engine-enumerated `date_bounds` from the filters vocabulary) and
// the current scroll-strip view state (pxPerMs + scrollOffset) from the store, and
// emits scroll intent back by writing `scrollOffset` through the store setter.
// Clicking or dragging anywhere on the ribbon scrubs the visible window so its
// CENTRE lands at the clicked corpus instant; the visible window is drawn as a
// brush rectangle over the ribbon so whole-corpus orientation is always legible.
//
// Coordinate model. The ribbon is a fixed-width band mapping the corpus span
// [corpusFromMs, corpusToMs] linearly across [0, ribbonWidth]. The scroll-strip's
// visible window (its left/right edges in strip-time, derived from `scrollOffset`,
// `pxPerMs`, and the viewport width) projects onto the ribbon as the brush. A
// click at ribbon x maps back to a corpus instant; the scroll offset that centres
// the visible window on that instant is written to the store (clamped ≥ 0).
//
// This is NOT the stage minimap (which hosts a scene-drawn canvas and moves the
// camera). This ribbon owns only the timeline's horizontal scroll position; it
// draws its own pixels (pure SVG on the token layer), fetches nothing, and reads
// no raw `tiers` block (dashboard-layer-ownership / ADR "Layer ownership").

import { useMemo, useRef } from "react";

import { useFiltersVocabulary } from "../../stores/server/queries";
import { useActiveScope } from "../stage/Stage";
import { useTimelineStore } from "./Timeline";
import { TIMELINE_ORIGIN_MS, stripXToTime, timeToStripX } from "./scrollStrip";

const RIBBON_HEIGHT = 18;
/** A small fallback corpus span (~6 months) when the corpus bounds are unknown,
 *  so the ribbon stays usable as a scrubber before the vocabulary loads. */
const FALLBACK_SPAN_MS = 180 * 24 * 3600_000;

/**
 * The corpus [from, to] instants the ribbon spans, from the engine-enumerated
 * `date_bounds`. Falls back to a fixed recent span when bounds are absent so the
 * ribbon is never zero-width. Pure: `now` is passed so it stays unit-testable.
 */
export function corpusSpan(
  bounds: { from?: string; to?: string } | undefined,
  nowMs: number,
): { fromMs: number; toMs: number } {
  const from = bounds?.from ? Date.parse(bounds.from) : NaN;
  const to = bounds?.to ? Date.parse(bounds.to) : NaN;
  const toMs = Number.isFinite(to) ? to : nowMs;
  const fromMs = Number.isFinite(from) ? from : toMs - FALLBACK_SPAN_MS;
  // Guard a degenerate (zero/negative) span so the linear map never divides by 0.
  return fromMs < toMs ? { fromMs, toMs } : { fromMs: toMs - FALLBACK_SPAN_MS, toMs };
}

/** Map a corpus instant onto a ribbon x in [0, ribbonWidth]. Pure. */
export function corpusToRibbonX(
  tMs: number,
  span: { fromMs: number; toMs: number },
  ribbonWidth: number,
): number {
  const ratio = (tMs - span.fromMs) / (span.toMs - span.fromMs);
  return Math.max(0, Math.min(ribbonWidth, ratio * ribbonWidth));
}

/** Map a ribbon x back to a corpus instant. The inverse of `corpusToRibbonX`. */
export function ribbonXToCorpus(
  x: number,
  span: { fromMs: number; toMs: number },
  ribbonWidth: number,
): number {
  const ratio = ribbonWidth > 0 ? x / ribbonWidth : 0;
  return span.fromMs + Math.max(0, Math.min(1, ratio)) * (span.toMs - span.fromMs);
}

/**
 * The scroll offset that centres the visible window (of `viewportWidth` px at
 * `pxPerMs`) on a corpus instant. Pure, clamped ≥ 0 so the strip never scrolls
 * before its origin.
 */
export function scrollOffsetCenteringOn(
  tMs: number,
  pxPerMs: number,
  viewportWidth: number,
): number {
  const stripX = timeToStripX(tMs, TIMELINE_ORIGIN_MS, pxPerMs);
  return Math.max(0, stripX - viewportWidth / 2);
}

/**
 * The visible window's [left, right] edges as ribbon x positions — the brush.
 * Pure: derives the window edges from the strip math and projects them onto the
 * ribbon span.
 */
export function brushOnRibbon(
  scrollOffset: number,
  pxPerMs: number,
  viewportWidth: number,
  span: { fromMs: number; toMs: number },
  ribbonWidth: number,
): { x: number; width: number } {
  const leftT = stripXToTime(scrollOffset, TIMELINE_ORIGIN_MS, pxPerMs);
  const rightT = stripXToTime(
    scrollOffset + viewportWidth,
    TIMELINE_ORIGIN_MS,
    pxPerMs,
  );
  const x1 = corpusToRibbonX(leftT, span, ribbonWidth);
  const x2 = corpusToRibbonX(rightT, span, ribbonWidth);
  return { x: Math.min(x1, x2), width: Math.max(2, Math.abs(x2 - x1)) };
}

/**
 * The overview ribbon / scrubber. `viewportWidth` is the timeline viewport width
 * (so the brush is sized correctly); `ribbonWidth` is the ribbon's own pixel
 * width. Both default for standalone use and are passed explicitly when the
 * control bar measures the surface.
 */
export function Minimap({
  viewportWidth = 800,
  ribbonWidth = 240,
}: {
  viewportWidth?: number;
  ribbonWidth?: number;
} = {}) {
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabulary(scope);
  const pxPerMs = useTimelineStore((s) => s.pxPerMs);
  const scrollOffset = useTimelineStore((s) => s.scrollOffset);
  const setScrollOffset = useTimelineStore((s) => s.setScrollOffset);
  const ribbonRef = useRef<SVGSVGElement>(null);

  const span = useMemo(
    () => corpusSpan(vocabulary.data?.date_bounds, Date.now()),
    [vocabulary.data?.date_bounds],
  );
  const brush = useMemo(
    () => brushOnRibbon(scrollOffset, pxPerMs, viewportWidth, span, ribbonWidth),
    [scrollOffset, pxPerMs, viewportWidth, span, ribbonWidth],
  );

  // Scrub: a ribbon x scrolls the strip so its visible window centres on the
  // clicked corpus instant. Writing only `scrollOffset` keeps this a dumb,
  // single-intent control (no fetch, no scale change).
  const scrubToX = (clientX: number) => {
    const rect = ribbonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const t = ribbonXToCorpus(x, span, ribbonWidth);
    setScrollOffset(scrollOffsetCenteringOn(t, pxPerMs, viewportWidth));
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubToX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) scrubToX(e.clientX);
  };

  // Keyboard scrub: arrows nudge the offset by ~10% of a viewport so the ribbon is
  // a real, non-pointer-only scrubber (ADR a11y — every control keyboard-reachable).
  const nudge = viewportWidth * 0.1;
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setScrollOffset(scrollOffset - nudge);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setScrollOffset(scrollOffset + nudge);
    }
  };

  return (
    <svg
      ref={ribbonRef}
      role="slider"
      tabIndex={0}
      aria-label="timeline overview scrubber"
      aria-orientation="horizontal"
      aria-valuemin={span.fromMs}
      aria-valuemax={span.toMs}
      aria-valuenow={Math.round(
        ribbonXToCorpus(brush.x + brush.width / 2, span, ribbonWidth),
      )}
      aria-valuetext={`viewing around ${new Date(
        ribbonXToCorpus(brush.x + brush.width / 2, span, ribbonWidth),
      )
        .toISOString()
        .slice(0, 10)}`}
      width={ribbonWidth}
      height={RIBBON_HEIGHT}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      className="cursor-pointer rounded-fg-xs border border-rule bg-paper-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
      data-timeline-minimap
    >
      {/* The corpus baseline — a soft token rule so the ribbon reads as ground. */}
      <line
        x1={0}
        x2={ribbonWidth}
        y1={RIBBON_HEIGHT / 2}
        y2={RIBBON_HEIGHT / 2}
        className="stroke-rule"
      />
      {/* The visible-window brush: a filled accent band (non-color cue: it is the
          only filled rect on the ribbon, and it is stroked). */}
      <rect
        x={brush.x}
        y={1}
        width={brush.width}
        height={RIBBON_HEIGHT - 2}
        rx={2}
        className="fill-accent-subtle stroke-accent/60"
        data-minimap-brush
      />
    </svg>
  );
}
