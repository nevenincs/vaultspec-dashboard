// The live TEAM-run transcript (a2a-orchestration-edge ADR D3): the docked panel's
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
import { authoredDisplayText } from "../../platform/localization/displayText";
import { useRunProgress } from "../../stores/server/agent/a2aTeam";
import { useAgentTeamRunId, useAgentTeamRunPrompt } from "../../stores/view/agentPanel";
import { FoldSection, SectionLabel, Spinner } from "../kit";
import {
  assembleTeamRun,
  type TeamMessageEntry,
  type TeamRunView,
  type TeamThinkingEntry,
  type TeamToolEntry,
} from "./teamRun";

const MSG = {
  thinking: "common:agent.transcript.team.thinking",
  thinkingLive: "common:agent.transcript.team.thinkingLive",
  working: "common:agent.transcript.team.working",
  workingAgents: "common:agent.transcript.team.workingAgents",
  callingTool: "common:agent.transcript.team.callingTool",
  result: "common:agent.transcript.team.result",
  degraded: "common:agent.transcript.team.degraded",
  error: "common:agent.transcript.team.error",
} as const;

/** Terminal a2a tool statuses → the `status/*` dot tone (bound tokens, no raw hex).
 *  A live/pending call shows no dot — the pulsing header carries its liveness. */
const TOOL_DOT: Readonly<Record<string, string>> = {
  completed: "bg-state-complete",
  failed: "bg-state-broken",
};

/** A small agent-attribution eyebrow (`mock-planner` → "Mock Planner"). Renders
 *  nothing for a team-scoped frame that carries no agent id. */
function AgentTag({ agentId }: { agentId: string }) {
  if (agentId.length === 0) return null;
  return (
    <span className="shrink-0 text-caption tracking-[0.025rem] text-ink-faint">
      {authoredDisplayText(agentId)}
    </span>
  );
}

/** The collapsed-by-default reasoning section. Its header pulses while the stream
 *  is live (motion-safe), the streamed reasoning revealed on expand. */
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
          className={`truncate text-label text-ink ${
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
        <pre className="overflow-x-auto rounded-fg-sm bg-paper-sunken p-fg-2 text-caption text-ink-muted">
          {entry.args}
        </pre>
      )}
      {entry.result !== null && (
        <div>
          <SectionLabel>{resolveMessage({ key: MSG.result }).message}</SectionLabel>
          <pre className="overflow-x-auto rounded-fg-sm bg-paper-sunken p-fg-2 text-caption text-ink-muted">
            {entry.result}
          </pre>
        </div>
      )}
    </FoldSection>
  );
}

/** One agent's final answer text, rendered inline (not collapsed — it is the
 *  visible result), with its agent eyebrow. */
function TeamMessageBlock({ entry }: { entry: TeamMessageEntry }) {
  if (entry.text.length === 0) return null;
  return (
    <div
      className="flex flex-col gap-fg-1"
      data-team-message={entry.agentId || undefined}
    >
      <AgentTag agentId={entry.agentId} />
      <p className="whitespace-pre-wrap text-body text-ink">{entry.text}</p>
    </div>
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
  const progress = useRunProgress(runId);
  const frames = progress.frames;
  const view = useMemo(() => assembleTeamRun(frames), [frames]);

  if (runId === null) return null;

  return (
    <section className="flex flex-col gap-fg-2" data-team-run={runId}>
      {prompt !== null && prompt.length > 0 && (
        <div data-team-prompt>
          <p className="rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1-5 text-body text-ink">
            {prompt}
          </p>
        </div>
      )}
      <div className="flex flex-col gap-fg-2" data-team-entries>
        {view.entries.map((entry) =>
          entry.kind === "thinking" ? (
            <TeamThinkingSection key={entry.key} entry={entry} />
          ) : entry.kind === "tool" ? (
            <TeamToolSection key={entry.key} entry={entry} />
          ) : (
            <TeamMessageBlock key={entry.key} entry={entry} />
          ),
        )}
      </div>
      <ActiveAgentsIndicator view={view} />
      {/* Honest degraded path (ADR D3): the relay gapped/degraded/was lost, so live
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
