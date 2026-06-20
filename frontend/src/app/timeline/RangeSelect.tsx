// Range selection (W03.P07.S43: retained from the prior re-skin and ADAPTED to
// the scroll-strip coordinate model per the dashboard-timeline ADR). Shift-drag
// across the timeline (the plain drag stays reserved for the playhead) to set the
// product's SINGLE date-range filter — owned by the timeline, shown in the filter
// bar as a chip. The committed range renders as a band in the ACCENT token (not a
// literal sky tint) with the base language's selection ring. "Play" animates the
// playhead across the range to watch the network grow: the cheapest, most legible
// "history of this feature" story in the product.
//
// Scroll-strip coordinates (S43): the drag span maps to a time range through
// `xToTime` over the SHARED store `pxPerMs` + `scrollOffset` (canonical epoch
// origin `TIMELINE_ORIGIN_MS`), and the committed band positions through `timeToX`
// over the same scale + offset — replacing the old fit-to-window math. The SINGLE
// date-range writer invariant is unchanged: this surface alone writes the
// date-range filter through the stores setter.
//
// Motion (ADR / base motion law): play-the-range is a deliberate, state-
// communicating animation that runs on animation frames ONLY while a play is
// active (an idle timeline schedules no per-frame callback). Under
// prefers-reduced-motion the animated sweep is swapped for an instant jump to the
// range end — the reduced-motion floor, honored at this surface's own path.
//
// Keyboard (ADR a11y): the band exposes its bounds and a keyboard escape clears
// the range; the play / clear controls are real buttons with accessible names.
//
// Layer ownership (dashboard-layer-ownership / timeline ADR): app-chrome, the
// SINGLE date-range writer in the product. It writes only the date-range filter
// through the stores setter and fetches nothing; no other surface may set it.

