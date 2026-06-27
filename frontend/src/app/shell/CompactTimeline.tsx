// Compact timeline minimode (mobile-responsive-layout ADR D2t; binding Figma
// `Timeline minimode` frame 792:3322). On compact the timeline drops its lane/event
// visualization and presents a DATE-RANGE selector: a start + end handle over the
// corpus span. It writes the canonical `date_range` (the timeline is the SOLE
// date-range writer — filtering-has-one-canonical-surface), so narrowing the range
// narrows the rail/graph in lock-step.
//
// Layer law (dashboard-layer-ownership): dumb chrome — reads the served corpus span
// (vocabulary view) + the canonical date_range, writes through the dashboard-state
// mutation seam; it fetches nothing itself and reads no raw `tiers`. Sizing is
// rem/token, colours are theme tokens (no hardcoded px, no black).

import { useRef } from "react";

import {
  useDashboardDateRangeView,
  useFiltersVocabularyView,
} from "../../stores/server/queries";
import { useDashboardStateMutations } from "../../stores/server/dashboardState";

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
function parseISO(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** "16 Jun 2026" compact date readout. */
function dateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The UTC day (yyyy-mm-dd) for a date_range tick. */
function dayISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Up to six month-start ticks across the corpus span. */
function monthTicks(minMs: number, maxMs: number): string[] {
  if (maxMs <= minMs) return [];
  const out: string[] = [];
  const cur = new Date(minMs);
  cur.setUTCDate(1);
  while (cur.getTime() <= maxMs && out.length < 6) {
    if (cur.getTime() >= minMs) out.push(SHORT_MONTHS[cur.getUTCMonth()]!);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

export function CompactTimeline({ scope }: { scope: unknown }) {
  const vocabulary = useFiltersVocabularyView(scope);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeHandle = useRef<"from" | "to" | null>(null);

  const minMs = parseISO(vocabulary.dateBounds?.from);
  const maxMs = parseISO(vocabulary.dateBounds?.to);
  const hasSpan = minMs !== null && maxMs !== null && maxMs > minMs;

  const range = useDashboardDateRangeView(scope, {
    fromMs: minMs ?? 0,
    toMs: maxMs ?? 0,
  });
  const mutations = useDashboardStateMutations(scope);

  const lo = minMs ?? 0;
  const hi = maxMs ?? 0;
  const clampMs = (ms: number) => Math.min(hi, Math.max(lo, ms));
  const fromMs = clampMs(range.fromMs);
  const toMs = clampMs(range.toMs);
  const ratio = (ms: number) => (hasSpan ? (ms - lo) / (hi - lo) : 0);
  const ticks = hasSpan ? monthTicks(lo, hi) : [];
  const isNarrowed = range.source === "dashboard" && (fromMs > lo || toMs < hi);

  const msAtClientX = (clientX: number): number | null => {
    const el = trackRef.current;
    if (!el || !hasSpan) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return lo + r * (hi - lo);
  };
  const moveHandle = (which: "from" | "to", clientX: number) => {
    const ms = msAtClientX(clientX);
    if (ms === null) return;
    if (which === "from") {
      void mutations.setDateRange({
        from: dayISO(Math.min(ms, toMs)),
        to: dayISO(toMs),
      });
    } else {
      void mutations.setDateRange({
        from: dayISO(fromMs),
        to: dayISO(Math.max(ms, fromMs)),
      });
    }
  };

  const handleProps = (which: "from" | "to") => ({
    role: "slider" as const,
    "aria-label": which === "from" ? "Range start" : "Range end",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.round(ratio(which === "from" ? fromMs : toMs) * 100),
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      activeHandle.current = which;
      moveHandle(which, e.clientX);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (activeHandle.current === which && e.buttons === 1)
        moveHandle(which, e.clientX);
    },
    onPointerUp: () => {
      activeHandle.current = null;
    },
  });

  return (
    <div className="flex h-full flex-col gap-fg-2 px-fg-5 pt-fg-6">
      <span className="text-caption font-medium uppercase tracking-wide text-ink-faint">
        Date range
      </span>
      <h2 className="text-display text-ink">
        {hasSpan ? `${dateLabel(fromMs)} – ${dateLabel(toMs)}` : "—"}
      </h2>
      <p className="text-meta text-ink-muted">
        Drag the handles to narrow the corpus to a date range
      </p>

      {/* Range track: a ≥44pt drag band with a slim track, an accent fill between the
          handles, and two draggable handles (theme tokens only — no black). */}
      <div className="mt-fg-6 flex h-11 items-center">
        <div
          ref={trackRef}
          className="relative h-1.5 w-full rounded-fg-pill bg-paper-sunken"
        >
          <div
            className="absolute inset-y-0 rounded-fg-pill bg-accent"
            style={{
              left: `${ratio(fromMs) * 100}%`,
              width: `${Math.max(0, (ratio(toMs) - ratio(fromMs)) * 100)}%`,
            }}
          />
          <span
            {...handleProps("from")}
            className="absolute top-1/2 size-[1.375rem] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-fg-pill border-2 border-paper bg-accent shadow-fg-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            style={{ left: `${ratio(fromMs) * 100}%` }}
          />
          <span
            {...handleProps("to")}
            className="absolute top-1/2 size-[1.375rem] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-fg-pill border-2 border-paper bg-accent shadow-fg-raised outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            style={{ left: `${ratio(toMs) * 100}%` }}
          />
        </div>
      </div>

      {ticks.length > 0 && (
        <div className="flex justify-between pt-fg-1">
          {ticks.map((m, i) => (
            <span key={`${m}-${i}`} className="text-caption text-ink-faint">
              {m}
            </span>
          ))}
        </div>
      )}

      {isNarrowed && (
        <button
          type="button"
          onClick={() => void mutations.setDateRange({})}
          className="mt-fg-4 self-start rounded-fg-md px-fg-2 py-fg-1 text-body font-medium text-accent-text transition-colors duration-ui-fast hover:bg-paper-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        >
          Clear range
        </button>
      )}
    </div>
  );
}
