// The timeline control bar (figma-frontend-rewrite W03.P08.S11, rebuilt EXACTLY to
// the binding Figma Timeline header, node 239:714 in AppShell 117:2). The board's
// header is a single compact row docked at the timeline's top edge:
//
//   "Timeline" label · a from→to date-range pill pair (calendar-iconed) · a flexible
//   gap · the "Steps & summaries" switch (toggles the execution lane) · a zoom/fit
//   control cluster (zoom in / out / fit-all / jump-to-now).
//
// Figma is binding (figma-is-the-binding-source-of-truth): the richer ADR control
// set the prior build carried (tier dial, relation/feature facet chips, jump-to-date
// input, inline minimap, range-play chip) is RETIRED here — it is not on the board,
// and no ADR overrides the board. Every primitive composes the centralized kit
// (design-system-is-centralized); nothing is hand-built per surface.
//
// Layer ownership (dashboard-layer-ownership): a dumb projection over the preserved
// timeline view store. It reads scroll/zoom + lane-visibility state and emits intent
// (zoom, fit, lane toggle, jump-to-now); it fetches nothing and reads no raw `tiers`
// block. Lucide structural marks (the sanctioned chrome family); tokens only.

import { Clock } from "lucide-react";
import { useRef } from "react";

import { useFiltersVocabulary } from "../../stores/server/queries";
import { Calendar, IconButton, Maximize, Minus, Plus, Switch } from "../kit";
import { useElementWidth } from "../chrome/useElementWidth";
import { useActiveScope } from "../stage/Stage";
import { movePlayhead } from "./Playhead";
import { useTimelineStore } from "./Timeline";
import {
  MAX_PX_PER_MS,
  MIN_PX_PER_MS,
  TIMELINE_ORIGIN_MS,
  clampPxPerMs,
  timeToStripX,
  visibleRange,
  zoomAt,
} from "./scrollStrip";

// --- pure fit/zoom/jump helpers (unit-tested, no DOM, no store) ------------------

/** The factor a single zoom-in / zoom-out step applies to `pxPerMs`. */
export const ZOOM_STEP = 1.6;

/**
 * The scale + offset that fits a closed corpus span [fromMs, toMs] into a viewport
 * of `viewportWidth` px, with a small inset margin so the edge marks are not flush
 * to the frame. Pure and clamped: the resulting scale is held inside the supported
 * zoom band, and the offset docks the span's start at the left inset. A degenerate
 * (zero/negative) span falls back to the minimum scale anchored at the start.
 */
export function fitSpan(
  fromMs: number,
  toMs: number,
  viewportWidth: number,
  insetPx = 24,
): { pxPerMs: number; scrollOffset: number } {
  const usable = Math.max(1, viewportWidth - insetPx * 2);
  const spanMs = toMs - fromMs;
  const rawScale = spanMs > 0 ? usable / spanMs : MIN_PX_PER_MS;
  const pxPerMs = clampPxPerMs(rawScale);
  // Dock the span start at the left inset: stripX(from) - scrollOffset == inset.
  const scrollOffset = Math.max(
    0,
    timeToStripX(fromMs, TIMELINE_ORIGIN_MS, pxPerMs) - insetPx,
  );
  return { pxPerMs, scrollOffset };
}

/**
 * The scroll offset that centres a chosen instant in a viewport of `viewportWidth`
 * px at `pxPerMs` (jump-to-date). Pure and clamped >= 0. The scale is unchanged — a
 * jump moves WHERE you look, not HOW zoomed you are.
 */
export function jumpToDateOffset(
  tMs: number,
  pxPerMs: number,
  viewportWidth: number,
): number {
  return Math.max(
    0,
    timeToStripX(tMs, TIMELINE_ORIGIN_MS, pxPerMs) - viewportWidth / 2,
  );
}

/** Parse an ISO date (yyyy-mm-dd or full) to an epoch-ms instant, or null. */
export function parseDateInput(value: string): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * A short "MMM D" day label for the binding date-range pills (e.g. "Apr 3"). The
 * `en-US` locale matches the binding board's month abbreviations exactly.
 */
export function formatDayMonth(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// --- the control bar -------------------------------------------------------------

/** A calendar-iconed date-range pill (binding board: bordered paper pill). */
function DatePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-fg-1 rounded-fg-md border border-rule bg-paper px-fg-1-5 py-fg-0-5 text-ink-muted">
      <Calendar size={12} aria-hidden className="text-ink-faint" />
      <span data-tabular className="tabular-nums">
        {children}
      </span>
    </span>
  );
}

export interface TimelineControlsProps {
  /**
   * The timeline viewport width in px (the surface the controls drive). The fit /
   * zoom math is sized against it; the AppShell passes the measured width. Defaults
   * for standalone use.
   */
  viewportWidth?: number;
}

