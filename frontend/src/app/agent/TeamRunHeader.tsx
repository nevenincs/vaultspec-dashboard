// The docked RUN HEADER region (research C5; agent-panel-shell-integration D4d).
// Live run metadata — phase and the agent roster — pins beside the conversation
// instead of being interleaved into it. Both reference products dock this state
// (Claude's progress checklist, ChatGPT's Environment/Subagents/Sources); neither
// scrolls it away inside the message flow, and neither do we.
//
// It is collapsible and collapsed-by-default-once-terminal, because a settled run's
// metadata is reference material, not something to keep occupying the panel.
//
// The roster carries per-role provider/model from the run's FROZEN profile
// (`run-status.assignments`) — what the run is actually using, not what the composer
// has selected since. Elapsed is real when the sibling serves a start time and is
// OMITTED when it does not: measuring from when this panel started watching is not
// the run's elapsed time and would read as a lie on a reloaded panel.
//
// "Sources" remains genuinely unserved by any surface and is therefore absent — a
// named gap, not an oversight.
//
// Layer ownership: dumb app chrome over the run-progress context. No fetch.

import { useEffect, useState } from "react";

import {
  useActiveLocale,
  useLocalizedMessageResolver,
} from "../../platform/localization/LocalizationProvider";
import { formatDuration } from "../../platform/localization/formatters";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { FoldSection, SectionLabel } from "../kit";
import type { TeamRosterMember } from "./teamRun";
import { useTeamRunProgress } from "./TeamRunProgressContext";

const MSG = {
  region: "common:agent.runHeader.region",
  phase: "common:agent.runHeader.phase",
  roster: "common:agent.runHeader.roster",
  elapsed: "common:agent.runHeader.elapsed",
  mixedProvider: "common:agent.runHeader.mixedProvider",
  degraded: "common:agent.transcript.team.degraded",
} as const;

function RosterRow({ member }: { member: TeamRosterMember }) {
  // Per-role provider and model, both served. They are shown TOGETHER on the role's
  // own row precisely because a profile may route different roles to different
  // providers — collapsing them into one label for the run would be a fabrication.
  const binding = [member.providerId, member.model]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join(" · ");
  return (
    <li className="flex min-w-0 items-baseline justify-between gap-fg-2">
      <span className="min-w-0 flex-1 truncate text-meta text-ink">
        {authoredDisplayText(member.agentId)}
      </span>
      {binding.length > 0 && (
        <span
          className="min-w-0 shrink truncate text-caption text-ink-muted"
          data-roster-binding
        >
          {authoredDisplayText(binding)}
        </span>
      )}
      {/* The state token passes through verbatim — served vocabulary, never
          re-classified into a word of our own. */}
      {member.state.length > 0 && (
        <span className="shrink-0 text-caption text-ink-faint" data-roster-state>
          {authoredDisplayText(member.state)}
        </span>
      )}
    </li>
  );
}

/**
 * The run header. Renders nothing when there is no run metadata to dock — an empty
 * header band would be chrome claiming a run that is not there.
 */
export function TeamRunHeader({ roster }: { roster: readonly TeamRosterMember[] }) {
  const resolveMessage = useLocalizedMessageResolver();
  const locale = useActiveLocale();
  const progress = useTeamRunProgress();
  const terminal = progress.terminal;
  const [open, setOpen] = useState(true);
  // A ticking clock only while the run is live, so an in-flight elapsed reading is
  // not frozen at first paint. It stops the moment the run settles.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (terminal) return;
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [terminal]);

  // Collapse when the run settles: a finished run's metadata is reference, and the
  // transcript should get the room back.
  useEffect(() => {
    if (terminal) setOpen(false);
  }, [terminal]);

  // The SERVED phase, verbatim — `semantic_phase` when the sibling names one, else
  // the bounded run status. Never client-classified.
  const phase = progress.status?.semantic_phase ?? progress.status?.status ?? null;
  if (phase === null && roster.length === 0) return null;

  // Elapsed is real or absent. `started_at_ms` is served by the sibling; without it
  // there is no run clock to read, and the header simply says nothing about time.
  const startedAtMs = progress.status?.started_at_ms;
  const elapsed =
    startedAtMs === undefined
      ? null
      : formatDuration(locale, Math.max(0, nowMs - startedAtMs), {
          maxUnits: 2,
          style: "short",
        });

  const region = resolveMessage({ key: MSG.region });
  const phaseLabel = resolveMessage({ key: MSG.phase });
  const rosterLabel = resolveMessage({ key: MSG.roster });
  if (region.usedFallback) return null;

  return (
    <section
      className="shrink-0 border-b border-rule px-fg-2 py-fg-1"
      aria-label={region.message}
      data-agent-run-header
    >
      <FoldSection
        open={open}
        onToggle={() => setOpen((value) => !value)}
        label={
          <span className="truncate text-meta text-ink-muted" data-run-header-phase>
            {phase === null
              ? region.message
              : phaseLabel.usedFallback
                ? authoredDisplayText(phase)
                : resolveMessage({
                    key: MSG.phase,
                    values: { phase: authoredDisplayText(phase) },
                  }).message}
          </span>
        }
        trailing={
          elapsed !== null ? (
            <span
              className="shrink-0 text-caption tabular-nums text-ink-faint"
              data-run-header-elapsed
            >
              {resolveMessage({ key: MSG.elapsed, values: { elapsed } }).message}
            </span>
          ) : progress.degraded ? (
            <span
              className="shrink-0 text-caption text-ink-faint"
              data-run-header-degraded
            >
              {resolveMessage({ key: MSG.degraded }).message}
            </span>
          ) : undefined
        }
        bodyClassName="px-fg-1 py-fg-1"
      >
        {roster.length > 0 && !rosterLabel.usedFallback && (
          <>
            <SectionLabel>{rosterLabel.message}</SectionLabel>
            <ul className="flex flex-col gap-fg-0-5" data-run-header-roster>
              {roster.map((member) => (
                <RosterRow key={member.agentId} member={member} />
              ))}
            </ul>
          </>
        )}
      </FoldSection>
    </section>
  );
}
