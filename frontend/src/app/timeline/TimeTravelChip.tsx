// The time-travel mode chip — docked on the STAGE while time travelling (NOT a
// timeline element). It is the unmistakable "viewing {date} — return to live" cue the
// time-travel honesty model renders off the ONE shared `timeline_mode`
// (degradation-is-read-from-tiers… sibling: time-travel is read from the shared mode,
// never guessed). It was extracted from the retired timeline `Playhead` (Issue #14
// tore down the timeline playhead, but time-travel — the graph asof scrub driven by
// `useTimeTravel` — is preserved). `return to live` writes the shared mode back to
// LIVE through `movePlayhead` (the canonical timeline_mode writer).
//
// Layer ownership (dashboard-layer-ownership): app-chrome. It reads the shared
// timeline mode through a stores selector and writes it through the mutation seam; it
// fetches nothing and reads no raw `tiers` block.

import { Play, RotateCcw } from "lucide-react";

import { useDashboardTimelineModeView } from "../../stores/server/queries";
import { normalizeTimelineScope } from "../../stores/view/timeline";
import { movePlayhead } from "../../stores/view/timelineIntent";
import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";

/** Human-time label for an instant (date + minute), tabular-rendered. */
function humanInstant(ts: string | number): string {
  return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
}

export function TimeTravelChip({ scope }: { scope: unknown }) {
  const resolveMessage = useLocalizedMessageResolver();
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
        {
          resolveMessage({
            key: "timeline:summaries.viewingAt",
            values: { date: humanInstant(timeline.asOf) },
          }).message
        }
      </span>
      <button
        type="button"
        className="inline-flex items-center gap-fg-1 rounded-fg-xs px-fg-1 underline transition-colors duration-ui-fast ease-settle hover:text-state-live focus-visible:no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
        onClick={() => {
          movePlayhead("live", scope);
        }}
      >
        <RotateCcw size={10} aria-hidden />
        {resolveMessage({ key: "timeline:actions.returnToLive" }).message}
      </button>
    </div>
  );
}
