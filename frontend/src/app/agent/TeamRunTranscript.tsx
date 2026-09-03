// The live TEAM-run transcript: the docked panel's
// rendering of an a2a team run's RELAYED progress — reasoning, tool calls, and each
// agent's final text — as a continuous scroll of collapsed-by-default, animated
// disclosure sections, the modern agent-UX pattern. It replaces the served-status
// fallback while the relay is live, and degrades TO that fallback honestly when the
// stream gaps, degrades, or is lost (frames are non-authoritative by contract:
// truth is recovered from `run-status`, never reconstructed from a relay frame).
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view. The active
// team `runId`/prompt come from the shared `agentPanel` view store (the Composer
// starts/cancels the run); the frames come from the `stores/server/agent` relay
// read (`useRunProgress`). It fetches nothing itself and derives the view in a
// `useMemo` off the raw frames (frontend-store-selectors), through the pure
// `assembleTeamRun` reducer that the render tests drive directly.

import { useMemo, useState } from "react";
import { Wrench } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import { createCountMessageDescriptor } from "../../platform/localization/message";
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useAgentTeamRunId, useAgentTeamRunPrompt } from "../../stores/view/agentPanel";
import { FoldSection, SectionLabel, Spinner } from "../kit";
import {
  assembleTeamRun,
  groupTeamEntries,
  type TeamRunView,
  type TeamThinkingEntry,
  type TeamToolEntry,
  type TeamWorkStretchGroup,
} from "./teamRun";
import { useTeamRunProgress } from "./TeamRunProgressContext";
import { AgentMessageBlock, AgentTag, UserTurnBubble } from "./transcriptKit";
import { ClarificationCard, ClarificationRecap } from "./ClarificationCard";
import { normalizePendingClarification } from "./clarification";
import { useRunClarificationRecaps } from "../../stores/view/clarificationRecaps";

const MSG = {
  thinking: "common:agent.transcript.team.thinking",
  thinkingLive: "common:agent.transcript.team.thinkingLive",
  working: "common:agent.transcript.team.working",
  workingAgents: "common:agent.transcript.team.workingAgents",
  callingTool: "common:agent.transcript.team.callingTool",
  result: "common:agent.transcript.team.result",
  degraded: "common:agent.transcript.team.degraded",
  error: "common:agent.transcript.team.error",
  usedTools: "common:agent.transcript.usedTools",
  timeline: "common:agent.transcript.timeline",
} as const;

/** Terminal a2a tool statuses → the `status/*` dot tone (bound tokens, no raw hex).
 *  A live/pending call shows no dot — the pulsing header carries its liveness. */
const TOOL_DOT: Readonly<Record<string, string>> = {
  completed: "bg-state-complete",
  failed: "bg-state-broken",
};

/** The reasoning row inside a work stretch (C3 — no lane of its own): a
 *  collapsed row whose label pulses while the stream is live, expanding to the
 *  streamed narration. Muted below the body tier — narration is process, not
 *  answer. */
function TeamThinkingSection({ entry }: { entry: TeamThinkingEntry }) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  if (entry.text.length === 0) return null;
  const label = resolveMessage({
    key: entry.live ? MSG.thinkingLive : MSG.thinking,
  }).message;
  return (
    <FoldSection
      open={open}
      onToggle={() => setOpen((v) => !v)}
      leading={<AgentTag agentId={entry.agentId} />}
      label={
        <span
          className={`truncate text-meta text-ink-faint ${
            entry.live ? "motion-safe:animate-pulse-live" : ""
          }`}
        >
          {label}
        </span>
      }
      data-team-thinking={entry.agentId || undefined}
      data-live={entry.live ? "" : undefined}
      bodyClassName="px-fg-3 py-fg-1"
    >
      <p className="whitespace-pre-wrap text-meta text-ink-faint">{entry.text}</p>
    </FoldSection>
  );
}

/** The collapsed-by-default tool-call row: kind glyph + "Calling {tool}" + a
 *  trailing status dot once settled, expanding to the bounded args/result. */
