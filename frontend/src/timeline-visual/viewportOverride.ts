import {
  fitTimelineViewportForScope,
  setTimelineViewport,
} from "../stores/view/timeline";
import {
  TIMELINE_ORIGIN_MS,
  clampPxPerMs,
  timeToStripX,
} from "../app/timeline/scrollStrip";

export interface TimelineViewportOverride {
  readonly fromMs: number;
  readonly toMs: number;
  readonly pxPerMs: number;
  readonly scrollOffset: number;
}

function parseInstant(value: string | null): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

export function timelineViewportOverrideFromParams(
  params: URLSearchParams,
  viewportWidth: number,
): TimelineViewportOverride | null {
  const fromMs = parseInstant(params.get("timelineFrom"));
  const toMs = parseInstant(params.get("timelineTo"));
  if (fromMs == null || toMs == null || toMs <= fromMs || viewportWidth <= 0) {
    return null;
  }

  const pxPerMs = clampPxPerMs(viewportWidth / (toMs - fromMs));
  return {
    fromMs,
    toMs,
    pxPerMs,
    scrollOffset: Math.max(0, timeToStripX(fromMs, TIMELINE_ORIGIN_MS, pxPerMs)),
  };
}

export function hasTimelineViewportOverrideParams(params: URLSearchParams): boolean {
  return params.has("timelineFrom") || params.has("timelineTo");
}

export function applyTimelineViewportOverrideFromUrl(
  search: string,
  scope: string | null,
  viewportWidth: number,
): TimelineViewportOverride | null {
  const override = timelineViewportOverrideFromParams(
    new URLSearchParams(search),
    viewportWidth,
  );
  if (!override) return null;

  if (scope) {
    fitTimelineViewportForScope(scope, override.pxPerMs, override.scrollOffset);
  } else {
    setTimelineViewport(override.pxPerMs, override.scrollOffset);
  }
  return override;
}
