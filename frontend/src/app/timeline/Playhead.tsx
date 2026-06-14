// The playhead (re-skinned W02.P12.S28 onto the OKLCH token layer and the
// sanctioned Lucide chrome marks per the timeline surface ADR). The timeline's
// default state is LIVE: now-anchored, docked at the right edge, drawn in the
// accent / live-state token. Dragging the playhead off LIVE puts the product
// into time-travel mode — unmistakably and from one shared truth (ADR
// "Time-travel honesty is enforced and unmistakable"): the mode flips in the
// shared view state (operational verbs disable on it, the stage tint shifts),
// a "viewing {date} — return to live" chip docks on the stage, and the playhead
// itself changes character to the stale / non-live token. Returning docks back.
//
// Keyboard contract (ADR "Keyboard contract, a11y"): the playhead is an ARIA
// slider. Bracket keys [ / ] step the playhead one bucket at a time, arrow keys
// nudge, Home returns to LIVE; every keyboard-initiated step is INSTANT (it
// never animates, per the base motion law) — the mutation writes the shared
// state directly with no per-frame tween. The slider exposes aria-valuetext in
// human time (LIVE or the ISO instant) and the time-travel mode is conveyed
// non-visually through a live status region, so the enforced mode is honest to
// assistive tech too, not only to the eye.
//
// Layer ownership (dashboard-layer-ownership / timeline ADR): app-chrome. It
// reads the degradation state and (through movePlayhead) writes the shared
// timeline mode; it fetches nothing and never reads the raw `tiers` block. The
// RECONNECTING state arrives pre-derived from the stores degradation layer.

import { Play, RotateCcw } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useViewStore } from "../../stores/view/viewStore";
import { useSurfaceStates } from "../degradation/useDegradation";
import { humanInstant, type TimeWindow } from "./Timeline";
import { timeToX, useTimelineStore, xToTime } from "./Timeline";

/** Pixels from the right edge within which a drag snaps back to LIVE. */
export const LIVE_SNAP_PX = 10;

/** One keyboard step nudges the playhead this fraction of the window span. */
export const KEY_STEP_FRACTION = 1 / 24;
export const KEY_NUDGE_FRACTION = 1 / 96;

/** Resolve a drag x to a playhead position: clamped time or LIVE snap. */
export function dragToPlayhead(
  x: number,
  window: TimeWindow,
  width: number,
  now: number,
): number | "live" {
  if (x >= width - LIVE_SNAP_PX) return "live";
  const t = xToTime(Math.max(0, Math.min(width, x)), window, width);
  return Math.min(now, Math.max(window.from, t));
}

/**
 * Resolve a keyboard step/nudge to the next playhead position, clamped to the
 * window and to `now`. Stepping forward past `now` snaps back to LIVE so the
 * keyboard can reach the live dock; stepping from LIVE backward lands at `now`.
 * This is a PURE projection (unit-tested) — the keyboard path applies it
 * instantly, never on an animation frame (the motion law).
 */
export function keyboardStep(
  current: number | "live",
  deltaMs: number,
  window: TimeWindow,
  now: number,
): number | "live" {
  const base = current === "live" ? now : current;
  const next = base + deltaMs;
  if (next >= now) return "live";
  return Math.max(window.from, Math.min(now, next));
}

/** One mutation for both stores: the playhead IS the mode (ADR). */
export function movePlayhead(t: number | "live"): void {
  useTimelineStore.getState().setPlayhead(t);
  useViewStore
    .getState()
    .setTimelineMode(t === "live" ? { kind: "live" } : { kind: "time-travel", at: t });
}

export function Playhead() {
  const window_ = useTimelineStore((s) => s.window);
  const playheadT = useTimelineStore((s) => s.playheadT);
  // The LIVE chip becomes RECONNECTING when the engine stream is lost
  // (degradation matrix §8 — a designed state, not an error).
  const reconnecting = useSurfaceStates().timeline === "reconnecting";
  const hostRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Track the real rail width: the static fallback rendered LIVE mid-rail
  // on wide screens.
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setWidth(rect.width);
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    const toPlayhead = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      return dragToPlayhead(e.clientX - rect.left, window_, rect.width, Date.now());
    };
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-playhead-grip]")) return;
      dragging.current = true;
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (dragging.current) movePlayhead(toPlayhead(e));
    };
    const onUp = () => {
      dragging.current = false;
    };
    host.addEventListener("pointerdown", onDown);
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", onUp);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", onUp);
    };
  }, [window_]);

  const live = playheadT === "live";
  const x = live ? width - 2 : timeToX(playheadT, window_, width);
  const span = window_.to - window_.from;

  // Keyboard scrub (ADR): [ / ] step a bucket, arrows nudge, Home -> LIVE. Every
  // branch applies the pure projection INSTANTLY (no animation frame). The grip
  // is the slider, so it receives these keys when focused.
  const onGripKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const now = Date.now();
    const step = span * KEY_STEP_FRACTION;
    const nudge = span * KEY_NUDGE_FRACTION;
    let next: number | "live";
    switch (e.key) {
      case "[":
      case "ArrowLeft":
        next = keyboardStep(playheadT, e.key === "[" ? -step : -nudge, window_, now);
        break;
      case "]":
      case "ArrowRight":
        next = keyboardStep(playheadT, e.key === "]" ? step : nudge, window_, now);
        break;
      case "Home":
        next = "live";
        break;
      default:
        return;
    }
    e.preventDefault();
    movePlayhead(next);
  };

  // ARIA slider value math: min = window start, max = now (LIVE), now = current.
  const ariaNow = live ? window_.to : playheadT;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      <div
        data-playhead-grip
        role="slider"
        tabIndex={0}
        aria-label="playhead"
        aria-valuemin={Math.round(window_.from)}
        aria-valuemax={Math.round(window_.to)}
        aria-valuenow={Math.round(ariaNow)}
        aria-valuetext={live ? "LIVE" : humanInstant(playheadT)}
        onKeyDown={onGripKeyDown}
        className={`pointer-events-auto absolute top-0 bottom-0 w-[3px] cursor-ew-resize transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
          live ? "bg-state-live" : "bg-state-stale"
        }`}
        style={{ left: `${Math.max(0, Math.min(width - 3, x))}px` }}
      />
      <button
        type="button"
        onClick={() => movePlayhead("live")}
        aria-label={
          reconnecting
            ? "reconnecting to the live stream"
            : live
              ? "live"
              : "return to live"
        }
        className={`pointer-events-auto absolute top-0 right-1 flex items-center gap-vs-1 rounded-vs-sm px-vs-1 py-vs-0-5 text-label font-medium transition-colors duration-ui-fast ease-settle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${
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
export function TimeTravelChip() {
  const mode = useViewStore((s) => s.timelineMode);
  if (mode.kind !== "time-travel") return null;
  return (
    <div className="pointer-events-auto absolute bottom-2 right-2 z-10 flex items-center gap-vs-1 rounded-full border border-state-stale/40 bg-paper-raised/95 px-vs-3 py-vs-1 text-label text-state-stale shadow-card">
      <Play size={11} aria-hidden className="rotate-180" />
      <span>
        viewing <time data-tabular>{humanInstant(mode.at)}</time>
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-vs-1 rounded-vs-sm px-vs-1 underline transition-colors duration-ui-fast ease-settle hover:text-state-live focus-visible:no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        onClick={() => movePlayhead("live")}
      >
        <RotateCcw size={10} aria-hidden />
        return to live
      </button>
    </div>
  );
}