import { Play, X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";

import { useDateRangeIntent } from "../../stores/server/dateRangeIntent";
import {
  clearTimelineRangeDrag,
  startTimelineRangeDragPointerSession,
  timelineDashboardDateString,
  timelineRangeFromDrag,
  useTimelineRangeDragState,
  useTimelineScrollState,
} from "../../stores/view/timeline";
import {
  useActiveScope,
  useDashboardRangeSelectView,
} from "../../stores/server/queries";
import { useReducedMotion } from "../chrome/useReducedMotion";
import { movePlayhead } from "../../stores/view/timelineIntent";
import { humanInstant } from "./Timeline";
import { TIMELINE_ORIGIN_MS, timeToX } from "./scrollStrip";

// --- pure helpers (unit-tested) -------------------------------------------------

export const rangeFromDrag = timelineRangeFromDrag;
export const dashboardDateString = timelineDashboardDateString;

export const PLAY_DURATION_MS = 4000;

/** Playhead position `elapsed` ms into a range play, clamped to the end. */
export function playPosition(
  from: number,
  to: number,
  elapsed: number,
  duration = PLAY_DURATION_MS,
): number {
  const ratio = Math.max(0, Math.min(1, elapsed / duration));
  return from + (to - from) * ratio;
}

// --- play-the-range ----------------------------------------------------------------

interface PlayState {
  from: number;
  to: number;
  startedAt: number;
  scope: unknown;
}

let playState: PlayState | null = null;
/** Set by the mounted player; lets `startRangePlay` wake the RAF loop. */
let kickRangePlay: (() => void) | null = null;

export function startRangePlay(
  from: number,
  to: number,
  now: number,
  scope: unknown = null,
  reducedMotion = false,
): void {
  // Reduced-motion floor (ADR): swap the animated sweep for an instant jump to
  // the range end — the network is shown grown, with no per-frame animation.
  if (reducedMotion) {
    playState = null;
    movePlayhead(to, scope);
    return;
  }
  playState = { from, to, startedAt: now, scope };
  kickRangePlay?.();
}

export function stopRangePlay(): void {
  playState = null;
}

/**
 * Drives the playhead across an active range play on animation frames. The RAF
 * loop runs ONLY while a play is active and stops at completion: an idle timeline
 * schedules no per-frame callback.
 */
export function useRangePlayer(): void {
  useEffect(() => {
    let raf = 0;
    let running = false;
    const tick = () => {
      if (!playState) {
        running = false;
        return;
      }
      const elapsed = performance.now() - playState.startedAt;
      movePlayhead(
        playPosition(playState.from, playState.to, elapsed),
        playState.scope,
      );
      if (elapsed >= PLAY_DURATION_MS) {
        playState = null;
        running = false;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    kickRangePlay = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };
    if (playState) kickRangePlay(); // a play already active at mount
    return () => {
      cancelAnimationFrame(raf);
      kickRangePlay = null;
    };
  }, []);
}

// --- the overlay ---------------------------------------------------------------------

export function RangeSelect() {
  const scope = useActiveScope();
  const reducedMotion = useReducedMotion();
  const { pxPerMs, scrollOffset } = useTimelineScrollState();
  const rangeSelect = useDashboardRangeSelectView(scope);
  const rangeIntent = useDateRangeIntent(scope);
  const rangeIntentRef = useRef(rangeIntent);
  rangeIntentRef.current = rangeIntent;
  const commitRangeRef = useRef<(range: { from: string; to: string }) => void>(
    () => undefined,
  );
  commitRangeRef.current = (range) => {
    if (scope) void rangeIntentRef.current.setRange(range);
  };
  const dateRange = rangeSelect.dateRange;
  const hostRef = useRef<HTMLDivElement>(null);
  const drag = useTimelineRangeDragState();
  useRangePlayer();

  useEffect(() => {
    clearTimelineRangeDrag();
    stopRangePlay();
  }, [scope]);

  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    return startTimelineRangeDragPointerSession({
      host,
      commitRange: (range) => commitRangeRef.current(range),
    });
    // Only scope remains a dep (B8); mutation and pxPerMs/scrollOffset are read
    // imperatively, so scroll/zoom and mutation-object churn do not re-register
    // the listeners.
  }, [scope]);

  const clearRange = () => {
    stopRangePlay();
    if (scope) void rangeIntentRef.current.clearRange();
    movePlayhead("live", scope);
  };

  const committed =
    dateRange.from && dateRange.to
      ? {
          x1: timeToX(
            Date.parse(dateRange.from),
            TIMELINE_ORIGIN_MS,
            pxPerMs,
            scrollOffset,
          ),
          x2: timeToX(
            Date.parse(dateRange.to),
            TIMELINE_ORIGIN_MS,
            pxPerMs,
            scrollOffset,
          ),
        }
      : null;
  const band = drag ?? committed;

  // The committed band escapes the range from the keyboard (ADR: range keys clear
  // from the keyboard) — Escape / Delete / Backspace clear, instantly.
  const onBandKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" || e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      clearRange();
    }
  };

  const bandLabel =
    committed && dateRange.from && dateRange.to
      ? `selected range ${humanInstant(dateRange.from)} to ${humanInstant(dateRange.to)}`
      : "selecting range";

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      {band && (
        <div
          // The committed band is a focusable, labelled region announcing its
          // bounds (ADR: the range band announces its bounds); the live drag is a
          // transient visual without focus.
          {...(committed && !drag
            ? {
                role: "region",
                "aria-label": bandLabel,
                tabIndex: 0,
                onKeyDown: onBandKeyDown,
              }
            : { "aria-hidden": true })}
          className={`absolute top-0 bottom-0 bg-accent-subtle/55 ring-1 ring-accent ${
            committed && !drag
              ? "pointer-events-auto transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
              : ""
          }`}
          style={{
            left: `${Math.min(band.x1, band.x2)}px`,
            width: `${Math.abs(band.x2 - band.x1)}px`,
          }}
          data-range-band
        />
      )}
      {committed && !drag && (
        <div
          className="pointer-events-auto absolute top-0 flex gap-fg-1 text-label"
          style={{ left: `${Math.min(committed.x1, committed.x2)}px` }}
        >
          <button
            type="button"
            aria-label="play the selected range"
            className="flex items-center gap-fg-1 rounded-fg-xs bg-accent-subtle px-fg-1-5 py-fg-0-5 text-accent-text transition-colors duration-ui-fast ease-settle hover:bg-accent-subtle/70 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            onClick={() =>
              startRangePlay(
                Date.parse(dateRange.from!),
                Date.parse(dateRange.to!),
                performance.now(),
                scope,
                reducedMotion,
              )
            }
          >
            <Play size={10} aria-hidden />
            play
          </button>
          <button
            type="button"
            aria-label="clear date range"
            className="flex items-center rounded-fg-xs bg-paper-sunken px-fg-1 py-fg-0-5 text-ink-muted transition-colors duration-ui-fast ease-settle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
            onClick={clearRange}
          >
            <X size={10} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
