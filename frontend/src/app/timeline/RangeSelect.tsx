// Range selection (W02.P08.S35, ADR G4.c): drag across the timeline
// (shift-drag, keeping the plain drag for the playhead) to set the
// product's SINGLE date-range filter — owned by the timeline, shown in the
// filter bar as a chip. "Play" animates the playhead across the range to
// watch the network grow: the cheapest, most legible "history of this
// feature" story in the product.

import { useEffect, useRef, useState } from "react";

import { useFilterStore } from "../../stores/view/filters";
import { movePlayhead } from "./Playhead";
import type { TimeWindow } from "./Timeline";
import { timeToX, useTimelineStore, xToTime } from "./Timeline";

// --- pure helpers (unit-tested) -------------------------------------------------

/** Resolve a drag span to an ordered time range. */
export function rangeFromDrag(
  x1: number,
  x2: number,
  window: TimeWindow,
  width: number,
): { from: number; to: number } {
  const a = xToTime(Math.max(0, Math.min(width, x1)), window, width);
  const b = xToTime(Math.max(0, Math.min(width, x2)), window, width);
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

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
}

let playState: PlayState | null = null;

export function startRangePlay(from: number, to: number, now: number): void {
  playState = { from, to, startedAt: now };
}

export function stopRangePlay(): void {
  playState = null;
}

/** Drives the playhead across an active range play on animation frames. */
export function useRangePlayer(): void {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (playState) {
        const elapsed = performance.now() - playState.startedAt;
        movePlayhead(playPosition(playState.from, playState.to, elapsed));
        if (elapsed >= PLAY_DURATION_MS) playState = null;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

// --- the overlay ---------------------------------------------------------------------

export function RangeSelect() {
  const window_ = useTimelineStore((s) => s.window);
  const dateRange = useFilterStore((s) => s.dateRange);
  const setDateRange = useFilterStore((s) => s.setDateRange);
  const hostRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x1: number; x2: number } | null>(null);
  useRangePlayer();

  useEffect(() => {
    const host = hostRef.current?.parentElement;
    if (!host) return;
    let active = false;
    let startX = 0;
    const localX = (e: PointerEvent) => e.clientX - host.getBoundingClientRect().left;
    const onDown = (e: PointerEvent) => {
      if (!e.shiftKey) return;
      active = true;
      startX = localX(e);
      setDrag({ x1: startX, x2: startX });
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (active) setDrag({ x1: startX, x2: localX(e) });
    };
    const onUp = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      const width = host.getBoundingClientRect().width;
      const range = rangeFromDrag(startX, localX(e), window_, width);
      setDrag(null);
      setDateRange({
        from: new Date(range.from).toISOString(),
        to: new Date(range.to).toISOString(),
      });
    };
    host.addEventListener("pointerdown", onDown);
    globalThis.addEventListener("pointermove", onMove);
    globalThis.addEventListener("pointerup", onUp);
    return () => {
      host.removeEventListener("pointerdown", onDown);
      globalThis.removeEventListener("pointermove", onMove);
      globalThis.removeEventListener("pointerup", onUp);
    };
  }, [window_, setDateRange]);

  const width = hostRef.current?.parentElement?.clientWidth ?? 800;
  const committed =
    dateRange.from && dateRange.to
      ? {
          x1: timeToX(Date.parse(dateRange.from), window_, width),
          x2: timeToX(Date.parse(dateRange.to), window_, width),
        }
      : null;
  const band = drag ?? committed;

  return (
    <div ref={hostRef} className="pointer-events-none absolute inset-0">
      {band && (
        <div
          className="absolute top-0 bottom-0 bg-sky-500/10 ring-1 ring-sky-400/40"
          style={{
            left: `${Math.min(band.x1, band.x2)}px`,
            width: `${Math.abs(band.x2 - band.x1)}px`,
          }}
        />
      )}
      {committed && !drag && (
        <div
          className="pointer-events-auto absolute top-0 flex gap-1 text-[10px]"
          style={{ left: `${Math.min(committed.x1, committed.x2)}px` }}
        >
          <button
            type="button"
            className="rounded bg-sky-100 px-1 text-sky-900"
            onClick={() =>
              startRangePlay(
                Date.parse(dateRange.from!),
                Date.parse(dateRange.to!),
                performance.now(),
              )
            }
          >
            ▶ play
          </button>
          <button
            type="button"
            aria-label="Clear date range"
            className="rounded bg-stone-100 px-1 text-stone-600"
            onClick={() => {
              stopRangePlay();
              setDateRange({});
              movePlayhead("live");
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
