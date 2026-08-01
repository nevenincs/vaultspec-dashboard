import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { localizationNamespaces } from "../../platform/localization/runtime";
import { formatDate } from "../../platform/localization/formatters";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { Skeleton, SkeletonBar, StateBlock } from "../kit";
import {
  useDashboardDateRangeView,
  useDashboardState,
  useFiltersVocabularyView,
  useTimelineAvailability,
  useTimelineDateCriterion,
  useWorkspaceMapSurface,
} from "../../stores/server/queries";
import { normalizeDashboardGraphCorpus } from "../../stores/server/dashboardStateNormalization";
import { setTimelineDateCriterion } from "../../stores/server/timelineDateCriterionIntent";
import { DateBasisSelect, type DateBasisOption } from "./DateBasisSelect";
import {
  TIMELINE_DATE_CRITERIA,
  TIMELINE_DATE_CRITERION_MESSAGES,
  timelineDateCriterionIsAvailable,
  timelineDateCriterionPresentation,
} from "./timelineDateCriterion";
import { useTimelineDateRangeSetter } from "./timelineDateRangeSetter";
import {
  clampToSpan,
  isDoubleTap,
  nextRangeForHandle,
  parseISO,
  ratioAtClientX,
  msAtRatio,
  rangeIsNarrowed,
  spanRatio,
  type TimelineTap,
} from "./timelineRangeMath";

/** A pointer landing on a range HANDLE, whose own drag session owns the gesture. */
function isHandleTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[role="slider"]') !== null;
}

const TIMELINE_RANGE_MESSAGES = Object.freeze({
  clear: Object.freeze({ key: "timeline:actions.clearDateRange" }),
  emptyDocuments: Object.freeze({ key: "timeline:states.noDatedDocuments" }),
  emptyFiles: Object.freeze({ key: "timeline:states.noDatedFiles" }),
  end: Object.freeze({ key: "timeline:accessibility.rangeEnd" }),
  loading: Object.freeze({ key: "timeline:accessibility.loadingRange" }),
  selected: Object.freeze({ key: "timeline:accessibility.selectedRange" }),
  selectedSummary: Object.freeze({ key: "timeline:summaries.selectedRange" }),
  start: Object.freeze({ key: "timeline:accessibility.rangeStart" }),
  unavailable: Object.freeze({ key: "timeline:states.rangeUnavailable" }),
} as const);

export type TimelineRangeVariant = "desktop" | "compact";

/** The handle footprint, shared by the live selector and its ghost so the two
 *  non-populated modes mirror the real geometry exactly. Compact grows the handle
 *  to the touch target. */
function handleFootprint(variant: TimelineRangeVariant): string {
  return variant === "compact" ? "size-[1.25rem]" : "size-[0.875rem]";
}

/** The date-basis control's ghost footprint: the dropdown's bordered pill with its
 *  leading mark, value, and chevron blocked out — mirroring the live
 *  `DateBasisSelect` geometry rather than the retired segmented triple's wider bar
 *  (owner review [msacnto1]). Bordered, never raised: the ghost paints in the
 *  neutral rule gray only. */
function DateBasisGhost() {
  return (
    <div className="flex shrink-0 items-center gap-fg-1-5 rounded-fg-md border border-rule px-fg-2 py-fg-1">
      <span className="size-[0.875rem] shrink-0 rounded-fg-xs bg-rule-strong" />
      <SkeletonBar width="w-[3.5rem]" height="h-3" />
      <span className="size-[0.875rem] shrink-0 rounded-fg-xs bg-rule-strong" />
    </div>
  );
}

/** The GHOST timeline: the default mode's own geometry — the selected-range
 *  summary, the range track with both handles, and the date-basis control — drawn
 *  in the neutral skeleton gray instead of the accent. Loading pulses it under the
 *  shared `Skeleton` (loading is UI-only: no on-screen copy, state-mode-uniformity
 *  ADR D2); empty renders it static and inert with both handles pinned to the span
 *  ends, so an undated corpus shows a locked, obviously-disabled timeline rather
 *  than a bare sentence. Decorative in both: the human sentence lives in the
 *  `Skeleton`'s sr-only label (loading) or the empty branch's own sr-only text. */
export function TimelineGhost({ variant }: { variant: TimelineRangeVariant }) {
  const handleClassName = `absolute top-1/2 ${handleFootprint(
    variant,
  )} -translate-x-1/2 -translate-y-1/2 rounded-fg-pill border-2 border-paper bg-rule-strong`;
  return (
    <div aria-hidden data-timeline-ghost className="flex w-full items-center gap-fg-4">
      <SkeletonBar width="w-[6rem]" height="h-3" />
      <div className="flex h-fg-5 flex-1 items-center" data-timeline-track-row>
        <div
          className="relative h-1 w-full rounded-fg-pill bg-paper-sunken"
          data-timeline-range-track
        >
          {/* The locked full span: the selection covers the whole track, so the
              range reads as bounded and un-narrowable rather than absent. */}
          <div className="absolute inset-0 rounded-fg-pill bg-rule-strong" />
          <span className={handleClassName} style={{ left: "0%" }} />
          <span className={handleClassName} style={{ left: "100%" }} />
        </div>
      </div>
      <DateBasisGhost />
    </div>
  );
}

