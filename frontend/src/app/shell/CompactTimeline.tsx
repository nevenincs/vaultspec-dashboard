// Compact timeline minimode (mobile-responsive-layout ADR D2t; binding Figma
// `Timeline minimode` frame 792:3322). On compact the timeline drops its lane/event
// visualization entirely and presents ONLY the draggable scrubber: a VIEWING date
// readout, a drag-to-scrub track, and month ticks. It writes the same shared
// playhead the desktop timeline uses (`setTimelinePlayhead`), so time-travel stays
// one seam.
//
// Layer law (dashboard-layer-ownership): dumb chrome — reads the playhead view-state
// and the served corpus span (via the vocabulary view); it fetches nothing itself
// and reads no raw `tiers`. Sizing is rem/token (no hardcoded px).

import { useRef } from "react";

import {
  useFiltersVocabularyView,
  useTimelineLineageView,
} from "../../stores/server/queries";
import { setTimelinePlayhead, useTimelinePlayhead } from "../../stores/view/timeline";

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

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The "16 June 2026" date readout for a playhead instant. */
function dateLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${FULL_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Up to three evenly-read month-start ticks across the corpus span. */
function monthTicks(minMs: number, maxMs: number): string[] {
  if (maxMs <= minMs) return [];
  const out: string[] = [];
  const start = new Date(minMs);
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur.getTime() <= maxMs && out.length < 6) {
    if (cur.getTime() >= minMs) out.push(SHORT_MONTHS[cur.getUTCMonth()]!);
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

export function CompactTimeline({ scope }: { scope: unknown }) {
  const vocabulary = useFiltersVocabularyView(scope);
  const lineage = useTimelineLineageView(scope);
  const playhead = useTimelinePlayhead();
  const trackRef = useRef<HTMLDivElement>(null);

  const minMs = parseISO(vocabulary.dateBounds?.from);
  const maxMs = parseISO(vocabulary.dateBounds?.to);
  const hasSpan = minMs !== null && maxMs !== null && maxMs > minMs;

  // Resolve the playhead to a concrete instant: "live" docks at the corpus end.
  const playMs =
    playhead === "live"
      ? (maxMs ?? Date.now())
      : typeof playhead === "number"
        ? playhead
        : (maxMs ?? Date.now());
  const ratio = hasSpan
    ? Math.min(1, Math.max(0, (playMs - minMs!) / (maxMs! - minMs!)))
    : 1;
  const ticks = hasSpan ? monthTicks(minMs!, maxMs!) : [];

  // Real count of documents whose mark date is the scrubbed day (UTC), from the
  // same lineage projection the desktop timeline reads — never a fabricated number.
  const playDay = new Date(playMs).toISOString().slice(0, 10);
  const dayCount = lineage.nodes.filter(
    (node) => node.dates.created?.slice(0, 10) === playDay,
  ).length;

  const scrubTo = (clientX: number) => {
    const el = trackRef.current;
    if (!el || !hasSpan) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const r = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setTimelinePlayhead(minMs! + r * (maxMs! - minMs!));
  };

  return (
    <div className="flex h-full flex-col gap-fg-2 px-fg-5 pt-fg-6">
      <span className="text-caption font-medium uppercase tracking-wide text-ink-faint">
        Viewing
      </span>
      <h2 className="text-display text-ink">{hasSpan ? dateLabel(playMs) : "—"}</h2>
      <p className="text-meta text-ink-muted">Drag to scrub the corpus through time</p>

      {/* Scrubber: a ≥44pt drag hit area around a slim track + filled portion + knob. */}
      <div
        role="slider"
        aria-label="Timeline scrubber"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        tabIndex={0}
        className="mt-fg-6 flex h-11 cursor-pointer items-center outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          scrubTo(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) scrubTo(e.clientX);
        }}
      >
        <div
          ref={trackRef}
          className="relative h-1.5 w-full rounded-fg-pill bg-paper-sunken"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-fg-pill bg-accent"
            style={{ width: `${ratio * 100}%` }}
          />
          <span
            className="absolute top-1/2 size-[1.375rem] -translate-x-1/2 -translate-y-1/2 rounded-fg-pill border-2 border-paper bg-accent shadow-fg-raised"
            style={{ left: `${ratio * 100}%` }}
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

      {/* Documents-on-this-day readout (binding frame): a quiet count card under the
          scrubber, sourced from the live lineage nodes for the scrubbed day. */}
      {hasSpan && (
        <div className="mt-fg-4 flex items-center justify-between rounded-fg-md bg-paper-sunken px-fg-3 py-fg-3">
          <span className="text-body text-ink">
            {dayCount} {dayCount === 1 ? "document" : "documents"} on this day
          </span>
        </div>
      )}
    </div>
  );
}
