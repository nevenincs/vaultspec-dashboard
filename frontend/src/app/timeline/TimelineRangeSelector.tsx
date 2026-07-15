import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { localizationNamespaces } from "../../platform/localization/runtime";
import { formatDate } from "../../platform/localization/formatters";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { Segment, SegmentedToggle, Skeleton, SkeletonBar, StateBlock } from "../kit";
import {
  useDashboardDateRangeView,
  useDashboardState,
  useFiltersVocabularyView,
  useTimelineAvailability,
  useTimelineDateCriterion,
} from "../../stores/server/queries";
import { useDashboardStateMutations } from "../../stores/server/dashboardState";
import { normalizeDashboardGraphCorpus } from "../../stores/server/dashboardStateNormalization";
import { setTimelineDateCriterion } from "../../stores/server/timelineDateCriterionIntent";
import {
  TIMELINE_DATE_CRITERIA,
  TIMELINE_DATE_CRITERION_MESSAGES,
  timelineDateCriterionIsAvailable,
  timelineDateCriterionPresentation,
} from "./timelineDateCriterion";
import {
  clampToSpan,
  nextRangeForHandle,
  parseISO,
  ratioAtClientX,
  msAtRatio,
  rangeIsNarrowed,
  rangeWritePayload,
  spanRatio,
} from "./timelineRangeMath";

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
  const mutations = useDashboardStateMutations(scope);

  const lo = minMs ?? 0;
  const hi = maxMs ?? 0;
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
        <Skeleton label={loading.message} className="flex w-full items-center gap-fg-4">
          <SkeletonBar width="w-16" height="h-3" />
          <SkeletonBar height="h-1" className="flex-1" />
          <SkeletonBar width="w-12" height="h-3" />
        </Skeleton>
      </div>
    );
  }
  if (availability.degraded) {
    const unavailable = resolveMessage(TIMELINE_RANGE_MESSAGES.unavailable);
    if (unavailable.usedFallback) return null;
    return (
      <div className={containerClassName} data-timeline data-timeline-degraded>
        <StateBlock mode="degraded" layout="inline" message={unavailable.message} />
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
      <div className={containerClassName} data-timeline data-timeline-empty>
        <StateBlock mode="empty" layout="inline" message={empty.message} />
      </div>
    );
  }

  const moveHandle = (which: "from" | "to", clientX: number) => {
    const el = trackRef.current;
    if (!el || !hasSpan) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ms = msAtRatio(ratioAtClientX(clientX, rect.left, rect.width), lo, hi);
    void mutations.setDateRange(
      rangeWritePayload(nextRangeForHandle(which, ms, fromMs, toMs), lo, hi),
    );
  };

  const resetRange = () => void mutations.setDateRange({});

  const handleSize = variant === "compact" ? "size-[1.25rem]" : "size-[0.875rem]";

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
      void mutations.setDateRange(
        rangeWritePayload(nextRangeForHandle(which, next, fromMs, toMs), lo, hi),
      );
    },
  });

  const handleClassName = `absolute top-1/2 ${handleSize} -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-fg-pill border-2 border-paper bg-accent shadow-fg-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`;

  return (
    <div
      className="flex h-[2.75rem] w-full items-center gap-fg-4 bg-paper px-fg-4 select-none"
      onDoubleClick={resetRange}
      data-timeline
      data-timeline-range
    >
      <span
        data-tabular
        className="shrink-0 select-text text-label tabular-nums text-ink"
        aria-label={selectedLabel.message}
      >
        {selectedSummary.message}
      </span>

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

      {!dateFieldLabel.usedFallback && (
        <SegmentedToggle
          value={criterion}
          onChange={(next) => {
            const presentation = timelineDateCriterionPresentation(next);
            if (presentation !== null) void setTimelineDateCriterion(presentation.id);
          }}
          ariaLabel={dateFieldLabel.message}
          className="shrink-0"
        >
          {TIMELINE_DATE_CRITERIA.map((id) => {
            const c = timelineDateCriterionPresentation(id);
            if (c === null) return null;
            const gated = isCode
              ? c.id !== "modified"
              : !timelineDateCriterionIsAvailable(c.id, served);
            const titleDescriptor = gated
              ? isCode
                ? TIMELINE_DATE_CRITERION_MESSAGES.codeFiles
                : c.unavailableReason
              : c.rangeDescription;
            if (titleDescriptor === null) return null;
            const label = resolveMessage(c.label);
            const title = resolveMessage(titleDescriptor);
            if (label.usedFallback || title.usedFallback) return null;
            return (
              <Segment key={c.id} value={c.id} disabled={gated} title={title.message}>
                {label.message}
              </Segment>
            );
          })}
        </SegmentedToggle>
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
