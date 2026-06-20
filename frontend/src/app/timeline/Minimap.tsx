// The timeline range navigator / scrubber (dashboard-timeline ADR "Density,
// bundling, and the scroll model" / "Control surfaces"; timeline fidelity rework):
// a prominent overview band, docked in its OWN row at the bottom of the timeline
// (no longer an 18px sliver overlapping the marks). It spans the WHOLE corpus and
// doubles as a scrubber: the ribbon draws the visible window as a draggable brush
// without endpoint labels or a separate frame. Click or drag anywhere on
// the ribbon scrubs so the visible window centres on the clicked corpus instant.
//
// It is a DUMB projection (dashboard-layer-ownership / ADR "Layer ownership"): it
// reads the corpus date span (the engine-enumerated `date_bounds` from the filters
// vocabulary) and the current scroll-strip view state (pxPerMs + scrollOffset)
// from the store, and emits scroll intent back by writing `scrollOffset` through
// the store setter. It draws its own pixels (pure SVG on the token layer), fetches
// nothing, and reads no raw `tiers` block.
//
// Coordinate model. The ribbon maps the corpus span [corpusFromMs, corpusToMs]
// linearly across [0, ribbonWidth]. The scroll-strip's visible window (its
// left/right edges in strip-time, derived from `scrollOffset`, `pxPerMs`, and the
// viewport width) projects onto the ribbon as the brush. A click at ribbon x maps
// back to a corpus instant; the scroll offset that centres the visible window on
// that instant is written to the store (clamped ≥ 0). The ribbon measures its own
// rendered width so it fills the band; the prop is the standalone/test fallback.
//
// This is NOT the stage minimap (which hosts a scene-drawn canvas and moves the
// camera). This ribbon owns only the timeline's horizontal scroll position.

import { useMemo, useRef, type RefObject } from "react";

import { useActiveScope, useFiltersVocabularyView } from "../../stores/server/queries";
import { useElementWidth } from "../chrome/useElementWidth";
import {
  clearTimelineMinimapDrag,
  setTimelineScrollOffset,
  setTimelineMinimapDrag,
  setTimelineViewport,
  timelineMinimapDragSnapshot,
  timelineMinimapKeyboardOffset,
  timelineMinimapViewportForWindow,
  timelineViewportForTimeRange,
  useTimelineScrollState,
} from "../../stores/view/timeline";
import { categoryColorVar, type Category } from "../kit/category";
import { TIMELINE_ORIGIN_MS, stripXToTime, timeToStripX } from "./scrollStrip";

// Range-control geometry (figma binding SlhonORmySdoSMTQgDWw3w, scrubber row
// 251:801 / track 255:866): a paper overview track (neutral/50 fill, border/strong
// rim) with the visible window drawn as a bright, thick-bordered accent brush over
// an OPAQUE paper veil that hides the out-of-window span, capped by two grabbable
// accent handles with a white double-line grip. The numbers mirror the Figma nodes
// 1:1 so the live control and the binding design stay in parity (figma-is-the-
// binding-source-of-truth): track 34h, brush border 2.5px, 8×28 handles at top=2
// radius 4, white grips 1.5×12 at top=10, density markers 3×20 at top=6.
const RIBBON_HEIGHT = 34;
const MARKER_CLUSTER_PX = 8;
/** Widened hit zone (was 8) so the 8px-wide accent handles are comfortably
 *  grabbable along their whole pill — the resize edge is the affordance. */
const BRUSH_HANDLE_HIT_PX = 11;
/** Brush + handle render geometry (Figma 255:880/881/884). */
const BRUSH_STROKE_PX = 2.5;
const HANDLE_W = 8;
const HANDLE_H = 28;
/** Handle top inset (Figma 255:881 top=2): the pill straddles the brush edge. */
const HANDLE_Y = 2;
const HANDLE_RADIUS = 4;
/** Handle grip bars (Figma 255:882/883): a white double line on each handle. */
const GRIP_W = 1.5;
const GRIP_H = 12;
const GRIP_Y = 10;
/** Density markers (Figma 255:867…): full-opacity colored bars, top=6. */
const MARKER_W = 3;
const MARKER_H = 20;
const MARKER_Y = 6;
/** A small fallback corpus span (~6 months) when the corpus bounds are unknown,
 *  so the ribbon stays usable as a scrubber before the vocabulary loads. */
const FALLBACK_SPAN_MS = 180 * 24 * 3600_000;

