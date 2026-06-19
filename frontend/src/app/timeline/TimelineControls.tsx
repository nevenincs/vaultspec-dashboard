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

import { useDateRangeIntent } from "../../stores/server/dateRangeIntent";
import {
  useActiveScope,
  useDashboardDateRangeView,
  useFiltersVocabularyView,
} from "../../stores/server/queries";
import { Calendar, IconButton, Maximize, Minus, Plus, Switch } from "../kit";
import { useElementWidth } from "../chrome/useElementWidth";
import {
  fitTimelineNavigationToCorpus,
  fitTimelineNavigationToDateRange,
  jumpTimelineNavigationToLive,
  zoomTimelineNavigation,
} from "../../stores/view/timelineIntent";
import {
  closeTimelineDatePicker,
  formatTimelineDayMonth,
  openTimelineDatePicker,
  orderedTimelineDateInputRange,
  parseTimelineInstant,
  setTimelineDatePickerDraftFrom,
  setTimelineDatePickerDraftTo,
  timelineDateInputValue,
  timelineCanZoomIn,
  timelineCanZoomOut,
  TIMELINE_ZOOM_STEP,
  toggleTimelineLane,
  useTimelineDatePickerState,
  useTimelineLaneVisibility,
  useTimelineScrollState,
} from "../../stores/view/timeline";
import { visibleRange } from "./scrollStrip";

export {
  fitTimelineSpan as fitSpan,
  formatTimelineDayMonth as formatDayMonth,
  timelineJumpToDateOffset as jumpToDateOffset,
  TIMELINE_ZOOM_STEP as ZOOM_STEP,
  parseTimelineDateInput as parseDateInput,
} from "../../stores/view/timeline";

// --- the control bar -------------------------------------------------------------

/** A calendar-iconed date-range pill (binding board: bordered paper pill). */
function DatePill({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  const widthClass = String(children).length > 5 ? "w-[4.8125rem]" : "w-[4.4375rem]";
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={active}
      onClick={onClick}
      className={`inline-flex h-[1.8125rem] ${widthClass} items-center gap-fg-1-5 rounded-fg-md border border-rule/60 bg-paper-sunken pl-[0.5625rem] pr-fg-2 text-[0.75rem] leading-[0.9375rem] text-ink transition-colors duration-ui-fast ease-settle hover:bg-paper-raised focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus`}
    >
      <Calendar size={14} aria-hidden className="text-ink-muted" />
      <span data-tabular className="whitespace-nowrap tabular-nums font-medium">
        {children}
      </span>
    </button>
  );
}

export interface TimelineControlsProps {
  /**
   * The timeline viewport width in px (the surface the controls drive). The fit /
   * zoom math is sized against it; the AppShell passes the measured width. Defaults
   * for standalone use.
   */
  viewportWidth?: number;
  /**
   * Visual-harness escape hatch: product chrome displays canonical dashboard date
   * range when present; screenshot parity can instead show the viewport window
   * driven by URL scroll-strip params without mutating backend dashboard state.
   */
  preferViewportDateRange?: boolean;
}

