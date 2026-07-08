// Timeline intent seam.
//
// The Issue-#14 scroll-strip NAVIGATION machinery (playhead pointer-drag + keyboard
// scrub, and the zoom / pan / fit / jump viewport intents) was retired with the timeline
// teardown and the TTR-005/006 time-travel parking — the strip is now a fixed two-handle
// date-range selector with no playhead, dots, or scroll. Only the two still-live seams
// remain: the per-scope corpus auto-fit consumed by the command palette
// (`fitTimelineScopeToCorpus`) and the playhead↔timeline-mode writer (`movePlayhead`),
// plus the small viewport-width clamp the auto-fit depends on. (Dead nav surface removed —
// timeline-temporal review item 6.)

import { patchDashboardTimelineMode } from "../server/dashboardState";
import {
  dashboardPlayheadForTimelineMode,
  dashboardTimelineModeForPlayhead,
} from "../server/dashboardTimeline";
import {
  fitTimelineSpan,
  fitTimelineViewportForScope,
  normalizeTimelineCorpusKey,
  normalizeTimelinePlayhead,
  normalizeTimelineScope,
  parseTimelineInstant,
  setTimelinePlayhead,
  type TimelineCorpusBounds,
} from "./timeline";

export const TIMELINE_NAV_DEFAULT_VIEWPORT_WIDTH = 800;

export function timelineNavigationViewportWidth(viewportWidth: number): number {
  return viewportWidth > 0 ? viewportWidth : TIMELINE_NAV_DEFAULT_VIEWPORT_WIDTH;
}

export function fitTimelineScopeToCorpus(
  scope: unknown,
  corpusBounds: TimelineCorpusBounds | undefined,
  viewportWidth: number,
  corpusKey: unknown,
  now = Date.now(),
): { pxPerMs: number; scrollOffset: number } | null {
  const normalizedScope = normalizeTimelineScope(scope);
  const normalizedCorpusKey = normalizeTimelineCorpusKey(corpusKey);
  if (normalizedScope === null || normalizedCorpusKey === null) return null;
  const from = parseTimelineInstant(corpusBounds?.from);
  if (!Number.isFinite(from)) return null;
  const to = parseTimelineInstant(corpusBounds?.to, now);
  const next = fitTimelineSpan(
    from,
    Number.isFinite(to) ? to : now,
    timelineNavigationViewportWidth(viewportWidth),
  );
  fitTimelineViewportForScope(
    normalizedScope,
    next.pxPerMs,
    next.scrollOffset,
    normalizedCorpusKey,
  );
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
