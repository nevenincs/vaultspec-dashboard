// @figma TimelineRange · SlhonORmySdoSMTQgDWw3w · 1005:4203
//
// The timeline (Issue #14): a thin, minimal two-handle date-range FILTER strip that
// lives at the bottom of the graph. No scroll, no playhead, no lineage dots. The left
// edge is the OLDEST vault document and the right the LATEST (by the active date
// criterion); the chosen start/end IS the canonical `date_range` filter, so narrowing
// the range narrows the rail tree AND the graph in lock-step (the timeline is the sole
// date_range writer — filtering-has-one-canonical-surface). The active criterion
// (created/modified/stamped) also rides as the `date_field` facet so the corpus
// narrows by the chosen field; the criterion is the engine-served
// `timeline_date_criterion` setting, chosen from the "Filter by" context menu. The
// engine serves the corpus span for ALL THREE fields (`date_bounds_by_field`:
// created / modified / stamped), so the strip's edges track the ACTIVE criterion's
// span — not a created-only fallback (TTR-008); the flat `dateBounds` (created) is the
// fallback ONLY when a criterion is genuinely absent from the corpus. The criterion is
// selected either from the "Filter by" context menu OR the on-strip SegmentedToggle
// below (TTR-008b) — both write the ONE engine-served `timeline_date_criterion` setting
// through the same seam; Modified/Stamped stay disabled-with-reason until it is served.
//
// Presentation matches the binding TimelineRange State= set (1005:4203, Typical
// variant cloned from the prior canonical frame 993:4204): a single low row — small
// day+month readout (no year) · a thin scrubber track with two small handles — all
// token/rem, no display fonts. The Loading / Degraded / Empty variants mirror the
// same set's State= axis.
// One shared core serves the desktop footer and the compact mobile pane (the `variant`
// only enlarges the touch targets on compact).
//
// Layer law (dashboard-layer-ownership): dumb chrome. It reads the served corpus span
// + the canonical date_range + the criterion setting, and writes through the
// dashboard-state / settings mutation seams. It fetches nothing, reads no raw `tiers`.

import { useRef } from "react";

import { Segment, SegmentedToggle, Skeleton, SkeletonBar, StateBlock } from "../kit";
import {
  useDashboardDateRangeView,
  useFiltersVocabularyView,
  useTimelineAvailability,
  useTimelineDateCriterion,
} from "../../stores/server/queries";
import { useDashboardStateMutations } from "../../stores/server/dashboardState";
import { setTimelineDateCriterion } from "../../stores/server/timelineDateCriterionIntent";
import {
  TIMELINE_DATE_CRITERIA,
  type TimelineDateCriterion,
} from "./timelineDateCriterion";
import {
  clampToSpan,
  dayMonth,
  nextRangeForHandle,
  parseISO,
  ratioAtClientX,
  msAtRatio,
  rangeIsNarrowed,
  rangeWritePayload,
  spanRatio,
} from "./timelineRangeMath";

export type TimelineRangeVariant = "desktop" | "compact";

export interface TimelineRangeProps {
  scope: unknown;
  variant?: TimelineRangeVariant;
}