export interface TimelineRangeProps {
  scope: unknown;
  variant?: TimelineRangeVariant;
}

export function TimelineRange({ scope, variant = "desktop" }: TimelineRangeProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const { i18n } = useTranslation(localizationNamespaces, { useSuspense: false });
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const corpus = normalizeDashboardGraphCorpus(useDashboardState(scope).data?.corpus);
  const isCode = corpus === "code";
  const vocabulary = useFiltersVocabularyView(scope, corpus);
  const availability = useTimelineAvailability(scope, corpus);
  // A null `scope` disables the vocabulary/availability queries above outright,
  // so a workspace resolution failure (the `/map` read errored, or its tiers
  // report structural down) would otherwise fall straight through to the empty
  // branch below — reporting "no dated documents" during a genuine backend
  // outage instead of the degraded treatment (state-mode-uniformity ADR D1).
  // Read from the stores-owned workspace-map surface truth, never guessed from a
  // bare transport error.
  const workspaceMapSurface = useWorkspaceMapSurface();
  const scopeResolutionFailed =
    scope === null &&
    (workspaceMapSurface.state === "error" ||
      workspaceMapSurface.availability.degraded);
  const { criterion: vaultCriterion, served } = useTimelineDateCriterion(scope);
  const criterion = isCode ? "modified" : vaultCriterion;
  const dateFieldLabel = resolveMessage(TIMELINE_DATE_CRITERION_MESSAGES.dateField);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeHandle = useRef<"from" | "to" | null>(null);

  const criterionBounds =
    vocabulary.dateBoundsByField?.[criterion] ?? vocabulary.dateBounds;
  const minMs = parseISO(criterionBounds?.from);
  const maxMs = parseISO(criterionBounds?.to);
  const hasSpan = minMs !== null && maxMs !== null && maxMs > minMs;

  const range = useDashboardDateRangeView(scope, {
    fromMs: minMs ?? 0,
    toMs: maxMs ?? 0,
  });

  const lo = minMs ?? 0;
  const hi = maxMs ?? 0;
  // The ONE date_range writer (filtering-has-one-canonical-surface). The seam is
  // shared with the filter flyout's temporal presets so both commit the same
  // payload through the same mutation — see `timelineDateRangeSetter`.
  const { setDateRange, resetDateRange } = useTimelineDateRangeSetter(scope, {
    lo,
    hi,
  });
  // Double-click (and double-TAP, which no engine dispatches a `dblclick` for
  // reliably) on the track or the date label RESTORES the full range — owner review
  // [msa28dxz]. Coarse pointers get an explicit tap-pair detector; both paths land
  // on the same sanctioned Setter.
  const lastTap = useRef<TimelineTap | null>(null);
  const fromMs = clampToSpan(range.fromMs, lo, hi);
  const toMs = clampToSpan(range.toMs, lo, hi);
  const isNarrowed = rangeIsNarrowed(range.source, fromMs, toMs, lo, hi);

  const containerClassName =
    "flex h-[2.75rem] w-full items-center gap-fg-4 bg-paper px-fg-4 select-none";
  if (vocabulary.loading) {
    const loading = resolveMessage(TIMELINE_RANGE_MESSAGES.loading);
    if (loading.usedFallback) return null;
    return (
      <div className={containerClassName} data-timeline data-timeline-loading>
        {/* One ghost child, not three loose bars laid out by an overridden wrapper:
            the kit `Skeleton` is a COLUMN, so its own row is what shapes the ghost. */}
        <Skeleton label={loading.message} className="w-full">
          <TimelineGhost variant={variant} />
        </Skeleton>
      </div>
    );
  }
  if (availability.degraded || scopeResolutionFailed) {
    const unavailable = resolveMessage(TIMELINE_RANGE_MESSAGES.unavailable);
    if (unavailable.usedFallback) return null;
    return (
      // The timeline strip is already its own framed footer surface, so the notice
      // renders BARE — a nested sunken plate reads as a second floating card.
      <div className={containerClassName} data-timeline data-timeline-degraded>
        <StateBlock mode="degraded" layout="bare" message={unavailable.message} />
      </div>
    );
  }
  if (!hasSpan) {
    const empty = resolveMessage(
      isCode
        ? TIMELINE_RANGE_MESSAGES.emptyFiles
        : TIMELINE_RANGE_MESSAGES.emptyDocuments,
    );
    if (empty.usedFallback) return null;
    return (
      // Empty renders the SAME ghost geometry, inert and locked to the full span,
      // with the plain sentence carried for assistive tech only.
      <div
        role="group"
        aria-disabled="true"
        className={containerClassName}
        data-timeline
        data-timeline-empty
      >
        <p className="sr-only">{empty.message}</p>
        <TimelineGhost variant={variant} />
      </div>
    );
  }

  const moveHandle = (which: "from" | "to", clientX: number) => {
    const el = trackRef.current;
    if (!el || !hasSpan) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ms = msAtRatio(ratioAtClientX(clientX, rect.left, rect.width), lo, hi);
    setDateRange(nextRangeForHandle(which, ms, fromMs, toMs));
  };

  const resetRange = () => resetDateRange();

  /** The restore gesture, mounted on the track and the date label — never on a
   *  handle, whose own pointer session owns the drag (owner review [msa28dxz]).
   *  `data-timeline-restore` marks the two hosts so the wiring is assertable. */
  const restoreGesture = {
    "data-timeline-restore": "",
    onDoubleClick: (event: React.MouseEvent) => {
      if (isHandleTarget(event.target)) return;
      resetRange();
    },
    onPointerUp: (event: React.PointerEvent) => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      if (isHandleTarget(event.target)) return;
      const tap = { at: Date.now(), x: event.clientX, y: event.clientY };
      const restored = isDoubleTap(lastTap.current, tap);
      lastTap.current = restored ? null : tap;
      if (restored) resetRange();
    },
  };

  const handleSize = handleFootprint(variant);

  const startLabel = resolveMessage(TIMELINE_RANGE_MESSAGES.start);
  const endLabel = resolveMessage(TIMELINE_RANGE_MESSAGES.end);
  const selectedLabel = resolveMessage(TIMELINE_RANGE_MESSAGES.selected);
  const clearLabel = isNarrowed ? resolveMessage(TIMELINE_RANGE_MESSAGES.clear) : null;
  const startDate = formatDate(locale, fromMs, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const endDate = formatDate(locale, toMs, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  if (
    startLabel.usedFallback ||
    endLabel.usedFallback ||
    selectedLabel.usedFallback ||
    clearLabel?.usedFallback ||
    startDate === null ||
    endDate === null
  ) {
    return null;
  }
  const selectedSummary = resolveMessage({
    ...TIMELINE_RANGE_MESSAGES.selectedSummary,
    values: { end: endDate, start: startDate },
  });
  if (selectedSummary.usedFallback) return null;

  // The date-basis choices, resolved here so the dropdown stays wire- and
  // localization-runtime-free. A criterion the engine (or the code corpus) does not
  // serve is offered DISABLED WITH ITS REASON rather than hidden — never a lie, and
  // never a silently missing option.
  const dateBasisOptions = TIMELINE_DATE_CRITERIA.flatMap<DateBasisOption>((id) => {
    const c = timelineDateCriterionPresentation(id);
    if (c === null) return [];
    const gated = isCode
      ? c.id !== "modified"
      : !timelineDateCriterionIsAvailable(c.id, served);
    const titleDescriptor = gated
      ? isCode
        ? TIMELINE_DATE_CRITERION_MESSAGES.codeFiles
        : c.unavailableReason
      : c.rangeDescription;
    if (titleDescriptor === null) return [];
    const label = resolveMessage(c.label);
    const title = resolveMessage(titleDescriptor);
    if (label.usedFallback || title.usedFallback) return [];
    return [{ id: c.id, label: label.message, title: title.message, disabled: gated }];
  });

  const handleProps = (which: "from" | "to") => ({
    role: "slider" as const,
    "aria-label": which === "from" ? startLabel.message : endLabel.message,
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
      setDateRange(nextRangeForHandle(which, next, fromMs, toMs));
    },
  });

  const handleClassName = `absolute top-1/2 ${handleSize} -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-fg-pill border-2 border-paper bg-accent shadow-fg-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`;

  return (
    <div
      className="flex h-[2.75rem] w-full items-center gap-fg-4 bg-paper px-fg-4 select-none"
      data-timeline
      data-timeline-range
    >
      <span
        {...restoreGesture}
        data-tabular
        className="shrink-0 select-text text-label tabular-nums text-ink"
        aria-label={selectedLabel.message}
      >
        {selectedSummary.message}
      </span>

      <div
        {...restoreGesture}
        className="flex h-fg-5 flex-1 items-center"
        data-timeline-track-row
      >
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

      {!dateFieldLabel.usedFallback && dateBasisOptions.length > 0 && (
        <DateBasisSelect
          value={criterion}
          options={dateBasisOptions}
          ariaLabel={dateFieldLabel.message}
          onSelect={(next) => {
            const presentation = timelineDateCriterionPresentation(next);
            if (presentation !== null) void setTimelineDateCriterion(presentation.id);
          }}
        />
      )}

      {isNarrowed && (
        <button
          type="button"
          onClick={resetRange}
          className="shrink-0 rounded-fg-sm px-fg-1-5 py-fg-0-5 text-caption font-medium text-accent-text transition-colors duration-ui-fast ease-settle hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          {clearLabel?.message}
        </button>
      )}
    </div>
  );
}