export function TimelineControls({
  viewportWidth = 800,
  preferViewportDateRange = false,
}: TimelineControlsProps = {}) {
  const scope = useActiveScope();
  const vocabulary = useFiltersVocabularyView(scope);
  const rangeIntent = useDateRangeIntent(scope);
  const datePicker = useTimelineDatePickerState();

  // Scroll-strip view state (zoom / fit / jump write these).
  const { pxPerMs, scrollOffset } = useTimelineScrollState();

  // Per-lane visibility (the "Steps & summaries" switch drives the execution lane).
  const laneVisibility = useTimelineLaneVisibility();

  // The control bar spans the full footer width — the same width as the timeline
  // surface it drives — so it measures its OWN rendered width as the fit / zoom
  // viewport rather than trusting a hardcoded default.
  const rootRef = useRef<HTMLDivElement>(null);
  const measuredWidth = useElementWidth(rootRef, { box: "border" });
  const effectiveWidth = measuredWidth ?? viewportWidth;

  const corpusBounds = vocabulary.dateBounds;

  const canZoomIn = timelineCanZoomIn(pxPerMs);
  const canZoomOut = timelineCanZoomOut(pxPerMs);

  // The visible window's [from, to] for the binding date-range pills — a dumb read
  // of the same scroll-strip view state the surface renders against.
  const visible = visibleRange(scrollOffset, effectiveWidth, pxPerMs, 0);
  const corpusFrom = parseTimelineInstant(corpusBounds?.from);
  const corpusTo = parseTimelineInstant(corpusBounds?.to);
  const dataWindowFallback =
    Number.isFinite(corpusFrom) && Number.isFinite(corpusTo) && corpusFrom < corpusTo
      ? { fromMs: corpusFrom, toMs: corpusTo }
      : visible;
  const dashboardDisplayRange = useDashboardDateRangeView(scope, dataWindowFallback);
  const displayRange = preferViewportDateRange ? visible : dashboardDisplayRange;

  const openDatePicker = () => {
    openTimelineDatePicker(
      timelineDateInputValue(displayRange.fromMs),
      timelineDateInputValue(displayRange.toMs),
    );
  };
  const applyDatePicker = () => {
    const ordered = orderedTimelineDateInputRange(
      datePicker.draftFrom,
      datePicker.draftTo,
    );
    if (ordered === null || !scope) return;
    fitTimelineNavigationToDateRange(ordered, effectiveWidth);
    void rangeIntent.setRange({ from: ordered.from, to: ordered.to });
    closeTimelineDatePicker();
  };
  const clearDatePicker = () => {
    if (scope) void rangeIntent.clearRange();
    closeTimelineDatePicker();
    fitTimelineNavigationToCorpus(corpusBounds, effectiveWidth);
  };

  // The "Steps & summaries" switch toggles the execution lane: its exec + codify
  // phase visibility keys flip together (exec is the lead key the switch reflects).
  const executionVisible = laneVisibility.exec;
  const toggleExecution = (next: boolean) => {
    toggleTimelineLane("exec", next);
    toggleTimelineLane("codify", next);
  };

  return (
    <div
      ref={rootRef}
      className="pointer-events-auto relative z-20 flex h-[2.75rem] items-center gap-fg-2 border-b border-rule bg-paper px-fg-3 text-label"
      data-timeline-controls
    >
      {/* Binding header label (board 239:714): a plain medium "Timeline", not an
          uppercase eyebrow. */}
      <span className="w-[3.375rem] shrink-0 translate-y-[0.03125rem] text-[0.8125rem] font-semibold leading-4 text-ink">
        Timeline
      </span>

      {/* Date-range pills — the visible window's start -> end, calendar-iconed,
          tabular, exactly the "Apr 3 -> Jun 18" readout the board draws. */}
      <span
        className="relative flex shrink-0 translate-y-[0.03125rem] items-center gap-fg-2"
        aria-label="visible date range"
      >
        <DatePill
          label="choose timeline start date"
          active={datePicker.open}
          onClick={openDatePicker}
        >
          {formatTimelineDayMonth(displayRange.fromMs)}
        </DatePill>
        <span
          aria-hidden
          className="inline-block w-3 text-center text-[0.75rem] leading-[0.9375rem] text-ink-faint"
        >
          →
        </span>
        <DatePill
          label="choose timeline end date"
          active={datePicker.open}
          onClick={openDatePicker}
        >
          {formatTimelineDayMonth(displayRange.toMs)}
        </DatePill>
        {datePicker.open && (
          <div
            className="absolute left-0 top-[2.125rem] z-50 flex w-[15.5rem] flex-col gap-fg-1 rounded-fg-md border border-rule bg-paper-raised p-fg-2 text-label text-ink shadow-fg-raised"
            role="dialog"
            aria-label="choose timeline date range"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeTimelineDatePicker();
            }}
          >
            <label className="flex items-center justify-between gap-fg-2">
              <span className="text-ink-muted">Start</span>
              <input
                type="date"
                value={datePicker.draftFrom}
                onChange={(event) =>
                  setTimelineDatePickerDraftFrom(event.currentTarget.value)
                }
                className="h-7 rounded-fg-sm border border-rule/60 bg-paper-sunken px-fg-1 text-label text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              />
            </label>
            <label className="flex items-center justify-between gap-fg-2">
              <span className="text-ink-muted">End</span>
              <input
                type="date"
                value={datePicker.draftTo}
                onChange={(event) =>
                  setTimelineDatePickerDraftTo(event.currentTarget.value)
                }
                className="h-7 rounded-fg-sm border border-rule/60 bg-paper-sunken px-fg-1 text-label text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              />
            </label>
            <span className="mt-fg-1 flex items-center justify-end gap-fg-1">
              <button
                type="button"
                onClick={clearDatePicker}
                className="rounded-fg-sm px-fg-1-5 py-fg-0-5 text-ink-muted transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={applyDatePicker}
                className="rounded-fg-sm bg-accent-subtle px-fg-1-5 py-fg-0-5 text-accent-text transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              >
                Apply
              </button>
            </span>
          </div>
        )}
      </span>

      {/* Flexible gap pushes the switch + control cluster to the right edge. */}
      <span className="flex-1" />

      {/* "Steps & summaries" switch (kit Switch) — toggles the execution lane. */}
      <span className="flex w-[9rem] shrink-0 translate-y-[0.03125rem] items-center justify-between">
        <span className="text-[0.71875rem] leading-[0.875rem] text-ink-muted">
          Steps &amp; summaries
        </span>
        <Switch
          checked={executionVisible}
          onChange={toggleExecution}
          label="Steps & summaries"
        />
      </span>

      {/* Zoom / fit cluster card (board 239:714): zoom in / out / fit-all /
          jump-to-now, kit IconButtons in a bordered card. */}
      <span
        className="flex h-8 w-[7.4375rem] shrink-0 translate-y-[0.03125rem] items-center gap-fg-0-5 rounded-fg-md border border-rule/80 bg-paper-raised px-fg-0-5 py-fg-0-5 text-ink shadow-fg-raised [&_[data-kit=icon-button]]:size-[1.625rem]"
        aria-label="timeline controls"
      >
        <IconButton
          label="zoom in"
          title="zoom in"
          disabled={!canZoomIn}
          onClick={() =>
            zoomTimelineNavigation(
              pxPerMs,
              scrollOffset,
              effectiveWidth,
              TIMELINE_ZOOM_STEP,
            )
          }
        >
          <Plus size={14} aria-hidden />
        </IconButton>
        <IconButton
          label="zoom out"
          title="zoom out"
          disabled={!canZoomOut}
          onClick={() =>
            zoomTimelineNavigation(
              pxPerMs,
              scrollOffset,
              effectiveWidth,
              1 / TIMELINE_ZOOM_STEP,
            )
          }
        >
          <Minus size={14} aria-hidden />
        </IconButton>
        <span className="h-[1.125rem] w-px shrink-0 bg-rule" aria-hidden />
        <IconButton
          label="fit all"
          title="fit the whole corpus"
          onClick={() => fitTimelineNavigationToCorpus(corpusBounds, effectiveWidth)}
        >
          <Maximize size={14} aria-hidden />
        </IconButton>
        <IconButton
          label="jump to now"
          title="jump to the latest instant"
          onClick={() =>
            jumpTimelineNavigationToLive(corpusBounds, pxPerMs, effectiveWidth, scope)
          }
        >
          <Clock size={14} aria-hidden />
        </IconButton>
      </span>
    </div>
  );
}
