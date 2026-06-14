// The timeline (re-skinned W02.P12.S28 onto the OKLCH token layer and the
// Phosphor domain marks per the timeline surface ADR): the time axis of the
// same instrument. Few fixed lanes (commits · document events · vault
// lifecycle events); zoom = aggregation: zoomed out, events render as
// engine-bucketed density bars; zooming in past the raw threshold resolves
// individual event marks. The timeline never renders ten thousand marks.
//
// Visual register (timeline ADR "Lane model" / "Zoom-as-aggregation"): color is
// spent not sprinkled — the SVG lanes/ruler use soft token borders (structure
// felt not seen), density bars use a single muted token fill, and individual
// marks draw their Phosphor domain mark in currentColor (git-commit, file-plus /
// file-text, flag-pennant for lifecycle), each shape-first so a lane reads in
// grayscale at 14px. All timestamps and counts carry tabular numerals.
//
// Layer ownership (dashboard-layer-ownership / timeline ADR "Layer ownership"):
// this is app-chrome. It reads events through the stores query hook and the
// degradation state through a stores selector; it emits select intent back
// through the shared selection. It fetches nothing, defines no event/node shape,
// and never reads the raw `tiers` block — the bucket-to-mark resolution is a CUT
// between representations (a structural change), never an animated morph.

import { type Icon } from "@phosphor-icons/react";
import { FilePlus, FileText, FlagPennant, GitCommit } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

import type { EngineEvent } from "../../stores/server/engine";
import { useEngineEvents } from "../../stores/server/queries";
import { useSurfaceStates } from "../degradation/useDegradation";
import { useActiveScope } from "../stage/Stage";

// --- pure lane/zoom/projection helpers (unit-tested) ----------------------------

/** ≤4 fixed lanes; heterogeneity is per-event marks, not per-lane (ADR). */
export const LANES = ["commits", "documents", "lifecycle"] as const;

export function laneOf(kind: string): number {
  if (kind === "commit") return 0;
  if (kind.startsWith("doc-")) return 1;
  return 2; // vault lifecycle: steps checked, plans approved, archives…
}

/**
 * The Phosphor domain mark for an event kind (iconography ADR "domain marks"):
 * git-commit directly, file-plus / file-text for doc-created / doc-modified,
 * flag-pennant for lifecycle. Each is shape-first so the lane stays legible in
 * grayscale at 14px; hue is redundant reinforcement, not the only channel.
 */
const EVENT_MARKS: Record<string, Icon> = {
  commit: GitCommit,
  "doc-created": FilePlus,
  "doc-modified": FileText,
};

export function eventMark(kind: string): Icon {
  return EVENT_MARKS[kind] ?? FlagPennant; // lifecycle is the fallback lane
}

