// The timeline control bar (dashboard-timeline ADR "Control surfaces (the bars)",
// W04.P08): the instrument's control surface, docked at the timeline's top edge.
// It composes — left to right — the phase-lane show/hide toggles (S46), the
// relation/derivation filter chips (S47), the reused tier dial (S48), the feature
// filter (S49), the zoom / fit-all / fit-feature / jump-to-date controls (S50-S53)
// with the minimap as scrubber (S54), and the range-select chip with play-the-range
// (S55).
//
// Vocabulary discipline (ADR / icons-come-from-the-two-sanctioned-families): the
// relation/derivation chip vocabulary AND the feature-tag vocabulary come from the
// engine `/filters` enumeration (`useFiltersVocabulary`) — NOTHING hardcoded. The
// lane vocabulary is the one phase-lane source of truth (`PHASE_LANES`).
//
// Filter discipline (the single filter model): relation and feature choices write
// the shared filter store (`relations`, `featureTags`); the date range writes ONLY
// through `setDateRange` (the single date-range writer invariant). The bar reads
// store/hook state and emits intent — it fetches nothing and reads no raw `tiers`.
//
// Design discipline (warmth-in-tokens / themes-are-oklch): all chrome draws from
// the `:root` token layer (no literal hex); Lucide for structural chrome marks and
// the Phosphor domain marks (via the tier dial / shared registry) for domain marks;
// tabular numerals on every date and count; non-color active cues (rings, pressed
// state, filled brush); every control is a real keyboard-reachable button / switch.