/**
 * The corpus [from, to] instants the ribbon spans, from the engine-enumerated
 * `date_bounds`. Valid engine bounds are the data window, even when the corpus is
 * narrow: the minimap must not invent a wider random timeline around real data.
 * Only missing/invalid bounds fall back to a fixed recent span. Pure: `now` is
 * passed so it stays unit-testable.
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
  if (fromMs >= toMs) return { fromMs: toMs - FALLBACK_SPAN_MS, toMs };
  return { fromMs, toMs };
}

export function corpusSpanUsesFallback(
  bounds: { from?: string; to?: string } | undefined,
): boolean {
  const from = bounds?.from ? Date.parse(bounds.from) : NaN;
  const to = bounds?.to ? Date.parse(bounds.to) : NaN;
  return !Number.isFinite(from) || !Number.isFinite(to) || from >= to;
}

function rawFiniteSpan(
  bounds: { from?: string; to?: string } | undefined,
): { fromMs: number; toMs: number } | null {
  const fromMs = bounds?.from ? Date.parse(bounds.from) : NaN;
  const toMs = bounds?.to ? Date.parse(bounds.to) : NaN;
  return Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs
    ? { fromMs, toMs }
    : null;
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
  return { x: Math.min(x1, x2), width: Math.max(6, Math.abs(x2 - x1)) };
}

export type BrushDragMode = "left" | "right" | "move" | "center";

export function brushDragMode(
  x: number,
  brush: { x: number; width: number },
  hitPx = BRUSH_HANDLE_HIT_PX,
): BrushDragMode {
  const right = brush.x + brush.width;
  if (Math.abs(x - brush.x) <= hitPx) return "left";
  if (Math.abs(x - right) <= hitPx) return "right";
  if (x >= brush.x && x <= right) return "move";
  return "center";
}

export function clampBrushWindow(
  fromMs: number,
  toMs: number,
  span: { fromMs: number; toMs: number },
  minSpanMs: number,
): { fromMs: number; toMs: number } {
  const spanSize = Math.max(1, span.toMs - span.fromMs);
  const requestedSize = Math.max(minSpanMs, Math.abs(toMs - fromMs));
  if (requestedSize >= spanSize) return { fromMs: span.fromMs, toMs: span.toMs };

  let from = Math.min(fromMs, toMs);
  let to = from + requestedSize;
  if (from < span.fromMs) {
    from = span.fromMs;
    to = from + requestedSize;
  }
  if (to > span.toMs) {
    to = span.toMs;
    from = to - requestedSize;
  }
  return { fromMs: from, toMs: to };
}

/**
 * First-of-month tick x positions across the ribbon (the overview gridline). Pure;
 * local to the navigator so it carries no dependency on the chart module (avoids an
 * import cycle with `Timeline`). Bounded by a guard so a pathological span can't
 * spin.
 */
export function monthTickXs(
  span: { fromMs: number; toMs: number },
  ribbonWidth: number,
): number[] {
  const xs: number[] = [];
  if (span.toMs <= span.fromMs || ribbonWidth <= 0) return xs;
  const d = new Date(span.fromMs);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getTime() < span.fromMs) d.setUTCMonth(d.getUTCMonth() + 1);
  for (let guard = 0; d.getTime() <= span.toMs && guard < 120; guard++) {
    xs.push(corpusToRibbonX(d.getTime(), span, ribbonWidth));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return xs;
}

export function overviewTickXs(
  bounds: { from?: string; to?: string } | undefined,
  expandedSpan: { fromMs: number; toMs: number },
  ribbonWidth: number,
): number[] {
  if (ribbonWidth <= 0) return [];
  const raw = rawFiniteSpan(bounds);
  if (raw && raw.toMs - raw.fromMs < FALLBACK_SPAN_MS) {
    const dayCount = Math.round((raw.toMs - raw.fromMs) / (24 * 3600_000));
    if (dayCount > 1 && dayCount <= 31) {
      const step = ribbonWidth / dayCount;
      return Array.from({ length: dayCount - 1 }, (_, i) => step * (i + 1));
    }
  }
  return monthTickXs(expandedSpan, ribbonWidth);
}

export interface OverviewMarker {
  x: number;
  count: number;
  category: Category;
}

export type OverviewInstant =
  | number
  | {
      tMs: number;
      category: Category;
    };

function overviewInstantValue(input: OverviewInstant): number {
  return typeof input === "number" ? input : input.tMs;
}

function overviewInstantCategory(input: OverviewInstant): Category {
  return typeof input === "number" ? "code" : input.category;
}

