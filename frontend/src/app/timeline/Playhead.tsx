// The playhead (W03.P07.S42: retained from the prior re-skin and ADAPTED to the
// scroll-strip model per the dashboard-timeline ADR "Density, bundling, and the
// scroll model" + "Time-travel mode (inherited, re-affirmed)"). The timeline's
// default state is LIVE: now-anchored, docked at the RIGHT edge of the viewport
// (computed via `liveEdgeOffset`), drawn in the accent / live-state token.
// Dragging the playhead off LIVE (outside the right-edge snap zone) puts the
// product into time-travel mode — unmistakably and from one shared truth: the
// mode flips in canonical dashboard-state (operational verbs disable on it, the
// stage tint shifts), a "viewing {date} — return to live" chip docks on the
// stage, and the playhead itself changes character to the stale / non-live token.
// Returning docks back.
//
// Scroll-strip coordinates (S42): position maps through `timeToX` / `xToTime` over
// the SHARED store `pxPerMs` + `scrollOffset` (origin = epoch, t=0 in strip space,
// the canonical `TIMELINE_ORIGIN_MS`), replacing the old fit-to-window math. LIVE
// docks at the right viewport edge; scrolling left walks the present off the right
// edge and back in time, so the snap-back-to-LIVE zone is the right edge of the
// viewport, not a fixed window end.
//
// Keyboard contract (ADR a11y): the playhead is an ARIA slider. Bracket keys [ / ]
// step the playhead, arrow keys nudge, Home returns to LIVE; every
// keyboard-initiated step is INSTANT (it never animates, per the base motion law)
// — the mutation writes the shared state directly with no per-frame tween. The
// slider exposes aria-valuetext in human time (LIVE or the ISO instant) and the
// time-travel mode is conveyed non-visually through a live status region.
//
// Layer ownership (dashboard-layer-ownership / timeline ADR): app-chrome. It reads
// the degradation state and (through movePlayhead) writes the shared timeline
// mode; it fetches nothing and never reads the raw `tiers` block. The RECONNECTING
// state arrives pre-derived from the stores degradation layer.

import { Play, RotateCcw } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from "react";

import {
  useDashboardPlayheadView,
  useDashboardTimelineModeView,
} from "../../stores/server/queries";
import {
  normalizeTimelineScope,
  setTimelinePlayhead,
  timelineViewSnapshot,
  useTimelinePlayhead,
  useTimelineScrollState,
} from "../../stores/view/timeline";
import {
  LIVE_SNAP_PX,
  dragToPlayhead,
  keyboardStep,
  movePlayhead,
  startPlayheadDragPointerSession,
} from "../../stores/view/timelineIntent";
import { useElementWidth } from "../chrome/useElementWidth";
import { useSurfaceStates } from "../degradation/useDegradation";
import { humanInstant, isoInstant } from "./Timeline";
import { TIMELINE_ORIGIN_MS, timeToX, xToTime } from "./scrollStrip";

export { LIVE_SNAP_PX, dragToPlayhead, keyboardStep };

/** The playhead rail width in px — a named geometry constant, applied via
 *  inline style to match the Timeline's MARK_PX / LANE_HEIGHT pattern (no raw
 *  arbitrary-px Tailwind class). */
export const PLAYHEAD_W = 3;

/** One keyboard step nudges the playhead this fraction of the visible span. */
export const KEY_STEP_FRACTION = 1 / 24;
export const KEY_NUDGE_FRACTION = 1 / 96;

