import { beforeEach, describe, expect, it } from "vitest";

import { queryClient } from "../server/queryClient";
import {
  DEFAULT_PX_PER_MS,
  MAX_PX_PER_MS,
  MIN_PX_PER_MS,
  TIMELINE_CORPUS_KEY_MAX_CHARS,
  TIMELINE_DRAFT_TEXT_MAX_CHARS,
  TIMELINE_SCOPE_MAX_CHARS,
  TIMELINE_ZOOM_STEP,
  clearTimelineRangeDrag,
  closeTimelineDatePicker,
  fitTimelineSpan,
  fitTimelineViewportForScope,
  formatTimelineDayMonth,
  timelineCanZoomIn,
  timelineCanZoomOut,
  normalizeTimelineCorpusKey,
  normalizeTimelineDraftText,
  normalizeTimelineLane,
  normalizeTimelineMinimapDragState,
  normalizeTimelinePlayhead,
  normalizeTimelineScope,
  normalizeTimelineViewportX,
  normalizeTimelineViewportWidth,
  openTimelineDatePicker,
  orderedTimelineDateInputRange,
  parseTimelineDateInput,
  parseTimelineInstant,
  resetTimelineViewState,
  setTimelineDatePickerDraftFrom,
  setTimelineDatePickerDraftTo,
  setTimelineMinimapDrag,
  setTimelinePlayhead,
  setTimelinePxPerMs,
  setTimelineScrollOffset,
  setTimelineViewport,
  setTimelineViewportWidth,
  startTimelineRangeDrag,
  timelineJumpToDateOffset,
  timelineJumpToCorpusEdgeOffset,
  timelineJumpToEndOffset,
  timelinePanScrollOffset,
  timelineMinimapDragSnapshot,
  timelineMinimapKeyboardOffset,
  timelineMinimapViewportForWindow,
  timelineViewportForInstant,
  timelineZoomViewport,
  timelineZoomViewportAt,
  clearTimelineMinimapDrag,
  timelineCorpusFitKey,
  timelineDateInputValue,
  timelineViewportForTimeRange,
  timelineViewStateQueryKey,
  timelineViewSnapshot,
  timelineDashboardDateString,
  timelineRangeFromDrag,
  toggleTimelineLane,
  updateTimelineRangeDrag,
  type TimelineStateData,
  useTimelineStore,
} from "./timeline";