export function overviewMarkers(
  instants: readonly OverviewInstant[],
  span: { fromMs: number; toMs: number },
  ribbonWidth: number,
): OverviewMarker[] {
  if (span.toMs <= span.fromMs || ribbonWidth <= 0) return [];
  const samples = instants
    .map((input) => ({
      x: Math.round(corpusToRibbonX(overviewInstantValue(input), span, ribbonWidth)),
      category: overviewInstantCategory(input),
      tMs: overviewInstantValue(input),
    }))
    .filter(
      (sample) =>
        Number.isFinite(sample.tMs) &&
        sample.tMs >= span.fromMs &&
        sample.tMs <= span.toMs,
    )
    .sort((a, b) => a.x - b.x || a.category.localeCompare(b.category));
  const buckets: { xSum: number; count: number; categories: Map<Category, number> }[] =
    [];
  for (const sample of samples) {
    const bucket = buckets.at(-1);
    if (
      !bucket ||
      sample.x - Math.round(bucket.xSum / bucket.count) >= MARKER_CLUSTER_PX
    ) {
      buckets.push({
        xSum: sample.x,
        count: 1,
        categories: new Map<Category, number>([[sample.category, 1]]),
      });
      continue;
    }
    bucket.xSum += sample.x;
    bucket.count += 1;
    bucket.categories.set(
      sample.category,
      (bucket.categories.get(sample.category) ?? 0) + 1,
    );
  }
  return buckets
    .map((bucket) => {
      const category =
        [...bucket.categories.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
        )[0]?.[0] ?? "code";
      return {
        x: Math.round(bucket.xSum / bucket.count),
        count: bucket.count,
        category,
      };
    })
    .sort((a, b) => a.x - b.x);
}

/**
 * The range navigator band. `viewportWidth` is the timeline viewport width (so the
 * brush is sized correctly); `ribbonWidth` is a fallback for the ribbon's own pixel
 * width — the component measures its rendered width and prefers that so it fills
 * the band. Both default for standalone use.
 */