export function TimelineControls({ viewportWidth = 800 }: TimelineControlsProps = {}) {
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabulary(scope);

  // Scroll-strip view state (zoom / fit / jump write these).
  const pxPerMs = useTimelineStore((s) => s.pxPerMs);
  const scrollOffset = useTimelineStore((s) => s.scrollOffset);
  const setPxPerMs = useTimelineStore((s) => s.setPxPerMs);
  const setScrollOffset = useTimelineStore((s) => s.setScrollOffset);

  // Per-lane visibility (the "Steps & summaries" switch drives the execution lane).
  const laneVisibility = useTimelineStore((s) => s.laneVisibility);
  const toggleLane = useTimelineStore((s) => s.toggleLane);

  // The control bar spans the full footer width — the same width as the timeline
  // surface it drives — so it measures its OWN rendered width as the fit / zoom
  // viewport rather than trusting a hardcoded default.
  const rootRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useElementWidth(rootRef);
  const effectiveWidth = measuredWidth ?? viewportWidth;

  const corpusBounds = vocabulary.data?.date_bounds;

  // Zoom about the viewport centre, preserving the centred instant, clamped to band.
  const zoomBy = (factor: number) => {
    const next = zoomAt(pxPerMs, scrollOffset, effectiveWidth / 2, factor);
    setPxPerMs(next.pxPerMs);
    setScrollOffset(next.scrollOffset);
  };
  const canZoomIn = pxPerMs < MAX_PX_PER_MS;
  const canZoomOut = pxPerMs > MIN_PX_PER_MS;

  // Fit the whole loaded corpus span (engine-enumerated date bounds) into the view.
  const fitAll = () => {
    const from = corpusBounds?.from ? Date.parse(corpusBounds.from) : NaN;
    const to = corpusBounds?.to ? Date.parse(corpusBounds.to) : Date.now();
    if (!Number.isFinite(from)) return;
    const next = fitSpan(from, Number.isFinite(to) ? to : Date.now(), effectiveWidth);
    setPxPerMs(next.pxPerMs);
    setScrollOffset(next.scrollOffset);
  };

  // Jump to now: dock the strip at the corpus's latest instant and return the
  // playhead to live (the board's clock control).
  const jumpToNow = () => {
    const toRaw = corpusBounds?.to ? Date.parse(corpusBounds.to) : Date.now();
    const end = Number.isFinite(toRaw) ? toRaw : Date.now();
    setScrollOffset(
      Math.max(0, timeToStripX(end, TIMELINE_ORIGIN_MS, pxPerMs) - effectiveWidth + 24),
    );
    movePlayhead("live");
  };

  // The visible window's [from, to] for the binding date-range pills — a dumb read
  // of the same scroll-strip view state the surface renders against.
  const visible = visibleRange(scrollOffset, effectiveWidth, pxPerMs, 0);

  // The "Steps & summaries" switch toggles the execution lane: its exec + codify
  // phase visibility keys flip together (exec is the lead key the switch reflects).
  const executionVisible = laneVisibility.exec;
  const toggleExecution = (next: boolean) => {
    toggleLane("exec", next);
    toggleLane("codify", next);
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto flex items-center gap-fg-2 border-b border-rule bg-paper-raised px-fg-3 py-fg-2 text-label"
      data-timeline-controls
    >
      {/* Binding header label (board 239:714): a plain medium "Timeline", not an
          uppercase eyebrow. */}
      <span className="shrink-0 font-medium text-ink">Timeline</span>

      {/* Date-range pills — the visible window's start -> end, calendar-iconed,
          tabular, exactly the "Apr 3 -> Jun 18" readout the board draws. */}
      <span
        className="flex shrink-0 items-center gap-fg-1-5"
        aria-label="visible date range"
      >
        <DatePill>{formatDayMonth(visible.fromMs)}</DatePill>
        <span aria-hidden className="text-ink-faint">
          →
        </span>
        <DatePill>{formatDayMonth(visible.toMs)}</DatePill>
      </span>

      {/* Flexible gap pushes the switch + control cluster to the right edge. */}
      <span className="flex-1" />

      {/* "Steps & summaries" switch (kit Switch) — toggles the execution lane. */}
      <span className="flex shrink-0 items-center gap-fg-1-5">
        <span className="text-ink-muted">Steps &amp; summaries</span>
        <Switch
          checked={executionVisible}
          onChange={toggleExecution}
          label="Steps & summaries"
        />
      </span>

      {/* Zoom / fit cluster card (board 239:714): zoom in / out / fit-all /
          jump-to-now, kit IconButtons in a bordered card. */}
      <span
        className="flex shrink-0 items-center gap-fg-0-5 rounded-fg-md border border-rule bg-paper-raised px-fg-1 py-fg-0-5"
        aria-label="timeline controls"
      >
        <IconButton
          label="zoom in"
          title="zoom in"
          disabled={!canZoomIn}
          onClick={() => zoomBy(ZOOM_STEP)}
        >
          <Plus size={14} aria-hidden />
        </IconButton>
        <IconButton
          label="zoom out"
          title="zoom out"
          disabled={!canZoomOut}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
        >
          <Minus size={14} aria-hidden />
        </IconButton>
        <IconButton label="fit all" title="fit the whole corpus" onClick={fitAll}>
          <Maximize size={14} aria-hidden />
        </IconButton>
        <IconButton
          label="jump to now"
          title="jump to the latest instant"
          onClick={jumpToNow}
        >
          <Clock size={14} aria-hidden />
        </IconButton>
      </span>
    </div>
  );
}
