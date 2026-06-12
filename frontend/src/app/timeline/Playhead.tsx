// The playhead (W02.P08.S33, ADR G4.b). The timeline's default state is
// LIVE: now-anchored, docked at the right edge. Dragging the playhead off
// LIVE puts the product into time-travel mode — unmistakably: the mode
// flips in the shared view state (operational verbs disable on it, S41),
// a "viewing {date} — return to live" chip docks on the stage, and the
// playhead itself changes character. Returning docks back and the mode
// exits.

import { useEffect, useRef } from "react";

import { useViewStore } from "../../stores/view/viewStore";
import { useSurfaceStates } from "../degradation/useDegradation";
import type { TimeWindow } from "./Timeline";
import { timeToX, useTimelineStore, xToTime } from "./Timeline";

/** Pixels from the right edge within which a drag snaps back to LIVE. */
export const LIVE_SNAP_PX = 10;

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

/** One mutation for both stores: the playhead IS the mode (G4.b). */
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

  const width = hostRef.current?.parentElement?.clientWidth ?? 800;
  const live = playheadT === "live";
  const x = live ? width - 2 : timeToX(playheadT, window_, width);

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      <div
        data-playhead-grip
        role="slider"
        aria-label="playhead"
        aria-valuetext={live ? "LIVE" : new Date(playheadT).toISOString()}
        className={`pointer-events-auto absolute top-0 bottom-0 w-[3px] cursor-ew-resize ${
          live ? "bg-emerald-600" : "bg-amber-600"
        }`}
        style={{ left: `${Math.max(0, Math.min(width - 3, x))}px` }}
      />
      <button
        type="button"
        onClick={() => movePlayhead("live")}
        className={`pointer-events-auto absolute top-0 right-1 rounded px-1 text-[10px] font-medium ${
          reconnecting
            ? "text-amber-700"
            : live
              ? "text-emerald-700"
              : "text-amber-700 underline"
        }`}
      >
        {reconnecting ? "↻ RECONNECTING" : live ? "▶ LIVE" : "⏪ return to live"}
      </button>
    </div>
  );
}

/** The unmistakable mode chip — docked on the stage while time travelling. */
export function TimeTravelChip() {
  const mode = useViewStore((s) => s.timelineMode);
  if (mode.kind !== "time-travel") return null;
  return (
    <div className="pointer-events-auto absolute bottom-2 right-2 z-10 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1 text-[11px] text-amber-900 shadow-md">
      viewing {new Date(mode.at).toISOString().slice(0, 16).replace("T", " ")} —{" "}
      <button type="button" className="underline" onClick={() => movePlayhead("live")}>
        return to live
      </button>
    </div>
  );
}
