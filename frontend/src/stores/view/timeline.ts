import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { queryClient } from "../server/queryClient";
import { PHASE_LANES, type PhaseLane } from "./timelinePhases";

/** Default per-lane visibility: every phase lane shown. */
export function allTimelineLanesVisible(): Record<PhaseLane, boolean> {
  return Object.fromEntries(PHASE_LANES.map((lane) => [lane, true])) as Record<
    PhaseLane,
    boolean
  >;
}

/**
 * The default pixels-per-time scale for the scroll-strip model: ~1.5 days span
 * per 100px keeps a multi-month corpus scrollable at a legible default.
 */
export const DEFAULT_PX_PER_MS = 100 / (1.5 * 24 * 3600_000);

/** Timeline strip origin and zoom bounds shared by timeline controls and surface math. */
export const TIMELINE_ORIGIN_MS = 0;
export const MIN_PX_PER_MS = 100 / (5 * 365 * 24 * 3600_000);
export const MAX_PX_PER_MS = 100 / 3600_000;
export const TIMELINE_ZOOM_STEP = 1.6;
export const TIMELINE_SCOPE_MAX_CHARS = 512;
export const TIMELINE_CORPUS_KEY_MAX_CHARS = 2048;
export const TIMELINE_DRAFT_TEXT_MAX_CHARS = 64;

export interface TimelineState {
  /** The playhead position; "live" docks at the right edge. */
  playheadT: number | "live";
  setPlayhead: (t: unknown) => void;
  /** Scroll-strip view state. */
  scrollOffset: number;
  pxPerMs: number;
  viewportWidth: number;
  /** Scope whose corpus bounds have been auto-fit into the scroll-strip view. */
  autoFittedScope: string | null;
  /** Source identity whose corpus bounds have been auto-fit into the viewport. */
  autoFittedCorpusKey: string | null;
  setScrollOffset: (scrollOffset: unknown) => void;
  setPxPerMs: (pxPerMs: unknown) => void;
  setViewportWidth: (viewportWidth: unknown) => void;
  fitViewportForScope: (
    scope: unknown,
    pxPerMs: unknown,
    scrollOffset: unknown,
    corpusKey?: unknown,
  ) => void;
  /** Per-lane visibility. */
  laneVisibility: Record<PhaseLane, boolean>;
  toggleLane: (lane: unknown, visible?: unknown) => void;
  /** Date-picker chrome draft for the timeline controls. */
  datePicker: TimelineDatePickerState;
  /** In-progress shift-drag range selection in viewport pixels. */
  rangeDrag: TimelineRangeDragState | null;
  /** In-progress timeline minimap scrubber drag. */
  minimapDrag: TimelineMinimapDragState | null;
  /** Reset every scope-local timeline affordance to a fresh-scope baseline. */
  resetForScope: () => void;
}

export interface TimelineDatePickerState {
  open: boolean;
  draftFrom: string;
  draftTo: string;
}

export interface TimelineRangeDragState {
  x1: number;
  x2: number;
}

export type TimelineMinimapBrushDragMode = "left" | "right" | "move" | "center";

export interface TimelineMinimapDragState {
  pointerId: number;
  mode: TimelineMinimapBrushDragMode;
  initialFromMs: number;
  initialToMs: number;
  grabOffsetMs: number;
}

export interface TimelineStateData {
  playheadT: number | "live";
  scrollOffset: number;
  pxPerMs: number;
  viewportWidth: number;
  autoFittedScope: string | null;
  autoFittedCorpusKey: string | null;
  laneVisibility: Record<PhaseLane, boolean>;
  datePicker: TimelineDatePickerState;
  rangeDrag: TimelineRangeDragState | null;
  minimapDrag: TimelineMinimapDragState | null;
}

const timelineViewKey = ["timeline-view", "state"] as const;

export function timelineViewStateQueryKey(): typeof timelineViewKey {
  return timelineViewKey;
}