export function Minimap({
  viewportWidth = 800,
  ribbonWidth: ribbonWidthProp = 240,
  overviewInstants = [],
}: {
  viewportWidth?: number;
  ribbonWidth?: number;
  overviewInstants?: readonly OverviewInstant[];
} = {}) {
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabularyView(scope);
  const { pxPerMs, scrollOffset } = useTimelineScrollState();
  const ribbonRef = useRef<SVGSVGElement>(null);
  // Fill the band: measure the rendered ribbon width, fall back to the prop until
  // the first real measurement (and for standalone/test use).
  const ribbonWidth =
    useElementWidth(ribbonRef as RefObject<Element | null>) ?? ribbonWidthProp;

  const span = useMemo(
    () => corpusSpan(vocabulary.dateBounds, Date.now()),
    [vocabulary.dateBounds],
  );
  const brush = useMemo(
    () => brushOnRibbon(scrollOffset, pxPerMs, viewportWidth, span, ribbonWidth),
    [scrollOffset, pxPerMs, viewportWidth, span, ribbonWidth],
  );
  const markers = useMemo(
    () => overviewMarkers(overviewInstants, span, ribbonWidth),
    [overviewInstants, span, ribbonWidth],
  );

  const applyWindow = (fromMs: number, toMs: number) => {
    const next = timelineMinimapViewportForWindow(fromMs, toMs, span, viewportWidth);
    setTimelineViewport(next.pxPerMs, next.scrollOffset);
  };

  const pointerTime = (clientX: number): number | null => {
    const rect = ribbonRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    return ribbonXToCorpus(x, span, ribbonWidth);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = ribbonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const mode = brushDragMode(x, brush);
    const initialFromMs = stripXToTime(scrollOffset, TIMELINE_ORIGIN_MS, pxPerMs);
    const initialToMs = stripXToTime(
      scrollOffset + viewportWidth,
      TIMELINE_ORIGIN_MS,
      pxPerMs,
    );
    const pointerT = ribbonXToCorpus(x, span, ribbonWidth);
    const duration = Math.max(1, initialToMs - initialFromMs);
    const grabOffsetMs = mode === "center" ? duration / 2 : pointerT - initialFromMs;
    if (mode === "center") {
      applyWindow(pointerT - duration / 2, pointerT + duration / 2);
    }
    setTimelineMinimapDrag({
      pointerId: e.pointerId,
      mode: mode === "center" ? "move" : mode,
      initialFromMs,
      initialToMs,
      grabOffsetMs,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = timelineMinimapDragSnapshot();
    if (!drag || drag.pointerId !== e.pointerId) return;
    const t = pointerTime(e.clientX);
    if (t == null) return;
    if (drag.mode === "left") {
      applyWindow(t, drag.initialToMs);
    } else if (drag.mode === "right") {
      applyWindow(drag.initialFromMs, t);
    } else {
      const duration = Math.max(1, drag.initialToMs - drag.initialFromMs);
      const fromMs = t - drag.grabOffsetMs;
      applyWindow(fromMs, fromMs + duration);
    }
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    clearTimelineMinimapDrag(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  // Keyboard scrub: arrows nudge the offset by ~10% of a viewport so the ribbon is
  // a real, non-pointer-only scrubber (ADR a11y — every control keyboard-reachable).
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setTimelineScrollOffset(
        timelineMinimapKeyboardOffset(scrollOffset, viewportWidth, -1),
      );
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setTimelineScrollOffset(
        timelineMinimapKeyboardOffset(scrollOffset, viewportWidth, 1),
      );
    }
  };

  const fitToRange = () => {
    const next = timelineViewportForTimeRange(span.fromMs, span.toMs, viewportWidth);
    setTimelineViewport(next.pxPerMs, next.scrollOffset);
  };

  // Window edges + handle placement (Figma 255:880/881/884): the accent pills
  // straddle the brush edges and are clamped inside the track so they stay on the
  // ribbon even when the window is docked to an edge.
  const winLeft = brush.x;
  const winRight = brush.x + brush.width;
  const veilRightWidth = Math.max(0, ribbonWidth - winRight);
  const handleX = (edge: number) =>
    Math.max(0, Math.min(ribbonWidth - HANDLE_W, edge - HANDLE_W / 2));
  const leftHandleX = handleX(winLeft);
  const rightHandleX = handleX(winRight);

  return (
    <div className="relative h-[2.75rem] bg-paper px-fg-3" data-timeline-navigator>
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
        viewBox={`0 0 ${ribbonWidth} ${RIBBON_HEIGHT}`}
        preserveAspectRatio="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={fitToRange}
        className="absolute left-[0.75rem] top-[0.3125rem] h-[2.125rem] w-[calc(100%-1.5rem)] cursor-pointer overflow-visible focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        data-timeline-minimap
      >
        {/* The overview track (Figma 255:866): a paper lane (neutral/50) with a
            firm border/strong rim so the scrubber reads as a real, prominent
            control rather than a hairline. */}
        <rect
          x={0.5}
          y={0.5}
          width={Math.max(0, ribbonWidth - 1)}
          height={RIBBON_HEIGHT - 1}
          rx={6}
          className="fill-paper stroke-rule-strong"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          data-minimap-track
        />
        {/* Density markers — the overview "graph": a tall, full-opacity colored bar
            per document cluster in its bound category hue. */}
        {markers.map((marker) => (
          <rect
            key={marker.x}
            x={Math.max(0, Math.min(ribbonWidth - MARKER_W, marker.x - MARKER_W / 2))}
            y={MARKER_Y}
            width={MARKER_W}
            height={MARKER_H}
            rx={1}
            fill={categoryColorVar(marker.category)}
            data-minimap-overview-marker
          />
        ))}
        {/* Out-of-window context veil (Figma 434:1083/1084): an OPAQUE paper veil
            covers the un-selected span on each side so only the in-window density
            markers show through the bright selection. */}
        {winLeft > 0 && (
          <rect
            x={0}
            y={0}
            width={winLeft}
            height={RIBBON_HEIGHT}
            className="fill-paper"
            data-minimap-veil="left"
          />
        )}
        {veilRightWidth > 0 && (
          <rect
            x={winRight}
            y={0}
            width={veilRightWidth}
            height={RIBBON_HEIGHT}
            className="fill-paper"
            data-minimap-veil="right"
          />
        )}
        {/* The visible-window brush: a bright, thick-bordered selection band. The
            fill is transparent so the density markers read through it. */}
        <rect
          x={brush.x}
          y={0.5}
          width={brush.width}
          height={RIBBON_HEIGHT - 1}
          rx={6}
          fill="none"
          className="stroke-accent"
          strokeWidth={BRUSH_STROKE_PX}
          vectorEffect="non-scaling-stroke"
          data-minimap-brush
        />
        {/* Grabbable accent handles capping each edge (Figma 255:881/884), each with
            a white double-bar grip (255:882/883) so they read unmistakably as drag
            affordances (cursor: ew-resize). Double-click the track fits to range. */}
        {[["left", leftHandleX] as const, ["right", rightHandleX] as const].map(
          ([side, hx]) => {
            const center = hx + HANDLE_W / 2;
            return (
              <g
                key={side}
                className="cursor-ew-resize"
                data-minimap-brush-handle={side}
              >
                <rect
                  x={hx}
                  y={HANDLE_Y}
                  width={HANDLE_W}
                  height={HANDLE_H}
                  rx={HANDLE_RADIUS}
                  className="fill-accent"
                />
                {[center - 2, center + 0.5].map((gx) => (
                  <rect
                    key={gx}
                    x={gx}
                    y={GRIP_Y}
                    width={GRIP_W}
                    height={GRIP_H}
                    rx={0.75}
                    className="fill-paper"
                  />
                ))}
              </g>
            );
          },
        )}
      </svg>
    </div>
  );
}