describe("timeline view-state seam", () => {
  beforeEach(() => {
    queryClient.clear();
    resetTimelineViewState();
  });

  it("exposes named timeline view-state helpers for app-layer consumers", () => {
    setTimelinePlayhead(1234);
    setTimelinePxPerMs(DEFAULT_PX_PER_MS * 2);
    setTimelineScrollOffset(75);
    setTimelineViewportWidth(1440);
    toggleTimelineLane("exec", false);

    expect(timelineViewSnapshot()).toMatchObject({
      playheadT: 1234,
      pxPerMs: DEFAULT_PX_PER_MS * 2,
      scrollOffset: 75,
      viewportWidth: 1440,
    });
    expect(useTimelineStore.getState().laneVisibility.exec).toBe(false);
  });

  it("sets viewport scale and offset together through one intent", () => {
    setTimelineViewport(DEFAULT_PX_PER_MS * 3, 200);

    expect(timelineViewSnapshot()).toMatchObject({
      pxPerMs: DEFAULT_PX_PER_MS * 3,
      scrollOffset: 200,
    });
    expect(
      queryClient.getQueryData<TimelineStateData>(timelineViewStateQueryKey()),
    ).toMatchObject({
      pxPerMs: DEFAULT_PX_PER_MS * 3,
      scrollOffset: 200,
    });
  });

  it("normalizes runtime viewport and lane writes at the timeline seam", () => {
    expect(normalizeTimelinePlayhead("live")).toBe("live");
    expect(normalizeTimelinePlayhead(123)).toBe(123);
    expect(normalizeTimelinePlayhead("123")).toBe("live");
    expect(normalizeTimelineViewportWidth(0)).toBe(1);
    expect(normalizeTimelineViewportWidth("wide")).toBe(1);
    expect(normalizeTimelineScope(" timeline-scope ")).toBe("timeline-scope");
    expect(normalizeTimelineScope("   ")).toBeNull();
    expect(normalizeTimelineScope("s".repeat(TIMELINE_SCOPE_MAX_CHARS + 1))).toBeNull();
    expect(normalizeTimelineCorpusKey(" corpus-key ")).toBe("corpus-key");
    expect(normalizeTimelineCorpusKey("   ")).toBeNull();
    expect(
      normalizeTimelineCorpusKey("c".repeat(TIMELINE_CORPUS_KEY_MAX_CHARS + 1)),
    ).toBeNull();
    expect(normalizeTimelineLane("exec")).toBe("exec");
    expect(normalizeTimelineLane("unknown")).toBeNull();

    setTimelinePlayhead("not-live");
    setTimelinePxPerMs("fast");
    setTimelineScrollOffset(-50);
    setTimelineViewportWidth(null);
    toggleTimelineLane("unknown", false);

    expect(timelineViewSnapshot()).toMatchObject({
      playheadT: "live",
      pxPerMs: DEFAULT_PX_PER_MS,
      scrollOffset: 0,
      viewportWidth: 1,
    });
    expect(useTimelineStore.getState().laneVisibility.exec).toBe(true);

    toggleTimelineLane("exec", "hidden");
    expect(useTimelineStore.getState().laneVisibility.exec).toBe(false);

    setTimelineViewport(Number.NaN, Number.POSITIVE_INFINITY);
    expect(timelineViewSnapshot()).toMatchObject({
      pxPerMs: DEFAULT_PX_PER_MS,
      scrollOffset: 0,
    });
  });

  it("owns timeline control zoom, fit, and jump projections", () => {
    const zoomed = timelineZoomViewport(
      DEFAULT_PX_PER_MS,
      100,
      800,
      TIMELINE_ZOOM_STEP,
    );
    expect(zoomed.pxPerMs).toBe(DEFAULT_PX_PER_MS * TIMELINE_ZOOM_STEP);
    expect(zoomed.scrollOffset).toBeGreaterThan(100);
    const cursorZoomed = timelineZoomViewportAt(
      DEFAULT_PX_PER_MS,
      100,
      80,
      TIMELINE_ZOOM_STEP,
    );
    const beforeAnchor = (80 + 100) / DEFAULT_PX_PER_MS;
    const afterAnchor = (80 + cursorZoomed.scrollOffset) / cursorZoomed.pxPerMs;
    expect(afterAnchor).toBeCloseTo(beforeAnchor, 0);
    expect(timelinePanScrollOffset(20, -50)).toBe(0);
    expect(timelinePanScrollOffset(20, 50)).toBe(70);

    const fitted = fitTimelineSpan(0, 10_000, 248, 24);
    expect(fitted.pxPerMs).toBeLessThanOrEqual(MAX_PX_PER_MS);
    expect(fitted.pxPerMs).toBeGreaterThanOrEqual(MIN_PX_PER_MS);
    expect(fitted.scrollOffset).toBe(0);

    expect(timelineJumpToEndOffset(10_000, 2, 800, 24)).toBe(19_224);
    expect(timelineJumpToCorpusEdgeOffset("start", 10_000, 2, 800, 24)).toBe(19_976);
    expect(timelineJumpToCorpusEdgeOffset("end", 10_000, 2, 800, 24)).toBe(19_224);
    expect(timelineJumpToDateOffset(10_000, 2, 800)).toBe(19_600);
    const eventViewport = timelineViewportForInstant(
      1_700_000_000_000,
      800,
      24 * 3600_000,
      1_700_000_000_000 + 10 * 24 * 3600_000,
    );
    expect(eventViewport.pxPerMs).toBeCloseTo(800 / (24 * 3600_000), 12);
    expect(eventViewport.scrollOffset + 800 / 2).toBeCloseTo(
      1_700_000_000_000 * eventViewport.pxPerMs,
      0,
    );
    expect(timelineCanZoomIn(MIN_PX_PER_MS)).toBe(true);
    expect(timelineCanZoomIn(MAX_PX_PER_MS)).toBe(false);
    expect(timelineCanZoomOut(MAX_PX_PER_MS)).toBe(true);
    expect(timelineCanZoomOut(MIN_PX_PER_MS)).toBe(false);
  });

  it("fits a scope viewport and records the fit provenance in the timeline store", () => {
    fitTimelineViewportForScope("timeline-fit-scope", DEFAULT_PX_PER_MS * 4, 320);

    expect(timelineViewSnapshot()).toMatchObject({
      autoFittedScope: "timeline-fit-scope",
      autoFittedCorpusKey: null,
      pxPerMs: DEFAULT_PX_PER_MS * 4,
      scrollOffset: 320,
    });
  });

  it("drops malformed scope fit provenance instead of corrupting the viewport", () => {
    fitTimelineViewportForScope("timeline-fit-scope", DEFAULT_PX_PER_MS * 4, 320);
    fitTimelineViewportForScope(null, DEFAULT_PX_PER_MS * 8, 900, 42);
    fitTimelineViewportForScope("   ", DEFAULT_PX_PER_MS * 8, 900, "next");

    expect(timelineViewSnapshot()).toMatchObject({
      autoFittedScope: "timeline-fit-scope",
      autoFittedCorpusKey: null,
      pxPerMs: DEFAULT_PX_PER_MS * 4,
      scrollOffset: 320,
    });
  });

  it("records the source corpus bounds identity when product auto-fit consumes it", () => {
    const key = timelineCorpusFitKey("timeline-fit-scope", {
      from: "2026-04-03",
      to: "2026-06-18",
    });

    fitTimelineViewportForScope(
      " timeline-fit-scope ",
      DEFAULT_PX_PER_MS * 4,
      320,
      ` ${key!} `,
    );

    expect(timelineViewSnapshot()).toMatchObject({
      autoFittedScope: "timeline-fit-scope",
      autoFittedCorpusKey: key,
      pxPerMs: DEFAULT_PX_PER_MS * 4,
      scrollOffset: 320,
    });
  });

  it("owns timeline date-picker chrome drafts behind the timeline seam", () => {
    openTimelineDatePicker("2026-06-01", "2026-06-18");

    expect(timelineViewSnapshot().datePicker).toEqual({
      open: true,
      draftFrom: "2026-06-01",
      draftTo: "2026-06-18",
    });

    setTimelineDatePickerDraftFrom("2026-05-30");
    setTimelineDatePickerDraftTo("2026-06-20");
    closeTimelineDatePicker();

    expect(timelineViewSnapshot().datePicker).toEqual({
      open: false,
      draftFrom: "2026-05-30",
      draftTo: "2026-06-20",
    });

    resetTimelineViewState();
    expect(timelineViewSnapshot().datePicker).toEqual({
      open: false,
      draftFrom: "",
      draftTo: "",
    });
  });

  it("normalizes malformed timeline date-picker drafts at the seam", () => {
    expect(normalizeTimelineDraftText(" 2026-06-18 ")).toBe("2026-06-18");
    expect(normalizeTimelineDraftText({ value: "2026-06-18" })).toBe("");
    expect(
      normalizeTimelineDraftText("x".repeat(TIMELINE_DRAFT_TEXT_MAX_CHARS + 1)),
    ).toBe("");

    openTimelineDatePicker(
      " 2026-06-01 ",
      "x".repeat(TIMELINE_DRAFT_TEXT_MAX_CHARS + 1),
    );
    expect(timelineViewSnapshot().datePicker).toEqual({
      open: true,
      draftFrom: "2026-06-01",
      draftTo: "",
    });

    setTimelineDatePickerDraftFrom(null);
    setTimelineDatePickerDraftTo(" 2026-06-20 ");
    expect(timelineViewSnapshot().datePicker).toMatchObject({
      draftFrom: "",
      draftTo: "2026-06-20",
    });
  });

  it("owns transient range-drag chrome state behind the timeline seam", () => {
    startTimelineRangeDrag(12);
    expect(timelineViewSnapshot().rangeDrag).toEqual({ x1: 12, x2: 12 });

    updateTimelineRangeDrag(48);
    expect(timelineViewSnapshot().rangeDrag).toEqual({ x1: 12, x2: 48 });

    clearTimelineRangeDrag();
    expect(timelineViewSnapshot().rangeDrag).toBeNull();

    startTimelineRangeDrag(22);
    resetTimelineViewState();
    expect(timelineViewSnapshot().rangeDrag).toBeNull();
  });

  it("normalizes malformed range-drag coordinates at the seam", () => {
    expect(normalizeTimelineViewportX(42)).toBe(42);
    expect(normalizeTimelineViewportX(Number.NaN)).toBeNull();

    startTimelineRangeDrag(Number.NaN);
    expect(timelineViewSnapshot().rangeDrag).toBeNull();

    startTimelineRangeDrag(22.5);
    updateTimelineRangeDrag({ x: 48 });
    expect(timelineViewSnapshot().rangeDrag).toEqual({ x1: 22.5, x2: 22.5 });

    updateTimelineRangeDrag(-12);
    expect(timelineViewSnapshot().rangeDrag).toEqual({ x1: 22.5, x2: -12 });
  });

  it("owns timeline range drag-to-date projection behind the timeline seam", () => {
    const day = 24 * 3600_000;
    const pxPerMs = 100 / day;
    const selected = timelineRangeFromDrag(600, 200, pxPerMs, 0);

    expect(selected).toEqual({
      fromMs: 2 * day,
      toMs: 6 * day,
    });
    expect(timelineDashboardDateString(Date.parse("2026-06-18T11:59:00Z"))).toBe(
      "2026-06-18",
    );
  });

  it("owns transient minimap drag state behind the timeline seam", () => {
    expect(
      normalizeTimelineMinimapDragState({
        pointerId: 7.9,
        mode: "move",
        initialFromMs: 10,
        initialToMs: 20,
        grabOffsetMs: 5,
      }),
    ).toEqual({
      pointerId: 7,
      mode: "move",
      initialFromMs: 10,
      initialToMs: 20,
      grabOffsetMs: 5,
    });
    expect(
      normalizeTimelineMinimapDragState({
        pointerId: 7,
        mode: "bad",
        initialFromMs: 10,
        initialToMs: 20,
        grabOffsetMs: 5,
      }),
    ).toBeNull();

    setTimelineMinimapDrag({
      pointerId: 7,
      mode: "move",
      initialFromMs: 10,
      initialToMs: 20,
      grabOffsetMs: 5,
    });

    expect(timelineMinimapDragSnapshot()).toEqual({
      pointerId: 7,
      mode: "move",
      initialFromMs: 10,
      initialToMs: 20,
      grabOffsetMs: 5,
    });

    clearTimelineMinimapDrag(8);
    expect(timelineMinimapDragSnapshot()).not.toBeNull();
    clearTimelineMinimapDrag({ pointerId: 7 });
    expect(timelineMinimapDragSnapshot()).not.toBeNull();
    clearTimelineMinimapDrag(7);
    expect(timelineMinimapDragSnapshot()).toBeNull();

    setTimelineMinimapDrag({
      pointerId: "bad",
      mode: "move",
      initialFromMs: 10,
      initialToMs: 20,
      grabOffsetMs: 5,
    });
    expect(timelineMinimapDragSnapshot()).toBeNull();
  });

  it("owns minimap keyboard and brush viewport projections", () => {
    expect(timelineMinimapKeyboardOffset(100, 800, 1)).toBe(180);
    expect(timelineMinimapKeyboardOffset(10, 800, -1)).toBe(0);

    const viewport = timelineViewportForTimeRange(10_000, 20_000, 1000);
    expect(viewport.pxPerMs).toBeLessThanOrEqual(MAX_PX_PER_MS);
    expect(viewport.scrollOffset).toBeGreaterThanOrEqual(0);

    const span = { fromMs: 10_000, toMs: 50_000 };
    const brushViewport = timelineMinimapViewportForWindow(0, 12_000, span, 1000);
    expect(brushViewport.scrollOffset).toBeGreaterThanOrEqual(0);
  });

  it("keys timeline corpus fit provenance by scope and date bounds", () => {
    expect(
      timelineCorpusFitKey("timeline-fit-scope", {
        from: "2026-04-03",
        to: "2026-06-18",
      }),
    ).toBe(
      "timeline-corpus-fit:scope:value:timeline-fit-scope:from:value:2026-04-03:to:value:2026-06-18",
    );
    expect(
      timelineCorpusFitKey("null", {
        from: "open",
        to: "open",
      }),
    ).toBe("timeline-corpus-fit:scope:value:null:from:value:open:to:value:open");
    expect(
      timelineCorpusFitKey("timeline-fit-scope", {
        from: "2026-04-03",
        to: "2026-06-18",
      }),
    ).not.toBe(
      timelineCorpusFitKey("timeline-fit-scope", {
        from: "2026-04-03",
        to: "2026-06-19",
      }),
    );
    expect(timelineCorpusFitKey("timeline-fit-scope", undefined)).toBeNull();
    expect(timelineCorpusFitKey(null, { from: "2026-04-03" })).toBeNull();
    expect(timelineCorpusFitKey("", { from: "2026-04-03" })).toBeNull();
    expect(timelineCorpusFitKey("   ", { from: "2026-04-03" })).toBeNull();
    expect(
      timelineCorpusFitKey({ scope: "scope-a" }, { from: "2026-04-03" }),
    ).toBeNull();
    expect(timelineCorpusFitKey("scope-a", { from: 42 })).toBeNull();
    expect(timelineCorpusFitKey("scope-a", ["2026-04-03"])).toBeNull();
    expect(timelineCorpusFitKey("scope-a", { from: "   " })).toBeNull();
    expect(
      timelineCorpusFitKey("s".repeat(TIMELINE_SCOPE_MAX_CHARS + 1), {
        from: "2026-04-03",
      }),
    ).toBeNull();
    expect(
      timelineCorpusFitKey("scope-a", {
        from: "x".repeat(TIMELINE_DRAFT_TEXT_MAX_CHARS + 1),
      }),
    ).toBeNull();
    expect(
      timelineCorpusFitKey("scope-a", {
        from: "2026-04-03",
        to: "x".repeat(TIMELINE_DRAFT_TEXT_MAX_CHARS + 1),
      }),
    ).toBe("timeline-corpus-fit:scope:value:scope-a:from:value:2026-04-03:to:open");
    expect(
      timelineCorpusFitKey(" scope-a ", {
        from: " 2026-04-03 ",
        to: " ",
      }),
    ).toBe("timeline-corpus-fit:scope:value:scope-a:from:value:2026-04-03:to:open");
    expect(
      timelineCorpusFitKey("scope:a:b", {
        from: "2026-04-03T10:00:00Z",
        to: "open:end",
      }),
    ).toBe(
      "timeline-corpus-fit:scope:value:scope%3Aa%3Ab:from:value:2026-04-03T10%3A00%3A00Z:to:value:open%3Aend",
    );
  });

  it("owns timeline date parsing and display grammar behind the timeline seam", () => {
    const june = Date.parse("2026-06-18T00:00:00.000Z");

    expect(parseTimelineInstant("2026-06-18")).toBe(june);
    expect(parseTimelineInstant(undefined, 123)).toBe(123);
    expect(parseTimelineInstant("not-a-date", 456)).toBe(456);
    expect(parseTimelineDateInput("2026-06-18")).toBe(june);
    expect(parseTimelineDateInput("")).toBeNull();
    expect(timelineDateInputValue(june)).toBe("2026-06-18");
    expect(formatTimelineDayMonth(june)).toBe("Jun 18");
  });

  it("orders timeline date-picker drafts before dispatching a dashboard range", () => {
    expect(orderedTimelineDateInputRange("2026-06-18", "2026-06-01")).toEqual({
      fromMs: Date.parse("2026-06-01T00:00:00.000Z"),
      toMs: Date.parse("2026-06-18T00:00:00.000Z"),
      from: "2026-06-01",
      to: "2026-06-18",
    });
    expect(orderedTimelineDateInputRange("", "2026-06-18")).toBeNull();
    expect(orderedTimelineDateInputRange("nope", "2026-06-18")).toBeNull();
  });
});