export function Playhead({ scope }: { scope: unknown }) {
  const normalizedScope = normalizeTimelineScope(scope);
  const playheadT = useTimelinePlayhead();
  const { pxPerMs, scrollOffset } = useTimelineScrollState();
  const dashboardPlayhead = useDashboardPlayheadView(normalizedScope);
  // The LIVE chip becomes RECONNECTING when the engine stream is lost
  // (degradation matrix §8 — a designed state, not an error).
  const reconnecting = useSurfaceStates().timeline === "reconnecting";
  const hostRef = useRef<HTMLDivElement>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // Track the real rail width: the live dock sits at the right viewport edge.
  const width = useElementWidth(hostRef, { parent: true }) ?? 800;

  useEffect(() => {
    if (!dashboardPlayhead.loaded) return;
    const next = dashboardPlayhead.playhead;
    if (timelineViewSnapshot().playheadT !== next) setTimelinePlayhead(next);
  }, [dashboardPlayhead.loaded, dashboardPlayhead.playhead]);

  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    return startPlayheadDragPointerSession({
      host,
      getScope: () => scopeRef.current,
    });
    // Empty deps (B8): the handlers read pxPerMs/scrollOffset via getState at
    // event time, so the effect references no reactive value and the listeners
    // register ONCE for the component's life.
  }, []);

  const live = playheadT === "live";
  // LIVE docks at the right viewport edge; a concrete instant maps through the
  // scroll-strip helper over the shared scale + offset.
  const x = live
    ? width - 2
    : timeToX(playheadT, TIMELINE_ORIGIN_MS, pxPerMs, scrollOffset);
  // One keyboard step is a fraction of the VISIBLE span (viewport width in time).
  const visibleSpanMs = width / pxPerMs;

  // Keyboard scrub (ADR): [ / ] step, arrows nudge, Home -> LIVE. Every branch
  // applies the pure projection INSTANTLY (no animation frame). The grip is the
  // slider, so it receives these keys when focused.
  const onGripKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const now = Date.now();
    const step = visibleSpanMs * KEY_STEP_FRACTION;
    const nudge = visibleSpanMs * KEY_NUDGE_FRACTION;
    let next: number | "live";
    switch (e.key) {
      case "[":
      case "ArrowLeft":
        next = keyboardStep(playheadT, e.key === "[" ? -step : -nudge, now);
        break;
      case "]":
      case "ArrowRight":
        next = keyboardStep(playheadT, e.key === "]" ? step : nudge, now);
        break;
      case "Home":
        next = "live";
        break;
      default:
        return;
    }
    e.preventDefault();
    movePlayhead(next, scope);
  };

  // ARIA slider value math: min = visible-range start, max = now (LIVE), now =
  // current. The bounds track the scroll-strip viewport, not a fixed window.
  const now = Date.now();
  const viewportFrom = xToTime(0, TIMELINE_ORIGIN_MS, pxPerMs, scrollOffset);
  const ariaNow = live ? now : playheadT;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      <div
        data-playhead-grip
        role="slider"
        tabIndex={0}
        aria-label="playhead"
        aria-valuemin={Math.round(viewportFrom)}
        aria-valuemax={Math.round(now)}
        aria-valuenow={Math.round(ariaNow)}
        // S62: the slider names LIVE or the current ISO instant (the canonical
        // minute-precision ISO form so the value text is unambiguous to assistive
        // tech; the tabular treatment applies wherever the same instant is shown
        // visually, e.g. the time-travel chip and the ruler).
        aria-valuetext={live ? "LIVE" : isoInstant(playheadT)}
        onKeyDown={onGripKeyDown}
        className={`pointer-events-auto absolute top-0 bottom-0 cursor-ew-resize transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          live ? "bg-state-live" : "bg-state-stale"
        }`}
        style={{
          width: `${PLAYHEAD_W}px`,
          left: `${Math.max(0, Math.min(width - PLAYHEAD_W, x))}px`,
        }}
      />
      <button
        type="button"
        onClick={() => {
          movePlayhead("live", scope);
        }}
        aria-label={
          reconnecting
            ? "reconnecting to the live stream"
            : live
              ? "live"
              : "return to live"
        }
        className={`pointer-events-auto absolute top-0 right-1 flex items-center gap-fg-1 rounded-fg-xs px-fg-1 py-fg-0-5 text-label font-medium transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          reconnecting
            ? "text-state-stale"
            : live
              ? "text-state-live"
              : "text-state-stale hover:text-state-live"
        }`}
        data-playhead-live
      >
        {reconnecting ? (
          <>
            {/* The liveness cue is tied to the real streaming state — it pulses
                on the token-defined liveness keyframe only while genuinely
                reconnecting, never ambient (ADR / the Codex thinking-state
                lesson). No magic duration: the cue uses the shared --animate
                token. */}
            <RotateCcw size={11} aria-hidden className="animate-pulse-live" />
            RECONNECTING
          </>
        ) : live ? (
          <>
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-state-live" />
            LIVE
          </>
        ) : (
          <>
            <RotateCcw size={11} aria-hidden />
            return to live
          </>
        )}
      </button>

      {/* The enforced mode, conveyed NON-visually too (ADR: mode honesty must be
          honest to assistive tech). A quiet live status region announces LIVE /
          time-travel transitions and the RECONNECTING degradation, mirroring the
          slider's value text so the unmistakable mode is not eye-only. */}
      <span className="sr-only" role="status" aria-live="polite" data-playhead-mode>
        {reconnecting
          ? "Live stream lost — reconnecting"
          : live
            ? "Live — following the present"
            : `Time travel active — viewing ${humanInstant(playheadT)}. Operational actions are disabled.`}
      </span>
    </div>
  );
}

/** The unmistakable mode chip — docked on the stage while time travelling. */
export function TimeTravelChip({ scope }: { scope: unknown }) {
  const normalizedScope = normalizeTimelineScope(scope);
  const timeline = useDashboardTimelineModeView(normalizedScope);
  if (!timeline.timeTravel || timeline.asOf === undefined) return null;
  return (
    <div
      className="pointer-events-auto absolute bottom-2 right-2 z-10 flex items-center gap-fg-1 rounded-fg-pill border border-state-stale/40 bg-paper-raised/95 px-fg-3 py-fg-1 text-label text-state-stale shadow-fg-raised"
      data-time-travel-chip
    >
      <Play size={11} aria-hidden className="rotate-180" />
      <span>
        viewing <time data-tabular>{humanInstant(timeline.asOf)}</time>
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-fg-1 rounded-fg-xs px-fg-1 underline transition-colors duration-ui-fast ease-settle hover:text-state-live focus-visible:no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        onClick={() => {
          movePlayhead("live", scope);
        }}
      >
        <RotateCcw size={10} aria-hidden />
        return to live
      </button>
    </div>
  );
}
