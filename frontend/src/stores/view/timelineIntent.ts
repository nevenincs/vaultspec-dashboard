import { patchDashboardTimelineMode } from "../server/dashboardState";
import {
  dashboardPlayheadForTimelineMode,
  dashboardTimelineModeForPlayhead,
} from "../server/dashboardTimeline";
import {
  fitTimelineSpan,
  fitTimelineViewportForScope,
  normalizeTimelinePlayhead,
  normalizeTimelineScope,
  parseTimelineInstant,
  setTimelinePlayhead,
  setTimelineScrollOffset,
  setTimelineViewport,
  timelineJumpToCorpusEdgeOffset,
  timelinePanScrollOffset,
  timelineViewSnapshot,
  timelineViewportXToTime,
  timelineViewportForInstant,
  timelineZoomViewport,
  timelineZoomViewportAt,
  type TimelineCorpusEdge,
  type TimelineCorpusBounds,
  type TimelineOrderedDateInputRange,
} from "./timeline";

export const TIMELINE_NAV_DEFAULT_VIEWPORT_WIDTH = 800;
export const TIMELINE_NAV_EVENT_SPAN_MS = 24 * 3600 * 1000;
export const LIVE_SNAP_PX = 10;

export function dragToPlayhead(
  x: number,
  pxPerMs: number,
  scrollOffset: number,
  liveDockX: number,
  now: number,
): number | "live" {
  if (x >= liveDockX - LIVE_SNAP_PX) return "live";
  return Math.min(now, timelineViewportXToTime(x, pxPerMs, scrollOffset));
}

export function keyboardStep(
  current: number | "live",
  deltaMs: number,
  now: number,
): number | "live" {
  const base = current === "live" ? now : current;
  const next = base + deltaMs;
  if (next >= now) return "live";
  return Math.min(now, next);
}

export interface PlayheadDragPointerSessionInput {
  host: HTMLElement;
  getScope: () => unknown;
  moveTarget?: Pick<typeof globalThis, "addEventListener" | "removeEventListener">;
}