function TeamToolSection({ entry }: { entry: TeamToolEntry }) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const label = resolveMessage({
    key: MSG.callingTool,
    values: { tool: authoredDisplayText(entry.title) },
  }).message;
  const dot = TOOL_DOT[entry.status];
  return (
    <FoldSection
      open={open}
      onToggle={() => setOpen((v) => !v)}
      leading={<Wrench size={12} aria-hidden className="shrink-0 text-ink-faint" />}
      label={
        <span
          className={`truncate text-body text-ink ${
            entry.live ? "motion-safe:animate-pulse-live" : ""
          }`}
        >
          {label}
        </span>
      }
      trailing={
        <span
          className="flex shrink-0 items-center gap-fg-1"
          data-tool-status={entry.status}
        >
          <AgentTag agentId={entry.agentId} />
          {dot !== undefined && (
            <span aria-hidden className={`size-fg-2 shrink-0 rounded-full ${dot}`} />
          )}
        </span>
      }
      data-team-tool={entry.toolCallId}
      data-live={entry.live ? "" : undefined}
      bodyClassName="flex flex-col gap-fg-1 px-fg-3 py-fg-1"
    >
      {entry.args !== null && (
        <pre className="overflow-x-auto rounded-fg-sm bg-paper-sunken p-fg-2 text-meta text-ink-muted">
          {entry.args}
        </pre>
      )}
      {entry.result !== null && (
        <div>
          <SectionLabel>{resolveMessage({ key: MSG.result }).message}</SectionLabel>
          <pre className="overflow-x-auto rounded-fg-sm bg-paper-sunken p-fg-2 text-meta text-ink-muted">
            {entry.result}
          </pre>
        </div>
      )}
    </FoldSection>
  );
}

/** ONE disclosure per work stretch (C2/C3): the collapsed row names the grouped
 *  work ("Used N tools", or the thinking label for a reasoning-only stretch) and
 *  pulses while live; expanding reveals the flat timeline of reasoning and tool
 *  rows in recorded order — one level deep, with only each tool row's own
 *  args/result expansion beneath it. */
function TeamWorkStretchSection({ group }: { group: TeamWorkStretchGroup }) {
  const resolveMessage = useLocalizedMessageResolver();
  const [open, setOpen] = useState(false);
  const countDescriptor = createCountMessageDescriptor(MSG.usedTools, group.toolCount);
  const label = group.live
    ? resolveMessage({ key: MSG.working }).message
    : group.toolCount > 0 && countDescriptor !== null
      ? resolveMessage(countDescriptor).message
      : resolveMessage({ key: MSG.thinking }).message;
  const timelineLabel = resolveMessage({ key: MSG.timeline });
  return (
    <FoldSection
      open={open}
      onToggle={() => setOpen((v) => !v)}
      leading={<Wrench size={12} aria-hidden className="shrink-0 text-ink-faint" />}
      label={
        <span
          className={`truncate text-meta text-ink-faint ${
            group.live ? "motion-safe:animate-pulse-live" : ""
          }`}
        >
          {label}
        </span>
      }
      data-team-stretch={group.key}
      data-live={group.live ? "" : undefined}
      bodyClassName="px-fg-1 py-fg-1"
    >
      <div
        className="flex flex-col gap-fg-1"
        aria-label={timelineLabel.usedFallback ? undefined : timelineLabel.message}
        data-team-stretch-timeline
      >
        {group.entries.map((entry) =>
          entry.kind === "thinking" ? (
            <TeamThinkingSection key={entry.key} entry={entry} />
          ) : (
            <TeamToolSection key={entry.key} entry={entry} />
          ),
        )}
      </div>
    </FoldSection>
  );
}

/** The live active-agent indicator: a pulsing spinner + "Working…" while one or
 *  more agents are producing and the run has emitted no richer activity yet (the
 *  mock team's only signal), or alongside it. Hidden once the run is terminal. */
function ActiveAgentsIndicator({ view }: { view: TeamRunView }) {
  const resolveMessage = useLocalizedMessageResolver();
  if (view.terminal || view.activeAgents.length === 0) return null;
  const names = view.activeAgents.map((id) => authoredDisplayText(id)).join(", ");
  const spinnerLabel = resolveMessage({ key: MSG.working }).message;
  const label =
    names.length > 0
      ? resolveMessage({ key: MSG.workingAgents, values: { agents: names } }).message
      : spinnerLabel;
  return (
    <p
      className="flex items-center gap-fg-1-5 px-fg-2 text-meta text-ink-muted motion-safe:animate-pulse-live"
      data-team-active-agents
    >
      <Spinner size="sm" label={spinnerLabel} />
      <span className="min-w-0 truncate">{label}</span>
    </p>
  );
}