export function TimelineRange({ scope, variant = "desktop" }: TimelineRangeProps) {
  const vocabulary = useFiltersVocabularyView(scope);
  const availability = useTimelineAvailability(scope);
  const { criterion, served } = useTimelineDateCriterion(scope);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeHandle = useRef<"from" | "to" | null>(null);

  // The corpus edges for the ACTIVE criterion (Issue #14): per-criterion bounds when
  // the engine serves them, else the flat created span.
  const criterionBounds =
    vocabulary.dateBoundsByField?.[criterion] ?? vocabulary.dateBounds;
  const minMs = parseISO(criterionBounds?.from);
  const maxMs = parseISO(criterionBounds?.to);
  const hasSpan = minMs !== null && maxMs !== null && maxMs > minMs;

  const range = useDashboardDateRangeView(scope, {
    fromMs: minMs ?? 0,
    toMs: maxMs ?? 0,
  });
  const mutations = useDashboardStateMutations(scope);

  const lo = minMs ?? 0;
  const hi = maxMs ?? 0;
  const fromMs = clampToSpan(range.fromMs, lo, hi);
  const toMs = clampToSpan(range.toMs, lo, hi);
  const isNarrowed = rangeIsNarrowed(range.source, fromMs, toMs, lo, hi);

  // State modes (state-mode-uniformity ADR D5/W2; the rail state bodies are the
  // reference template). All hooks above run unconditionally, so these early
  // returns are rules-of-hooks safe. The timeline is a thin date-range selector,
  // so its non-typical states are compact and rendered inline. Priority:
  // LOADING (bounds in flight) -> DEGRADED (a structural/temporal tier is down, so
  // the bounds are unreliable; read from the tiers block per
  // degradation-is-read-from-tiers, never guessed from a transport error) ->
  // EMPTY (loaded, but the corpus carries no dated documents to scrub) -> TYPICAL.
  // Single-row height derived from the binding TimelineRange State= set (1005:4203):
  // every state variant is a 44px-tall row (2.75rem, value-preserving — no spacing
  // token sits at 2.75rem) with its content vertically centered, so the strip
  // occupies the least space rather than filling a fixed panel height.
  const containerClassName =
    "flex h-[2.75rem] w-full items-center gap-fg-4 bg-paper px-fg-4 select-none";
  if (vocabulary.loading) {
    return (
      <div className={containerClassName} data-timeline data-timeline-loading>
        <Skeleton
          label="Loading timeline range"
          className="flex w-full items-center gap-fg-4"
        >
          <SkeletonBar width="w-16" height="h-3" />
          <SkeletonBar height="h-1" className="flex-1" />
          <SkeletonBar width="w-12" height="h-3" />
        </Skeleton>
      </div>
    );
  }
  if (availability.degraded) {
    return (
      <div className={containerClassName} data-timeline data-timeline-degraded>
        <StateBlock
          mode="degraded"
          layout="inline"
          message="Timeline data is temporarily unavailable."
        />
      </div>
    );
  }
  if (!hasSpan) {
    return (
      <div className={containerClassName} data-timeline data-timeline-empty>
        <StateBlock
          mode="empty"
          layout="inline"
          message="No dated documents to scrub in this view."
        />
      </div>
    );
  }

  const moveHandle = (which: "from" | "to", clientX: number) => {
    const el = trackRef.current;
    if (!el || !hasSpan) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ms = msAtRatio(ratioAtClientX(clientX, rect.left, rect.width), lo, hi);
    // Clear the date filter when the drag covers the whole corpus, so widening fully
    // is reversible (undated docs would otherwise stay hidden — filtering regression).
    void mutations.setDateRange(
      rangeWritePayload(nextRangeForHandle(which, ms, fromMs, toMs), lo, hi),
    );
  };

  // Double-click anywhere on the strip resets the timeline (Issue #14: retain
  // double-click = filter reset). Clears ONLY the date_range facet through the
  // canonical seam — never a whole-record clobber — which widens the handles back to
  // the full corpus span.
  const resetRange = () => void mutations.setDateRange({});

  const handleSize = variant === "compact" ? "size-[1.25rem]" : "size-[0.875rem]";

  const handleProps = (which: "from" | "to") => ({
    role: "slider" as const,
    "aria-label": which === "from" ? "Range start" : "Range end",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.round(
      spanRatio(which === "from" ? fromMs : toMs, lo, hi) * 100,
    ),
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      activeHandle.current = which;
      moveHandle(which, e.clientX);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (activeHandle.current === which && e.buttons === 1)
        moveHandle(which, e.clientX);
    },
    onPointerUp: () => {
      activeHandle.current = null;
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!hasSpan) return;
      e.preventDefault();
      const stepMs = Math.max(1, (hi - lo) / 100);
      const cur = which === "from" ? fromMs : toMs;
      const next = clampToSpan(
        cur + (e.key === "ArrowRight" ? stepMs : -stepMs),
        lo,
        hi,
      );
      // Through the same one-step-gap helper as pointer drags, so arrow-key nudges
      // can never push the handles onto each other either.
      void mutations.setDateRange(
        rangeWritePayload(nextRangeForHandle(which, next, fromMs, toMs), lo, hi),
      );
    },
  });

  const handleClassName = `absolute top-1/2 ${handleSize} -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-fg-pill border-2 border-paper bg-accent shadow-fg-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`;

  const readout = hasSpan ? `${dayMonth(fromMs)} – ${dayMonth(toMs)}` : "—";

  return (
    <div
      className="flex h-[2.75rem] w-full items-center gap-fg-4 bg-paper px-fg-4 select-none"
      onDoubleClick={resetRange}
      data-timeline
      data-timeline-range
    >
      <span
        data-tabular
        className="shrink-0 text-label tabular-nums text-ink"
        aria-label="selected date range"
      >
        {readout}
      </span>

      {/* The thin scrubber track fills the middle. */}
      <div className="flex h-fg-5 flex-1 items-center" data-timeline-track-row>
        <div
          ref={trackRef}
          className="relative h-1 w-full rounded-fg-pill bg-paper-sunken"
          data-timeline-range-track
        >
          <div
            className="absolute inset-y-0 rounded-fg-pill bg-accent"
            style={{
              left: `${spanRatio(fromMs, lo, hi) * 100}%`,
              width: `${Math.max(0, (spanRatio(toMs, lo, hi) - spanRatio(fromMs, lo, hi)) * 100)}%`,
            }}
          />
          <span
            {...handleProps("from")}
            className={handleClassName}
            style={{ left: `${spanRatio(fromMs, lo, hi) * 100}%` }}
          />
          <span
            {...handleProps("to")}
            className={handleClassName}
            style={{ left: `${spanRatio(toMs, lo, hi) * 100}%` }}
          />
        </div>
      </div>

      {/* On-strip date-criterion selector (TTR-008b): switches WHICH date field the
          strip's edges + the `date_range` filter key off. Writes the one engine-served
          `timeline_date_criterion` setting through the SAME seam the "Filter by" menu
          uses — never a second writer (display-state-is-backend-served /
          settings-are-schema-driven). Modified/Stamped disable with an honest reason
          until the engine serves the setting; the per-criterion bounds (TTR-008) make
          the edges follow the choice automatically. */}
      <SegmentedToggle
        value={criterion}
        onChange={(next) =>
          void setTimelineDateCriterion(next as TimelineDateCriterion)
        }
        ariaLabel="timeline date field"
        className="shrink-0"
      >
        {TIMELINE_DATE_CRITERIA.map((c) => {
          const gated = c.id !== "created" && !served;
          return (
            <Segment
              key={c.id}
              value={c.id}
              disabled={gated}
              title={
                gated ? c.unavailableReason : `Range by ${c.label.toLowerCase()} date`
              }
            >
              {c.label}
            </Segment>
          );
        })}
      </SegmentedToggle>

      {isNarrowed && (
        <button
          type="button"
          onClick={resetRange}
          className="shrink-0 rounded-fg-sm px-fg-1-5 py-fg-0-5 text-caption font-medium text-accent-text transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          Clear
        </button>
      )}
    </div>
  );
}