function timelineScopeDefaults(): TimelineStateData {
  return {
    playheadT: "live",
    scrollOffset: 0,
    pxPerMs: DEFAULT_PX_PER_MS,
    viewportWidth: 800,
    autoFittedScope: null,
    autoFittedCorpusKey: null,
    laneVisibility: allTimelineLanesVisible(),
    datePicker: { open: false, draftFrom: "", draftTo: "" },
    rangeDrag: null,
    minimapDrag: null,
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boundedScrollOffset(scrollOffset: unknown): number {
  return Math.max(0, finiteNumber(scrollOffset) ?? 0);
}

export function clampTimelinePxPerMs(pxPerMs: unknown): number {
  const normalized = finiteNumber(pxPerMs);
  if (normalized === null || normalized <= 0) return MIN_PX_PER_MS;
  return Math.min(MAX_PX_PER_MS, Math.max(MIN_PX_PER_MS, normalized));
}

export function timelineTimeToStripX(tMs: number, pxPerMs: number): number {
  return (tMs - TIMELINE_ORIGIN_MS) * pxPerMs;
}

export interface TimelineVisibleRange {
  fromMs: number;
  toMs: number;
}

export function timelineVisibleRange(
  scrollOffset: number,
  viewportWidth: number,
  pxPerMs: number,
  marginPx: number,
  originMs = TIMELINE_ORIGIN_MS,
): TimelineVisibleRange {
  const scale = boundedPxPerMs(pxPerMs);
  return {
    fromMs: originMs + (-marginPx + scrollOffset) / scale,
    toMs: originMs + (viewportWidth + marginPx + scrollOffset) / scale,
  };
}

export function timelineViewportXToTime(
  x: number,
  pxPerMs: number,
  scrollOffset: number,
  originMs = TIMELINE_ORIGIN_MS,
): number {
  return originMs + (x + scrollOffset) / boundedPxPerMs(pxPerMs);
}

export function timelineRangeFromDrag(
  x1: number,
  x2: number,
  pxPerMs: number,
  scrollOffset: number,
): TimelineVisibleRange {
  const a = timelineViewportXToTime(x1, pxPerMs, scrollOffset);
  const b = timelineViewportXToTime(x2, pxPerMs, scrollOffset);
  return { fromMs: Math.min(a, b), toMs: Math.max(a, b) };
}

export function timelineDashboardDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export interface TimelineRangeDragPointerSessionInput {
  host: HTMLElement;
  commitRange: (range: { from: string; to: string }) => void;
  moveTarget?: Pick<typeof globalThis, "addEventListener" | "removeEventListener">;
}

export function startTimelineRangeDragPointerSession({
  host,
  commitRange,
  moveTarget = globalThis,
}: TimelineRangeDragPointerSessionInput): () => void {
  let active = false;
  let startX = 0;
  const localX = (event: PointerEvent) =>
    event.clientX - host.getBoundingClientRect().left;
  const onDown = (event: PointerEvent) => {
    if (!event.shiftKey) return;
    active = true;
    startX = localX(event);
    startTimelineRangeDrag(startX);
    event.preventDefault();
  };
  const onMove = (event: PointerEvent) => {
    if (active) updateTimelineRangeDrag(localX(event));
  };
  const onUp = (event: PointerEvent) => {
    if (!active) return;
    active = false;
    const { pxPerMs, scrollOffset } = timelineViewSnapshot();
    const range = timelineRangeFromDrag(startX, localX(event), pxPerMs, scrollOffset);
    clearTimelineRangeDrag();
    commitRange({
      from: timelineDashboardDateString(range.fromMs),
      to: timelineDashboardDateString(range.toMs),
    });
  };
  host.addEventListener("pointerdown", onDown);
  moveTarget.addEventListener("pointermove", onMove);
  moveTarget.addEventListener("pointerup", onUp);
  return () => {
    host.removeEventListener("pointerdown", onDown);
    moveTarget.removeEventListener("pointermove", onMove);
    moveTarget.removeEventListener("pointerup", onUp);
  };
}

export function timelinePanScrollOffset(scrollOffset: number, deltaPx: number): number {
  return boundedScrollOffset(scrollOffset + deltaPx);
}

export function timelineZoomViewportAt(
  pxPerMs: number,
  scrollOffset: number,
  cursorX: number,
  factor: number,
): { pxPerMs: number; scrollOffset: number } {
  const anchorT =
    TIMELINE_ORIGIN_MS + (cursorX + scrollOffset) / boundedPxPerMs(pxPerMs);
  const nextPxPerMs = clampTimelinePxPerMs(pxPerMs * factor);
  return {
    pxPerMs: nextPxPerMs,
    scrollOffset: boundedScrollOffset(
      timelineTimeToStripX(anchorT, nextPxPerMs) - cursorX,
    ),
  };
}

export function timelineZoomViewport(
  pxPerMs: number,
  scrollOffset: number,
  viewportWidth: number,
  factor: number,
): { pxPerMs: number; scrollOffset: number } {
  return timelineZoomViewportAt(pxPerMs, scrollOffset, viewportWidth / 2, factor);
}

export function fitTimelineSpan(
  fromMs: number,
  toMs: number,
  viewportWidth: number,
  insetPx = 24,
): { pxPerMs: number; scrollOffset: number } {
  const usable = Math.max(1, viewportWidth - insetPx * 2);
  const spanMs = toMs - fromMs;
  const rawScale = spanMs > 0 ? usable / spanMs : MIN_PX_PER_MS;
  const pxPerMs = clampTimelinePxPerMs(rawScale);
  return {
    pxPerMs,
    scrollOffset: boundedScrollOffset(timelineTimeToStripX(fromMs, pxPerMs) - insetPx),
  };
}

export function timelineJumpToEndOffset(
  endMs: number,
  pxPerMs: number,
  viewportWidth: number,
  insetPx = 24,
): number {
  return boundedScrollOffset(
    timelineTimeToStripX(endMs, pxPerMs) - viewportWidth + insetPx,
  );
}

export type TimelineCorpusEdge = "start" | "end";

export function timelineJumpToCorpusEdgeOffset(
  edge: TimelineCorpusEdge,
  tMs: number,
  pxPerMs: number,
  viewportWidth: number,
  insetPx = 24,
): number {
  if (edge === "start") {
    return boundedScrollOffset(timelineTimeToStripX(tMs, pxPerMs) - insetPx);
  }
  return timelineJumpToEndOffset(tMs, pxPerMs, viewportWidth, insetPx);
}

export function timelineJumpToDateOffset(
  tMs: number,
  pxPerMs: number,
  viewportWidth: number,
): number {
  return boundedScrollOffset(timelineTimeToStripX(tMs, pxPerMs) - viewportWidth / 2);
}

export function timelineViewportForInstant(
  tMs: number,
  viewportWidth: number,
  spanMs: number,
  nowMs: number,
): { pxPerMs: number; scrollOffset: number } {
  const width = Math.max(1, viewportWidth);
  const pxPerMs = clampTimelinePxPerMs(width / Math.max(1, spanMs));
  const centered = timelineTimeToStripX(tMs, pxPerMs) - width / 2;
  const liveMax = timelineTimeToStripX(nowMs, pxPerMs) - width;
  return {
    pxPerMs,
    scrollOffset: boundedScrollOffset(Math.min(centered, liveMax)),
  };
}

export function timelineViewportForTimeRange(
  fromMs: number,
  toMs: number,
  viewportWidth: number,
): { pxPerMs: number; scrollOffset: number } {
  const orderedFrom = Math.min(fromMs, toMs);
  const orderedTo = Math.max(fromMs, toMs);
  const span = Math.max(1, orderedTo - orderedFrom);
  const pxPerMs = clampTimelinePxPerMs(Math.max(1, viewportWidth) / span);
  return {
    pxPerMs,
    scrollOffset: boundedScrollOffset(timelineTimeToStripX(orderedFrom, pxPerMs)),
  };
}

export function timelineMinimapKeyboardOffset(
  scrollOffset: number,
  viewportWidth: number,
  direction: 1 | -1,
): number {
  return boundedScrollOffset(scrollOffset + direction * viewportWidth * 0.1);
}

export function timelineMinimapViewportForWindow(
  fromMs: number,
  toMs: number,
  span: { fromMs: number; toMs: number },
  viewportWidth: number,
): { pxPerMs: number; scrollOffset: number } {
  const minSpanMs = Math.max(1, viewportWidth / MAX_PX_PER_MS);
  const spanSize = Math.max(1, span.toMs - span.fromMs);
  const requestedSize = Math.max(minSpanMs, Math.abs(toMs - fromMs));
  if (requestedSize >= spanSize) {
    return timelineViewportForTimeRange(span.fromMs, span.toMs, viewportWidth);
  }

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
  return timelineViewportForTimeRange(from, to, viewportWidth);
}

export function timelineCanZoomIn(pxPerMs: number): boolean {
  return pxPerMs < MAX_PX_PER_MS;
}

export function timelineCanZoomOut(pxPerMs: number): boolean {
  return pxPerMs > MIN_PX_PER_MS;
}

function boundedPxPerMs(pxPerMs: unknown): number {
  const normalized = finiteNumber(pxPerMs);
  return normalized !== null && normalized > 0 ? normalized : DEFAULT_PX_PER_MS;
}

export function normalizeTimelinePlayhead(value: unknown): number | "live" {
  if (value === "live") return "live";
  return finiteNumber(value) ?? "live";
}

export function normalizeTimelineViewportWidth(value: unknown): number {
  return Math.max(1, finiteNumber(value) ?? 1);
}

export function normalizeTimelineScope(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= TIMELINE_SCOPE_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeTimelineCorpusKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= TIMELINE_CORPUS_KEY_MAX_CHARS
    ? normalized
    : null;
}

export function normalizeTimelineLane(value: unknown): PhaseLane | null {
  return typeof value === "string" && (PHASE_LANES as readonly string[]).includes(value)
    ? (value as PhaseLane)
    : null;
}

export function normalizeTimelineLaneVisibility(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function normalizeTimelineDraftText(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= TIMELINE_DRAFT_TEXT_MAX_CHARS ? normalized : "";
}

export function normalizeTimelineViewportX(value: unknown): number | null {
  return finiteNumber(value);
}

function normalizeTimelineMinimapDragMode(
  value: unknown,
): TimelineMinimapBrushDragMode | null {
  return value === "left" || value === "right" || value === "move" || value === "center"
    ? value
    : null;
}

function normalizeTimelinePointerId(value: unknown): number | null {
  const normalized = finiteNumber(value);
  return normalized === null ? null : Math.trunc(normalized);
}

export function normalizeTimelineMinimapDragState(
  drag: unknown,
): TimelineMinimapDragState | null {
  if (drag === null || typeof drag !== "object" || Array.isArray(drag)) return null;
  const source = drag as Record<string, unknown>;
  const pointerId = normalizeTimelinePointerId(source.pointerId);
  const mode = normalizeTimelineMinimapDragMode(source.mode);
  const initialFromMs = finiteNumber(source.initialFromMs);
  const initialToMs = finiteNumber(source.initialToMs);
  const grabOffsetMs = finiteNumber(source.grabOffsetMs);
  if (
    pointerId === null ||
    mode === null ||
    initialFromMs === null ||
    initialToMs === null ||
    grabOffsetMs === null
  ) {
    return null;
  }
  return { pointerId, mode, initialFromMs, initialToMs, grabOffsetMs };
}

function currentTimelineData(): TimelineStateData {
  return (
    queryClient.getQueryData<TimelineStateData>(timelineViewKey) ??
    timelineScopeDefaults()
  );
}

function writeTimelineData(
  update: TimelineStateData | ((state: TimelineStateData) => TimelineStateData),
): TimelineStateData {
  const next = typeof update === "function" ? update(currentTimelineData()) : update;
  queryClient.setQueryData<TimelineStateData>(timelineViewKey, next);
  return next;
}

function timelineStateFacade(data: TimelineStateData): TimelineState {
  return {
    ...data,
    setPlayhead: setTimelinePlayhead,
    setScrollOffset: setTimelineScrollOffset,
    setPxPerMs: setTimelinePxPerMs,
    setViewportWidth: setTimelineViewportWidth,
    fitViewportForScope: fitTimelineViewportForScope,
    toggleLane: toggleTimelineLane,
    resetForScope: resetTimelineViewState,
  };
}

export interface TimelineScrollState {
  pxPerMs: number;
  scrollOffset: number;
}

export interface TimelineViewportState extends TimelineScrollState {
  viewportWidth: number;
}

export function useTimelineState(): TimelineState {
  const query = useQuery({
    queryKey: timelineViewKey,
    queryFn: currentTimelineData,
    initialData: currentTimelineData,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return useMemo(() => timelineStateFacade(query.data), [query.data]);
}

export function useTimelinePlayhead(): number | "live" {
  return useTimelineState().playheadT;
}

export function useTimelineScrollState(): TimelineScrollState {
  const state = useTimelineState();
  return useMemo(
    () => ({
      pxPerMs: state.pxPerMs,
      scrollOffset: state.scrollOffset,
    }),
    [state.pxPerMs, state.scrollOffset],
  );
}

export function useTimelineViewportState(): TimelineViewportState {
  const state = useTimelineState();
  return useMemo(
    () => ({
      pxPerMs: state.pxPerMs,
      scrollOffset: state.scrollOffset,
      viewportWidth: state.viewportWidth,
    }),
    [state.pxPerMs, state.scrollOffset, state.viewportWidth],
  );
}

export function useTimelineLaneVisibility(): Record<PhaseLane, boolean> {
  return useTimelineState().laneVisibility;
}

export function useTimelineDatePickerState(): TimelineDatePickerState {
  return useTimelineState().datePicker;
}

export function useTimelineRangeDragState(): TimelineRangeDragState | null {
  return useTimelineState().rangeDrag;
}

export function useTimelineMinimapDragState(): TimelineMinimapDragState | null {
  return useTimelineState().minimapDrag;
}

export function useTimelineAutoFittedScope(): string | null {
  return useTimelineState().autoFittedScope;
}

export function useTimelineAutoFittedCorpusKey(): string | null {
  return useTimelineState().autoFittedCorpusKey;
}

export function timelineViewSnapshot(): TimelineState {
  return timelineStateFacade(currentTimelineData());
}

export function setTimelinePlayhead(playheadT: unknown): void {
  writeTimelineData((state) => ({
    ...state,
    playheadT: normalizeTimelinePlayhead(playheadT),
  }));
}

export function setTimelineScrollOffset(scrollOffset: unknown): void {
  writeTimelineData((state) => ({
    ...state,
    scrollOffset: boundedScrollOffset(scrollOffset),
  }));
}

export function setTimelinePxPerMs(pxPerMs: unknown): void {
  writeTimelineData((state) => ({ ...state, pxPerMs: boundedPxPerMs(pxPerMs) }));
}

export function setTimelineViewportWidth(viewportWidth: unknown): void {
  writeTimelineData((state) => ({
    ...state,
    viewportWidth: normalizeTimelineViewportWidth(viewportWidth),
  }));
}

export function setTimelineViewport(pxPerMs: unknown, scrollOffset: unknown): void {
  writeTimelineData((state) => ({
    ...state,
    pxPerMs: boundedPxPerMs(pxPerMs),
    scrollOffset: boundedScrollOffset(scrollOffset),
  }));
}

export function fitTimelineViewportForScope(
  scope: unknown,
  pxPerMs: unknown,
  scrollOffset: unknown,
  corpusKey?: unknown,
): void {
  const normalizedScope = normalizeTimelineScope(scope);
  if (normalizedScope === null) return;
  writeTimelineData((state) => ({
    ...state,
    autoFittedScope: normalizedScope,
    autoFittedCorpusKey: normalizeTimelineCorpusKey(corpusKey),
    pxPerMs: boundedPxPerMs(pxPerMs),
    scrollOffset: boundedScrollOffset(scrollOffset),
  }));
}

export interface TimelineCorpusBounds {
  from?: string;
  to?: string;
}

/** Parse an ISO-ish timeline instant to epoch ms, or `fallback` when absent/invalid. */
export function parseTimelineInstant(
  value: string | undefined,
  fallback = Number.NaN,
): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Parse a date-picker draft value into epoch ms, or null when invalid/empty. */
export function parseTimelineDateInput(value: string): number | null {
  if (!value) return null;
  const parsed = parseTimelineInstant(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Format an epoch ms as the yyyy-mm-dd value expected by `<input type="date">`. */
export function timelineDateInputValue(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Short "MMM D" day label for timeline range pills. */
export function formatTimelineDayMonth(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function orderedTimelineDateInputRange(
  draftFrom: string,
  draftTo: string,
): TimelineOrderedDateInputRange | null {
  const from = parseTimelineDateInput(draftFrom);
  const to = parseTimelineDateInput(draftTo);
  if (from === null || to === null) return null;
  const fromMs = Math.min(from, to);
  const toMs = Math.max(from, to);
  return {
    fromMs,
    toMs,
    from: timelineDateInputValue(fromMs),
    to: timelineDateInputValue(toMs),
  };
}

export interface TimelineOrderedDateInputRange {
  fromMs: number;
  toMs: number;
  from: string;
  to: string;
}

export function timelineCorpusFitKey(scope: unknown, bounds: unknown): string | null {
  const normalizedScope = normalizeTimelineScope(scope);
  const source =
    bounds !== null && typeof bounds === "object" && !Array.isArray(bounds)
      ? (bounds as Record<string, unknown>)
      : {};
  const from = normalizeTimelineDraftText(source.from);
  if (normalizedScope === null || from.length === 0) return null;
  const scopePart = `scope:value:${encodeURIComponent(normalizedScope)}`;
  const fromPart = `from:value:${encodeURIComponent(from)}`;
  const normalizedTo = normalizeTimelineDraftText(source.to);
  const to = normalizedTo.length > 0 ? normalizedTo : undefined;
  const toPart = to === undefined ? "to:open" : `to:value:${encodeURIComponent(to)}`;
  return `timeline-corpus-fit:${scopePart}:${fromPart}:${toPart}`;
}

export function toggleTimelineLane(lane: unknown, visible?: unknown): void {
  const normalizedLane = normalizeTimelineLane(lane);
  if (normalizedLane === null) return;
  const normalizedVisible = normalizeTimelineLaneVisibility(visible);
  writeTimelineData((state) => ({
    ...state,
    laneVisibility: {
      ...state.laneVisibility,
      [normalizedLane]: normalizedVisible ?? !state.laneVisibility[normalizedLane],
    },
  }));
}

export function openTimelineDatePicker(draftFrom: unknown, draftTo: unknown): void {
  writeTimelineData((state) => ({
    ...state,
    datePicker: {
      open: true,
      draftFrom: normalizeTimelineDraftText(draftFrom),
      draftTo: normalizeTimelineDraftText(draftTo),
    },
  }));
}

export function closeTimelineDatePicker(): void {
  writeTimelineData((state) => ({
    ...state,
    datePicker: { ...state.datePicker, open: false },
  }));
}

export function setTimelineDatePickerDraftFrom(draftFrom: unknown): void {
  writeTimelineData((state) => ({
    ...state,
    datePicker: {
      ...state.datePicker,
      draftFrom: normalizeTimelineDraftText(draftFrom),
    },
  }));
}

export function setTimelineDatePickerDraftTo(draftTo: unknown): void {
  writeTimelineData((state) => ({
    ...state,
    datePicker: {
      ...state.datePicker,
      draftTo: normalizeTimelineDraftText(draftTo),
    },
  }));
}

export function startTimelineRangeDrag(x: unknown): void {
  const normalizedX = normalizeTimelineViewportX(x);
  if (normalizedX === null) return;
  writeTimelineData((state) => ({
    ...state,
    rangeDrag: { x1: normalizedX, x2: normalizedX },
  }));
}

export function updateTimelineRangeDrag(x2: unknown): void {
  const normalizedX = normalizeTimelineViewportX(x2);
  if (normalizedX === null) return;
  writeTimelineData((state) => ({
    ...state,
    rangeDrag: state.rangeDrag ? { ...state.rangeDrag, x2: normalizedX } : null,
  }));
}

export function clearTimelineRangeDrag(): void {
  writeTimelineData((state) => ({
    ...state,
    rangeDrag: null,
  }));
}

export function setTimelineMinimapDrag(drag: unknown): void {
  const normalizedDrag = normalizeTimelineMinimapDragState(drag);
  if (normalizedDrag === null) return;
  writeTimelineData((state) => ({
    ...state,
    minimapDrag: normalizedDrag,
  }));
}

export function clearTimelineMinimapDrag(pointerId?: unknown): void {
  const normalizedPointerId =
    pointerId === undefined ? undefined : normalizeTimelinePointerId(pointerId);
  writeTimelineData((state) => {
    if (
      normalizedPointerId === null ||
      (normalizedPointerId !== undefined &&
        state.minimapDrag !== null &&
        state.minimapDrag.pointerId !== normalizedPointerId)
    ) {
      return state;
    }
    return { ...state, minimapDrag: null };
  });
}

export function timelineMinimapDragSnapshot(): TimelineMinimapDragState | null {
  const drag = currentTimelineData().minimapDrag;
  return drag ? { ...drag } : null;
}

export function resetTimelineViewState(): void {
  writeTimelineData(timelineScopeDefaults());
}

/**
 * Compatibility/debug facade for older tests that need an imperative snapshot.
 * Production code is expected to use the named timeline seam functions above.
 */
export const useTimelineStore = {
  getState: timelineViewSnapshot,
};
