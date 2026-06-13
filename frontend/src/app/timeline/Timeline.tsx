// The timeline (W02.P08.S32, ADR G4.a): the time axis of the same
// instrument. Few fixed lanes (commits · document events · vault lifecycle
// events), zoom = aggregation: zoomed out, events render as engine-bucketed
// density bars; zooming in past the raw threshold resolves individual
// event marks. The timeline never renders ten thousand individual marks.

import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

import type { EngineEvent } from "../../stores/server/engine";
import { useEngineEvents } from "../../stores/server/queries";
import { useActiveScope } from "../stage/Stage";

// --- pure lane/zoom/projection helpers (unit-tested) ----------------------------

/** ≤4 fixed lanes; heterogeneity is per-event glyphs, not per-lane (G4.a). */
export const LANES = ["commits", "documents", "lifecycle"] as const;

export function laneOf(kind: string): number {
  if (kind === "commit") return 0;
  if (kind.startsWith("doc-")) return 1;
  return 2; // vault lifecycle: steps checked, plans approved, archives…
}

const EVENT_GLYPHS: Record<string, string> = {
  commit: "●",
  "doc-created": "✦",
  "doc-modified": "✧",
  "step-checked": "✓",
};

export function eventGlyph(kind: string): string {
  return EVENT_GLYPHS[kind] ?? "○";
}

/** Engine-side bucketing at coarse zooms, raw marks at fine zoom (§5). */
export function bucketForSpan(spanMs: number): "raw" | "1h" | "1d" {
  const DAY = 24 * 3600 * 1000;
  if (spanMs <= 3 * DAY) return "raw";
  if (spanMs <= 45 * DAY) return "1h";
  return "1d";
}

export interface TimeWindow {
  from: number;
  to: number;
}

export function timeToX(t: number, window: TimeWindow, width: number): number {
  return ((t - window.from) / (window.to - window.from)) * width;
}

export function xToTime(x: number, window: TimeWindow, width: number): number {
  return window.from + (x / width) * (window.to - window.from);
}

export const MIN_SPAN_MS = 3600_000;
export const MAX_SPAN_MS = 5 * 365 * 24 * 3600_000;

/** Zoom the window by `factor` anchored at `anchorT`, clamped to `now`. */
export function zoomWindow(
  window: TimeWindow,
  anchorT: number,
  factor: number,
  now: number,
): TimeWindow {
  const span = Math.max(
    MIN_SPAN_MS,
    Math.min(MAX_SPAN_MS, (window.to - window.from) * factor),
  );
  const ratio = (anchorT - window.from) / (window.to - window.from);
  let from = anchorT - span * ratio;
  let to = from + span;
  if (to > now) {
    to = now;
    from = to - span;
  }
  return { from, to };
}

// --- timeline view state ------------------------------------------------------------

interface TimelineState {
  window: TimeWindow;
  /** The playhead position; "live" docks at the right edge (G4.b, S33). */
  playheadT: number | "live";
  setWindow: (window: TimeWindow) => void;
  setPlayhead: (t: number | "live") => void;
}

export const useTimelineStore = create<TimelineState>((set) => ({
  window: { from: Date.now() - 180 * 24 * 3600_000, to: Date.now() },
  playheadT: "live",
  setWindow: (window) => set({ window }),
  setPlayhead: (playheadT) => set({ playheadT }),
}));

// --- the component --------------------------------------------------------------------

const LANE_HEIGHT = 22;
const RULER_HEIGHT = 16;
/** The client-side mark ceiling (finding 020). */
export const RAW_MARK_CAP = 500;

/** Marks/extensions other steps dock into the timeline surface. */
export interface TimelineSurfaceProps {
  onEventClick?: (event: EngineEvent) => void;
  overlay?: React.ReactNode;
}

export function Timeline({ onEventClick, overlay }: TimelineSurfaceProps = {}) {
  const scope = useActiveScope();
  const window_ = useTimelineStore((s) => s.window);
  const setWindow = useTimelineStore((s) => s.setWindow);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  const span = window_.to - window_.from;
  const bucket = bucketForSpan(span);
  const events = useEngineEvents(
    scope,
    {
      from: new Date(window_.from).toISOString(),
      to: new Date(window_.to).toISOString(),
    },
    bucket,
  );

  // Track width + wheel zoom anchored under the cursor.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setWidth(rect.width);
    });
    observer.observe(host);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      const state = useTimelineStore.getState();
      const anchorT = xToTime(e.clientX - rect.left, state.window, rect.width);
      setWindow(
        zoomWindow(state.window, anchorT, e.deltaY > 0 ? 1.25 : 0.8, Date.now()),
      );
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      host.removeEventListener("wheel", onWheel);
    };
  }, [setWindow]);

  const height = LANES.length * LANE_HEIGHT + RULER_HEIGHT;

  return (
    <div ref={hostRef} className="relative h-full select-none" data-timeline>
      <svg className="h-full w-full" role="img" aria-label="timeline">
        {LANES.map((lane, i) => (
          <g key={lane}>
            <text x={4} y={i * LANE_HEIGHT + 14} className="fill-ink-faint text-[9px]">
              {lane}
            </text>
            <line
              x1={0}
              x2={width}
              y1={(i + 1) * LANE_HEIGHT}
              y2={(i + 1) * LANE_HEIGHT}
              className="stroke-rule"
            />
          </g>
        ))}
        {/* Density buckets at coarse zoom (engine-bucketed, G4.a) */}
        {events.data?.buckets?.flatMap((b) => {
          const x = timeToX(Date.parse(b.from), window_, width);
          const w = Math.max(2, timeToX(Date.parse(b.to), window_, width) - x - 1);
          return Object.entries(b.counts_by_kind).map(([kind, count]) => {
            const lane = laneOf(kind);
            const h = Math.min(LANE_HEIGHT - 4, 3 + count * 3);
            return (
              <rect
                key={`${b.from}:${kind}`}
                x={x}
                y={(lane + 1) * LANE_HEIGHT - h - 2}
                width={w}
                height={h}
                className="fill-ink-faint/60"
              />
            );
          });
        })}
        {/* Individual event marks at fine zoom. Belt-and-suspenders cap
            (finding 020): the engine owns bucketing, but the client never
            renders an unbounded mark count even if served one. */}
        {events.data?.events?.slice(0, RAW_MARK_CAP).map((event: EngineEvent) => {
          const x = timeToX(Date.parse(event.ts), window_, width);
          const lane = laneOf(event.kind);
          return (
            <text
              key={event.id}
              x={x}
              y={(lane + 1) * LANE_HEIGHT - 6}
              className="cursor-pointer fill-ink-muted text-[10px] hover:fill-ink"
              onClick={() => onEventClick?.(event)}
            >
              {eventGlyph(event.kind)}
            </text>
          );
        })}
        {/* Ruler */}
        <line
          x1={0}
          x2={width}
          y1={height - RULER_HEIGHT}
          y2={height - RULER_HEIGHT}
          className="stroke-rule-strong"
        />
        <text x={4} y={height - 4} className="fill-ink-faint text-[9px]">
          {new Date(window_.from).toISOString().slice(0, 10)}
        </text>
        <text x={width - 70} y={height - 4} className="fill-ink-faint text-[9px]">
          {new Date(window_.to).toISOString().slice(0, 10)}
        </text>
      </svg>
      {overlay}
    </div>
  );
}