/** A short human label for the event kind, used in accessible names. */
export function eventKindLabel(kind: string): string {
  if (kind === "commit") return "commit";
  if (kind === "doc-created") return "document created";
  if (kind === "doc-modified") return "document modified";
  return kind.replace(/-/g, " ");
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

/** Human-time label for an ISO instant (date + minute), tabular-rendered. */
export function humanInstant(ts: string | number): string {
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

// --- timeline view state ------------------------------------------------------------

interface TimelineState {
  window: TimeWindow;
  /** The playhead position; "live" docks at the right edge (ADR). */
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
const MARK_PX = 13;
/** The client-side mark ceiling (belt-and-suspenders; ADR bounded reads). */
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

  // Degradation truth, pre-derived from the stores layer (ADR "States"): a lost
  // stream renders RECONNECTING, an absent corpus renders empty, a missing
  // date-mandate renders the lifecycle lane sparse — designed states, never an
  // error. The timeline never reads the raw `tiers` block.
  const surface = useSurfaceStates().timeline;

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

  // The honest states (ADR "States"). Loading does NOT flash empty: the lane
  // scaffold renders with a subtle liveness cue while the first events resolve.
  // Empty / no-history is approachable, not an error. A genuine request failure
  // is a contained, copy-toned message scoped to the timeline.
  const loading = events.isLoading;
  const errored = events.isError;
  const buckets = events.data?.buckets ?? [];
  const marks = events.data?.events ?? [];
  const noHistory =
    !loading &&
    !errored &&
    buckets.length === 0 &&
    marks.length === 0 &&
    (surface === "empty" || surface === "normal" || surface === "lifecycle-sparse");

  return (
    <div ref={hostRef} className="relative h-full select-none" data-timeline>
      <svg
        className="h-full w-full"
        role="img"
        aria-label="event timeline"
        aria-busy={loading || undefined}
      >
        {LANES.map((lane, i) => (
          <g key={lane}>
            <text x={4} y={i * LANE_HEIGHT + 14} className="fill-ink-faint text-2xs">
              {lane}
            </text>
            {/* Soft low-contrast lane rule — structure felt, not seen (ADR). */}
            <line
              x1={0}
              x2={width}
              y1={(i + 1) * LANE_HEIGHT}
              y2={(i + 1) * LANE_HEIGHT}
              className="stroke-rule"
            />
          </g>
        ))}
        {/* Density buckets at coarse zoom (engine-bucketed, ADR). A single muted
            token fill — no per-bar hue (color is spent, not sprinkled). */}
        {buckets.flatMap((b) => {
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
                rx={1}
                className="fill-ink-faint/55"
              />
            );
          });
        })}
        {/* Ruler baseline — a soft token rule, attenuated so the marks lead. */}
        <line
          x1={0}
          x2={width}
          y1={height - RULER_HEIGHT}
          y2={height - RULER_HEIGHT}
          className="stroke-rule-strong"
        />
      </svg>

      {/* Ruler endpoints as HTML so tabular numerals apply (ADR: mandated on
          dates). Positioned over the SVG ruler baseline. */}
      <div
        className="pointer-events-none absolute inset-x-0 flex justify-between px-vs-1 text-2xs text-ink-faint"
        style={{ bottom: "2px" }}
      >
        <time data-tabular dateTime={new Date(window_.from).toISOString()}>
          {new Date(window_.from).toISOString().slice(0, 10)}
        </time>
        <time data-tabular dateTime={new Date(window_.to).toISOString()}>
          {new Date(window_.to).toISOString().slice(0, 10)}
        </time>
      </div>

      {/* Individual event marks at fine zoom, as a focusable HTML overlay so the
          Phosphor marks render in-family AND each mark is a real, keyboard-
          reachable control with its kind / time / joined-node count announced
          (ADR "Keyboard contract, a11y"). Belt-and-suspenders cap: the engine
          owns bucketing, but the client never renders an unbounded mark count. */}
      {!loading && !errored && marks.length > 0 && (
        <div
          className="pointer-events-none absolute inset-0"
          role="list"
          aria-label="timeline events"
        >
          {marks.slice(0, RAW_MARK_CAP).map((event: EngineEvent) => {
            const x = timeToX(Date.parse(event.ts), window_, width);
            const lane = laneOf(event.kind);
            const Mark = eventMark(event.kind);
            const carried = event.node_ids.length;
            const dropped = event.truncated_node_ids ?? 0;
            const label = `${eventKindLabel(event.kind)} at ${humanInstant(
              event.ts,
            )}, touching ${carried} node${carried === 1 ? "" : "s"}${
              dropped > 0 ? ` (+${dropped} more not shown)` : ""
            }`;
            return (
              <button
                key={event.id}
                type="button"
                role="listitem"
                aria-label={label}
                title={label}
                onClick={() => onEventClick?.(event)}
                className="pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-vs-sm text-ink-muted transition-colors duration-ui-fast ease-settle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                style={{
                  left: `${Math.max(0, Math.min(width, x))}px`,
                  top: `${(lane + 1) * LANE_HEIGHT - MARK_PX / 2 - 2}px`,
                }}
                data-timeline-mark
                data-event-kind={event.kind}
              >
                <Mark size={MARK_PX} weight="regular" aria-hidden />
              </button>
            );
          })}
        </div>
      )}

      {/* Loading: a quiet copy-toned liveness line — the scaffold above stays
          visible, so the surface never flashes empty (ADR "States"). */}
      {loading && (
        <div
          className="pointer-events-none absolute left-vs-2 top-1/2 flex -translate-y-1/2 items-center gap-vs-1 text-2xs text-ink-faint"
          role="status"
          data-timeline-loading
        >
          <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-state-live" />
          reading the timeline…
        </div>
      )}

      {/* Empty / no-history: approachable, never an error. The lifecycle lane
          tracks the in-flight date-stamping mandate — degrade, don't demand. */}
      {noHistory && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-2xs text-ink-faint"
          role="status"
          data-timeline-empty
        >
          {surface === "lifecycle-sparse"
            ? "lifecycle events appear as documents gain dates"
            : "no events in this range yet"}
        </div>
      )}

      {/* Error: a contained, copy-toned message scoped to the timeline — it does
          not blank the surface or leak into the stage (ADR "States"). */}
      {errored && (
        <div
          className="absolute left-vs-2 top-1/2 flex -translate-y-1/2 items-center gap-vs-2 text-2xs text-ink-muted"
          role="alert"
          data-timeline-error
        >
          <span>couldn’t load the timeline</span>
          <button
            type="button"
            onClick={() => void events.refetch()}
            className="rounded-vs-sm bg-paper-sunken px-vs-1-5 py-vs-0-5 text-ink transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          >
            retry
          </button>
        </div>
      )}

      {overlay}
    </div>
  );
}
