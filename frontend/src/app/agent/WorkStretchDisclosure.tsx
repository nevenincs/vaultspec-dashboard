// The one collapsed disclosure per work stretch (research C2/C3;
// agent-panel-shell-integration D4b). Replaces the former per-turn stack of a
// thinking fold PLUS a list of individually-folding tool rows with a single
// elapsed-labelled row that expands to a FLAT icon+label timeline.
//
// One level deep is the load-bearing constraint: the timeline rows are rows, not
// nested disclosures. A tool step's bounded args/result still need somewhere to go,
// so the row keeps its own expansion — but nothing else nests, and the inline
// permission prompt stays inside the timeline where it parks rather than being
// lifted out to a dialog or pushed below the fold.
//
// Layer ownership: dumb app chrome over the pure `workStretch` fold plus the
// existing `ToolCallEntry` / `ThinkingEntry` parts.

import { useEffect, useState } from "react";
import { Sparkles, Wrench } from "lucide-react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { createCountMessageDescriptor } from "../../platform/localization/message";
import { formatDuration } from "../../platform/localization/formatters";
import { FoldSection } from "../kit";
import { ThinkingEntry, ToolCallEntry } from "./ToolCallEntry";
import {
  workStretchAwaitsPermission,
  workStretchIsEmpty,
  type WorkStretch,
} from "./workStretch";

const MSG = {
  workedFor: "common:agent.transcript.workedFor",
  working: "common:agent.transcript.turnStatus.working",
  timeline: "common:agent.transcript.timeline",
} as const;

/**
 * The stretch's collapsed row and its expanded timeline.
 *
 * The label states elapsed time where it can be measured, and falls back to the
 * served tool COUNT where it cannot — never a fabricated "0s". While the turn is
 * still live the row reads as working, because a stretch that has not finished has
 * no final elapsed time to report yet.
 */
export function WorkStretchDisclosure({
  stretch,
  live,
}: {
  stretch: WorkStretch;
  live: boolean;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const awaiting = workStretchAwaitsPermission(stretch);
  const [open, setOpen] = useState(false);

  // A parked permission prompt forces the stretch open and keeps it reachable: a
  // decision the run is BLOCKED on may never sit behind a collapsed row.
  useEffect(() => {
    if (awaiting) setOpen(true);
  }, [awaiting]);

  if (workStretchIsEmpty(stretch)) return null;

  const elapsed =
    stretch.elapsedMs === null
      ? null
      : formatDuration(locale, stretch.elapsedMs, { maxUnits: 2, style: "short" });
  const countDescriptor = createCountMessageDescriptor(
    "common:agent.transcript.usedTools",
    stretch.toolCount,
  );
  const label = live
    ? resolveMessage({ key: MSG.working })
    : elapsed !== null
      ? resolveMessage({ key: MSG.workedFor, values: { elapsed } })
      : countDescriptor !== null
        ? resolveMessage(countDescriptor)
        : null;
  if (label === null || label.usedFallback) return null;

  const timelineLabel = resolveMessage({ key: MSG.timeline });

  return (
    <FoldSection
      open={open || awaiting}
      onToggle={() => setOpen((value) => !value)}
      leading={<Wrench size={12} aria-hidden className="shrink-0 text-ink-faint" />}
      label={<span className="truncate text-meta text-ink-faint">{label.message}</span>}
      data-transcript-work-stretch
      data-stretch-open={open || awaiting ? "" : undefined}
      bodyClassName="px-fg-1 py-fg-1"
    >
      {/* The FLAT timeline: one row per entry, in recorded order, interleaving
          reasoning narration with tool steps (C3 — reasoning has no lane). */}
      <ul
        className="flex flex-col gap-fg-1"
        aria-label={timelineLabel.usedFallback ? undefined : timelineLabel.message}
        data-transcript-timeline
      >
        {stretch.entries.map((entry) => (
          <li key={entry.id} className="flex min-w-0 items-start gap-fg-1-5">
            <span aria-hidden className="mt-fg-1 shrink-0 text-ink-faint">
              {entry.kind === "thinking" ? (
                <Sparkles size={12} />
              ) : (
                <Wrench size={12} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              {entry.kind === "thinking" ? (
                <ThinkingEntry segment={entry.segment} />
              ) : (
                <ToolCallEntry record={entry.record} live={live} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </FoldSection>
  );
}
