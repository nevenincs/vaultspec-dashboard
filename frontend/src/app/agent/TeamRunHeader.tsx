// The docked RUN HEADER region (research C5; agent-panel-shell-integration D4d).
// Live run metadata — phase and the agent roster — pins beside the conversation
// instead of being interleaved into it. Both reference products dock this state
// (Claude's progress checklist, ChatGPT's Environment/Subagents/Sources); neither
// scrolls it away inside the message flow, and neither do we.
//
// It is collapsible and collapsed-by-default-once-terminal, because a settled run's
// metadata is reference material, not something to keep occupying the panel.
//
// WHAT THIS DOES NOT SHOW, and why: the plan names "roster with per-role model,
// sources, elapsed". No served surface carries any of the three. `TeamRunStatus`
// carries `semantic_phase`, `status`, and id lists; the relay's `team_status` frames
// carry `{agent_id, state}` and nothing more. Elapsed would have to be measured from
// when THIS panel started watching, which is not the run's elapsed time and would
// read as a lie on a reloaded panel. So the header renders the phase and the roster
// it actually has, and the three unserved fields are recorded as a wire gap rather
// than fabricated here.
//
// Layer ownership: dumb app chrome over the run-progress context. No fetch.

import { useEffect, useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { FoldSection, SectionLabel } from "../kit";
import type { TeamRosterMember } from "./teamRun";
import { useTeamRunProgress } from "./TeamRunProgressContext";

const MSG = {
  region: "common:agent.runHeader.region",
  phase: "common:agent.runHeader.phase",
  roster: "common:agent.runHeader.roster",
  degraded: "common:agent.transcript.team.degraded",
} as const;

function RosterRow({ member }: { member: TeamRosterMember }) {
  return (
    <li className="flex min-w-0 items-center justify-between gap-fg-2">
      <span className="min-w-0 truncate text-meta text-ink">
        {authoredDisplayText(member.agentId)}
      </span>
      {/* The state token passes through verbatim — served vocabulary, never
          re-classified into a word of our own. */}
      <span className="shrink-0 text-caption text-ink-faint" data-roster-state>
        {authoredDisplayText(member.state)}
      </span>
    </li>
  );
}

/**
 * The run header. Renders nothing when there is no run metadata to dock — an empty
 * header band would be chrome claiming a run that is not there.
 */
export function TeamRunHeader({ roster }: { roster: readonly TeamRosterMember[] }) {
  const resolveMessage = useLocalizedMessageResolver();
  const progress = useTeamRunProgress();
  const terminal = progress.terminal;
  const [open, setOpen] = useState(true);

  // Collapse when the run settles: a finished run's metadata is reference, and the
  // transcript should get the room back.
  useEffect(() => {
    if (terminal) setOpen(false);
  }, [terminal]);

  // The SERVED phase, verbatim — `semantic_phase` when the sibling names one, else
  // the bounded run status. Never client-classified.
  const phase = progress.status?.semantic_phase ?? progress.status?.status ?? null;
  if (phase === null && roster.length === 0) return null;

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
          progress.degraded ? (
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