import { CalendarDays, Maximize2, Scan, X, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useFiltersVocabulary } from "../../stores/server/queries";
import { useFilterStore } from "../../stores/view/filters";
import { FacetChipGroup } from "../chrome/FacetChipGroup";
import { useElementWidth } from "../chrome/useElementWidth";
import { TierDial } from "../stage/TierDial";
import { useActiveScope } from "../stage/Stage";
import { movePlayhead } from "./Playhead";
import { startRangePlay, stopRangePlay, useRangePlayer } from "./RangeSelect";
import { humanInstant, useTimelineStore } from "./Timeline";
import { Minimap } from "./Minimap";
import { PHASE_LANES, laneLabel } from "./phaseLanes";
import {
  MAX_PX_PER_MS,
  MIN_PX_PER_MS,
  TIMELINE_ORIGIN_MS,
  clampPxPerMs,
  timeToStripX,
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
 * px at `pxPerMs` (jump-to-date). Pure and clamped ≥ 0. The scale is unchanged — a
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

// --- the control bar -------------------------------------------------------------

export interface TimelineControlsProps {
  /**
   * The timeline viewport width in px (the surface the controls drive). The fit /
   * zoom / jump math and the minimap brush are sized against it; the AppShell
   * (W05.P10) passes the measured width. Defaults for standalone use.
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

  // Per-lane visibility (the lane toggles drive these).
  const laneVisibility = useTimelineStore((s) => s.laneVisibility);
  const toggleLane = useTimelineStore((s) => s.toggleLane);

  // The single filter model: relation + feature choices live here; the date range
  // is written ONLY through setDateRange (the single date-range writer invariant).
  const relations = useFilterStore((s) => s.relations);
  const featureTags = useFilterStore((s) => s.featureTags);
  const toggleFacet = useFilterStore((s) => s.toggleFacet);
  const dateRange = useFilterStore((s) => s.dateRange);
  const setDateRange = useFilterStore((s) => s.setDateRange);

  const [jumpValue, setJumpValue] = useState("");

  // The control bar spans the full footer width, the same width as the timeline
  // surface it drives, so it measures its OWN rendered width as the fit / zoom /
  // jump / minimap viewport rather than trusting a hardcoded default. The
  // `viewportWidth` prop is the pre-measurement fallback (and the standalone /
  // test default). LOW-1: the AppShell mounts this without a measured width.
  const rootRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useElementWidth(rootRef);
  const effectiveWidth = measuredWidth ?? viewportWidth;

  // The range player RAF loop lives wherever the play trigger is mounted; the
  // control bar owns the chip's play trigger, so it drives the loop here.
  useRangePlayer();

  const relationVocab = useMemo(
    () => vocabulary.data?.relations ?? [],
    [vocabulary.data?.relations],
  );
  const featureVocab = useMemo(
    () => (vocabulary.data?.feature_tags ?? []).slice(0, 8),
    [vocabulary.data?.feature_tags],
  );
  const corpusBounds = vocabulary.data?.date_bounds;

  // S50 zoom: rescale about the viewport centre, preserving the centred instant
  // (the scroll-model analogue of zoom-to-cursor), clamped to the supported band.
  const zoomBy = (factor: number) => {
    const next = zoomAt(pxPerMs, scrollOffset, effectiveWidth / 2, factor);
    setPxPerMs(next.pxPerMs);
    setScrollOffset(next.scrollOffset);
  };
  const canZoomIn = pxPerMs < MAX_PX_PER_MS;
  const canZoomOut = pxPerMs > MIN_PX_PER_MS;

  // S51 fit-all: fit the whole loaded corpus span (engine-enumerated date bounds)
  // into the viewport. A dumb projection — the corpus extent comes from the wire.
  const fitAll = () => {
    const from = corpusBounds?.from ? Date.parse(corpusBounds.from) : NaN;
    const to = corpusBounds?.to ? Date.parse(corpusBounds.to) : Date.now();
    if (!Number.isFinite(from)) return;
    const next = fitSpan(from, Number.isFinite(to) ? to : Date.now(), effectiveWidth);
    setPxPerMs(next.pxPerMs);
    setScrollOffset(next.scrollOffset);
  };

  // S52 fit-feature: fit to the active feature filter's committed date span. The
  // span comes from the committed `dateRange` when a range is set with features
  // active, else from the corpus bounds (the feature filter alone narrows the
  // arcs, not the dates). Disabled until a feature filter is active.
  const featureActive = featureTags.length > 0;
  const fitFeature = () => {
    const from = dateRange.from
      ? Date.parse(dateRange.from)
      : corpusBounds?.from
        ? Date.parse(corpusBounds.from)
        : NaN;
    const to = dateRange.to
      ? Date.parse(dateRange.to)
      : corpusBounds?.to
        ? Date.parse(corpusBounds.to)
        : Date.now();
    if (!Number.isFinite(from)) return;
    const next = fitSpan(from, Number.isFinite(to) ? to : Date.now(), effectiveWidth);
    setPxPerMs(next.pxPerMs);
    setScrollOffset(next.scrollOffset);
  };

  // S53 jump-to-date: centre a chosen instant, scale unchanged.
  const jump = () => {
    const t = parseDateInput(jumpValue);
    if (t == null) return;
    setScrollOffset(jumpToDateOffset(t, pxPerMs, effectiveWidth));
  };

  // S55 range chip: clearing returns toward LIVE (the single date-range writer);
  // playing the range animates the playhead across the committed band.
  const rangeSet = Boolean(dateRange.from && dateRange.to);
  const clearRange = () => {
    stopRangePlay();
    setDateRange({});
    movePlayhead("live");
  };
  const playRange = () => {
    if (!dateRange.from || !dateRange.to) return;
    startRangePlay(
      Date.parse(dateRange.from),
      Date.parse(dateRange.to),
      performance.now(),
    );
  };

  return (
    <div
      ref={rootRef}
      // A single non-wrapping instrument row (binding Figma 17:694: the control
      // bar is ONE compact row docked at the top edge, not a stack that grows
      // downward and starves the chart). Overflow scrolls horizontally so the
      // full ADR control set (tier dial + feature filter, which the Figma mock
      // omits) stays reachable without eating the lineage surface's height. Each
      // group is `shrink-0` so it keeps its intrinsic width inside the scroller.
      className="pointer-events-auto flex items-center gap-vs-3 overflow-x-auto border-b border-rule bg-paper-raised/90 px-vs-2 py-vs-1 text-label backdrop-blur-sm [scrollbar-width:thin]"
      data-timeline-controls
    >
      {/* S46 phase-lane show/hide toggles — one per PHASE_LANES entry, shape-first
          label, non-color active cue (pressed = sunken + strong rule). */}
      <span className="flex shrink-0 items-center gap-1" aria-label="phase lanes">
        <span className="text-ink-faint">lanes</span>
        {PHASE_LANES.map((lane) => {
          const visible = laneVisibility[lane];
          const label = laneLabel(lane);
          return (
            <button
              key={lane}
              type="button"
              role="switch"
              aria-checked={visible}
              aria-label={`${label} lane`}
              onClick={() => toggleLane(lane)}
              data-lane-toggle={lane}
              className={`rounded-full border px-vs-1-5 py-vs-0-5 transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
                visible
                  ? "border-rule-strong bg-paper-sunken text-ink"
                  : "border-dashed border-rule text-ink-faint hover:border-rule-strong"
              }`}
            >
              {label}
            </button>
          );
        })}
      </span>

      {/* S47 relation/derivation filter chips — vocabulary from the engine enum. */}
      <span className="flex shrink-0 items-center">
        <FacetChipGroup
          label="relation"
          values={relationVocab}
          selected={relations}
          onToggle={(v) => toggleFacet("relations", v)}
          emptyHint="…"
        />
      </span>

      {/* S48 the reused tier dial (semantic inapplicable in time-travel is read
          from the shared timelineMode inside the dial itself). */}
      <span className="flex shrink-0 items-center">
        <TierDial />
      </span>

      {/* S49 feature filter — vocabulary from the engine feature-tag enum; writing
          featureTags collapses the arcs to that feature's lineage thread. */}
      <span className="flex shrink-0 items-center">
        <FacetChipGroup
          label="feature"
          values={featureVocab}
          selected={featureTags}
          onToggle={(v) => toggleFacet("featureTags", v)}
          emptyHint="…"
        />
      </span>

      {/* S50/S51/S52/S53 zoom / fit / jump controls. */}
      <span className="flex shrink-0 items-center gap-vs-1" aria-label="zoom and fit">
        <button
          type="button"
          aria-label="zoom out"
          title="zoom out"
          disabled={!canZoomOut}
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          className="flex items-center rounded-vs-sm border border-rule p-vs-1 text-ink-muted transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          <ZoomOut size={13} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="zoom in"
          title="zoom in"
          disabled={!canZoomIn}
          onClick={() => zoomBy(ZOOM_STEP)}
          className="flex items-center rounded-vs-sm border border-rule p-vs-1 text-ink-muted transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          <ZoomIn size={13} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="fit all"
          title="fit the whole corpus"
          onClick={fitAll}
          className="flex items-center rounded-vs-sm border border-rule p-vs-1 text-ink-muted transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          <Maximize2 size={13} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="fit feature"
          title="fit the active feature's span"
          disabled={!featureActive}
          onClick={fitFeature}
          className="flex items-center rounded-vs-sm border border-rule p-vs-1 text-ink-muted transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          <Scan size={13} aria-hidden />
        </button>
      </span>

      {/* S53 jump-to-date — a real date input + go button; tabular by the input. */}
      <span
        className="flex shrink-0 items-center gap-vs-1"
        aria-label="jump to date controls"
      >
        <CalendarDays size={13} aria-hidden className="text-ink-faint" />
        <input
          type="date"
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") jump();
          }}
          aria-label="jump to date"
          data-tabular
          className="rounded-vs-sm border border-rule bg-paper-raised px-vs-1 py-vs-0-5 tabular-nums text-ink-muted focus:border-rule-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus focus:outline-none"
        />
        <button
          type="button"
          aria-label="go to date"
          title="jump to the chosen date"
          disabled={parseDateInput(jumpValue) == null}
          onClick={jump}
          className="rounded-vs-sm border border-rule px-vs-1-5 py-vs-0-5 text-ink-muted transition-colors duration-ui-fast ease-settle hover:border-rule-strong hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          go
        </button>
      </span>

      {/* S54 the minimap as scrubber — a dumb overview ribbon reading the corpus
          span + store, doubling as a horizontal scrubber. */}
      <span className="flex shrink-0 items-center">
        <Minimap viewportWidth={effectiveWidth} />
      </span>

      {/* S55 the range-select chip with play-the-range. Renders the committed
          dateRange as a clearable, tabular chip; clearing returns toward LIVE. */}
      {rangeSet && (
        <span
          className="flex shrink-0 items-center gap-vs-1 rounded-full border border-rule bg-paper px-vs-1-5 py-vs-0-5 text-ink-muted"
          data-range-chip
        >
          <span data-tabular className="tabular-nums">
            {humanInstant(dateRange.from!).slice(0, 10)} →{" "}
            {humanInstant(dateRange.to!).slice(0, 10)}
          </span>
          <button
            type="button"
            aria-label="play the selected range"
            title="play the range — watch the network grow"
            onClick={playRange}
            className="rounded-vs-sm bg-accent-subtle px-vs-1 py-vs-0-5 text-accent-text transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            play
          </button>
          <button
            type="button"
            aria-label="clear date range"
            title="clear the range and return to live"
            onClick={clearRange}
            className="flex items-center rounded-vs-sm text-ink-faint transition-colors duration-ui-fast ease-settle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            <X size={11} aria-hidden />
          </button>
        </span>
      )}
    </div>
  );
}