export function startPlayheadDragPointerSession({
  host,
  getScope,
  moveTarget = globalThis,
}: PlayheadDragPointerSessionInput): () => void {
  let dragging = false;
  const toPlayhead = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    const { pxPerMs, scrollOffset } = timelineViewSnapshot();
    return dragToPlayhead(
      event.clientX - rect.left,
      pxPerMs,
      scrollOffset,
      rect.width,
      Date.now(),
    );
  };
  const onDown = (event: PointerEvent) => {
    if (!(event.target as HTMLElement).closest("[data-playhead-grip]")) return;
    dragging = true;
    event.preventDefault();
  };
  const onMove = (event: PointerEvent) => {
    if (dragging) movePlayhead(toPlayhead(event), getScope());
  };
  const onUp = () => {
    dragging = false;
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

export function timelineNavigationViewportWidth(viewportWidth: number): number {
  return viewportWidth > 0 ? viewportWidth : TIMELINE_NAV_DEFAULT_VIEWPORT_WIDTH;
}

export function zoomTimelineNavigation(
  pxPerMs: number,
  scrollOffset: number,
  viewportWidth: number,
  factor: number,
): { pxPerMs: number; scrollOffset: number } {
  const next = timelineZoomViewport(
    pxPerMs,
    scrollOffset,
    timelineNavigationViewportWidth(viewportWidth),
    factor,
  );
  setTimelineViewport(next.pxPerMs, next.scrollOffset);
  return next;
}

export function zoomTimelineNavigationAt(
  pxPerMs: number,
  scrollOffset: number,
  cursorX: number,
  factor: number,
): { pxPerMs: number; scrollOffset: number } {
  const next = timelineZoomViewportAt(pxPerMs, scrollOffset, cursorX, factor);
  setTimelineViewport(next.pxPerMs, next.scrollOffset);
  return next;
}

export function panTimelineNavigation(scrollOffset: number, deltaPx: number): number {
  const next = timelinePanScrollOffset(scrollOffset, deltaPx);
  setTimelineScrollOffset(next);
  return next;
}

export function fitTimelineNavigationToCorpus(
  corpusBounds: TimelineCorpusBounds | undefined,
  viewportWidth: number,
  now = Date.now(),
): { pxPerMs: number; scrollOffset: number } | null {
  const from = parseTimelineInstant(corpusBounds?.from);
  const to = parseTimelineInstant(corpusBounds?.to, now);
  if (!Number.isFinite(from)) return null;
  const next = fitTimelineSpan(
    from,
    Number.isFinite(to) ? to : now,
    timelineNavigationViewportWidth(viewportWidth),
  );
  setTimelineViewport(next.pxPerMs, next.scrollOffset);
  return next;
}

export function fitTimelineNavigationToDateRange(
  range: TimelineOrderedDateInputRange,
  viewportWidth: number,
): { pxPerMs: number; scrollOffset: number } {
  const next = fitTimelineSpan(
    range.fromMs,
    range.toMs,
    timelineNavigationViewportWidth(viewportWidth),
  );
  setTimelineViewport(next.pxPerMs, next.scrollOffset);
  return next;
}

export function fitTimelineScopeToCorpus(
  scope: string | null,
  corpusBounds: TimelineCorpusBounds | undefined,
  viewportWidth: number,
  corpusKey: string | null,
  now = Date.now(),
): { pxPerMs: number; scrollOffset: number } | null {
  if (scope == null || !corpusKey) return null;
  const from = parseTimelineInstant(corpusBounds?.from);
  if (!Number.isFinite(from)) return null;
  const to = parseTimelineInstant(corpusBounds?.to, now);
  const next = fitTimelineSpan(
    from,
    Number.isFinite(to) ? to : now,
    timelineNavigationViewportWidth(viewportWidth),
  );
  fitTimelineViewportForScope(scope, next.pxPerMs, next.scrollOffset, corpusKey);
  return next;
}

export function jumpTimelineNavigationToCorpusEdge(
  edge: TimelineCorpusEdge,
  corpusBounds: TimelineCorpusBounds | undefined,
  pxPerMs: number,
  viewportWidth: number,
  now = Date.now(),
): number {
  const raw =
    edge === "start"
      ? parseTimelineInstant(corpusBounds?.from, now)
      : parseTimelineInstant(corpusBounds?.to, now);
  const tMs = Number.isFinite(raw) ? raw : now;
  const scrollOffset = timelineJumpToCorpusEdgeOffset(
    edge,
    tMs,
    pxPerMs,
    timelineNavigationViewportWidth(viewportWidth),
  );
  setTimelineScrollOffset(scrollOffset);
  return scrollOffset;
}

export function jumpTimelineNavigationToLive(
  corpusBounds: TimelineCorpusBounds | undefined,
  pxPerMs: number,
  viewportWidth: number,
  scope: string | null,
  now = Date.now(),
): number {
  const scrollOffset = jumpTimelineNavigationToCorpusEdge(
    "end",
    corpusBounds,
    pxPerMs,
    viewportWidth,
    now,
  );
  movePlayhead("live", scope);
  return scrollOffset;
}

export function zoomTimelineNavigationToInstant(
  tMs: number,
  viewportWidth = timelineViewSnapshot().viewportWidth,
  spanMs = TIMELINE_NAV_EVENT_SPAN_MS,
  now = Date.now(),
): { pxPerMs: number; scrollOffset: number } {
  const next = timelineViewportForInstant(
    tMs,
    timelineNavigationViewportWidth(viewportWidth),
    spanMs,
    now,
  );
  setTimelineViewport(next.pxPerMs, next.scrollOffset);
  return next;
}

/**
 * One mutation for both stores: the playhead IS the dashboard timeline mode.
 *
 * Scope is explicit so production callers cannot accidentally fall into a
 * local-first playhead write. With a scope, the local projection mirrors the
 * accepted dashboard-state response; without one, isolated renders/tests can
 * move the view-local affordance only.
 */
export function movePlayhead(t: unknown, scope: unknown): void {
  const playhead = normalizeTimelinePlayhead(t);
  const normalizedScope = normalizeTimelineScope(scope);
  if (normalizedScope !== null) {
    void patchDashboardTimelineMode(
      normalizedScope,
      dashboardTimelineModeForPlayhead(playhead),
    )
      .then((state) => {
        if (!state) return;
        setTimelinePlayhead(dashboardPlayheadForTimelineMode(state.timeline_mode));
      })
      .catch(() => undefined);
    return;
  }
  if (scope == null) {
    setTimelinePlayhead(playhead);
  }
}