/**
 * The live team-run transcript. Mounts under the panel's transcript scroll when a
 * team run is active; renders nothing when none is. Consumes the shared run id +
 * the relay progress read, derives the reconciled view in `useMemo`, and renders
 * the continuous scroll of collapsible sections with the honest degraded fallback.
 */
export function TeamRunTranscript() {
  const resolveMessage = useLocalizedMessageResolver();
  const runId = useAgentTeamRunId();
  const prompt = useAgentTeamRunPrompt();
  const progress = useTeamRunProgress();
  const frames = progress.frames;
  // The AUTHORITATIVE questionnaire: read from the run-status disclosure, never
  // from the relay frame that merely nudged the re-read.
  const pendingClarification = useMemo(
    () => normalizePendingClarification(progress.status?.pending_clarification),
    [progress.status],
  );
  // Answered clarifications (C8). Held OUTSIDE the card because answering clears the
  // disclosure the card is mounted on — see `stores/view/clarificationRecaps`. They
  // render here, in answer order, so a decision made mid-run stays visible in the
  // transcript after the run resumes past it.
  const recaps = useRunClarificationRecaps(runId);
  const view = useMemo(
    () => assembleTeamRun(frames, progress.terminal),
    [frames, progress.terminal],
  );
  // C2/C3: consecutive thinking/tool activity folds into ONE disclosure per work
  // stretch; each agent answer stands alone between stretches.
  const blocks = useMemo(() => groupTeamEntries(view.entries), [view.entries]);

  if (runId === null) return null;

  return (
    <section className="flex flex-col gap-fg-3" data-team-run={runId}>
      {/* C1 via the ONE kit: the user turn is the same right-aligned accent
          bubble the single-agent transcript renders — one speaker cue. */}
      {prompt !== null && prompt.length > 0 && (
        <div data-team-prompt>
          <UserTurnBubble text={prompt} />
        </div>
      )}
      <div className="flex flex-col gap-fg-2" data-team-entries>
        {blocks.map((block) =>
          block.kind === "stretch" ? (
            <TeamWorkStretchSection key={block.key} group={block} />
          ) : (
            <AgentMessageBlock
              key={block.key}
              {...(block.agentId.length === 0 ? {} : { agentId: block.agentId })}
              text={block.text}
              data={{
                attribute: "data-team-message",
                ...(block.agentId.length === 0 ? {} : { value: block.agentId }),
              }}
            />
          ),
        )}
      </div>
      {/* C8: decisions already made, in the order they were made. These survive the
          success refetch that unmounts the card — that is the whole point of holding
          them outside it. */}
      {recaps.length > 0 && (
        <div className="flex flex-col gap-fg-2" data-clarification-recaps>
          {recaps.map((record) => (
            <ClarificationRecap key={record.requestId} entries={record.entries} />
          ))}
        </div>
      )}
      {/* D5: the questionnaire renders AT THE PARK POINT — the end of the activity
          so far, which is exactly where the run stopped and waited. It is the sole
          answer surface while parked; the composer disables itself with a hint. */}
      {pendingClarification !== null && runId !== null && (
        <ClarificationCard runId={runId} pending={pendingClarification} />
      )}
      <ActiveAgentsIndicator view={view} />
      {/* Honest degraded path: the relay gapped/degraded/was lost, so live
          activity is paused and `run-status` polling is authoritative — never a
          faked token stream. */}
      {progress.degraded && !view.terminal && (
        <p className="px-fg-2 text-meta text-ink-faint" data-team-degraded>
          {resolveMessage({ key: MSG.degraded }).message}
        </p>
      )}
      {view.error !== null && (
        <p
          className="flex items-center gap-fg-1-5 px-fg-2 text-meta text-state-broken"
          data-team-error
        >
          <span
            aria-hidden
            className="size-fg-2 shrink-0 rounded-full bg-state-broken"
          />
          {view.error || resolveMessage({ key: MSG.error }).message}
        </p>
      )}
    </section>
  );
}
