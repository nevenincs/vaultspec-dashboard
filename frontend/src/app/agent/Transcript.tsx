// The Agent panel transcript (ADR D3, Figma frame 1223:4518): the session's
// turns in FIXED order — user prompt → thinking → tool calls (with the inline
// permission prompt) → final text → run status → proposal-card slot — assembled
// by the pure `assembleTranscript` reconciler from the durable session snapshot
// (`useSession`, refreshed by the shared SSE lifecycle fan-out) grafted with the
// client-held annex (`stores/view/agentTranscript`).
//
// Wire honesty (the load-bearing contract): the snapshot serves the USER prompt
// text and the run's bounded lifecycle status ONLY. For a SINGLE-AGENT run no wire
// surface serves reasoning content, streamed tool-call state, or the agent's final
// text, so a live turn shows the served run state as its streaming indicator (never
// a fake token stream), thinking renders only when a recorded segment exists, tool
// calls render only what the client itself dispatched and recorded from SERVED
// execute envelopes, and the final-text position is honestly empty until a wire
// carries one. Settled turns collapse transient running chrome to the terminal
// served status only.
//
// TEAM runs are the exception: the a2a relay channel (a2a ADR D3) that carries
// reasoning / tool calls / final text now exists end-to-end, and `TeamRunTranscript`
// renders it as live collapsible activity — mounted beside this single-agent
// transcript by `AgentPanel`, not through this reconciler.
//
// Bounded: the rendered window is capped at `AGENT_TRANSCRIPT_TURN_CAP` (the
// engine snapshot's own recovery window); older truth stays recoverable from
// durable events, never from a relay.
//
// Layer ownership (architecture-boundaries): a DUMB app-chrome view over the
// agent slice snapshot + the transcript view store. It fetches nothing.

import { useMemo } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type { MessageDescriptor } from "../../platform/localization/message";
import type { RunStatus, SessionSnapshot } from "../../stores/server/agent";
import {
  useAgentThinking,
  useAgentToolCalls,
  type AgentThinkingSegment,
  type AgentToolCallRecord,
} from "../../stores/view/agentTranscript";
import { Spinner } from "../kit";
import { AgentTurnProposal } from "./ProposalCard";
import { ThinkingEntry, ToolCallEntry } from "./ToolCallEntry";

const MSG = {
  showingRecent: "common:agent.transcript.showingRecent",
  toolCalls: "common:agent.transcript.toolCalls",
} as const;

/** The rendered turn window FALLBACK. The render cap is taken from the snapshot's
 *  own `caps.turn_cap` (the engine's recovery window) so the window and the
 *  `windowFull` flag can't drift if the engine cap changes; this constant is the
 *  floor used only when the served cap is absent/non-positive. */
export const AGENT_TRANSCRIPT_TURN_CAP = 20;

/** The SERVED run statuses that mean the run is still moving (the same pair the
 *  footer chip treats as streaming). Everything else is terminal. */
const LIVE_RUN_STATUS: Readonly<Record<RunStatus, boolean>> = {
  active: true,
  cancel_requested: true,
  cancelled: false,
  completed: false,
  failed: false,
};

/** Served run token -> plain status word (mapped like `EditorStatus`). */
const RUN_STATUS_MESSAGE: Readonly<Record<RunStatus, MessageDescriptor>> = {
  active: { key: "common:agent.transcript.turnStatus.working" },
  cancel_requested: { key: "common:agent.transcript.turnStatus.stopping" },
  completed: { key: "common:agent.transcript.turnStatus.done" },
  cancelled: { key: "common:agent.transcript.turnStatus.stopped" },
  failed: { key: "common:agent.transcript.turnStatus.failed" },
};

/** Terminal run token -> `status/*` dot tone class. */
const RUN_STATUS_DOT: Readonly<Partial<Record<RunStatus, string>>> = {
  completed: "bg-state-complete",
  cancelled: "bg-state-archived",
  failed: "bg-state-broken",
};

/** One reconciled transcript turn, in render order. */
export interface TranscriptTurnView {
  turnId: string;
  turnIndex: number;
  prompt: string;
  summary: string | null;
  runId: string | null;
  /** The SERVED run status token, or null when the turn has no run record. */
  runStatus: RunStatus | null;
  /** True while the turn's run is in a served live state (streaming chrome). */
  live: boolean;
  thinking: AgentThinkingSegment | null;
  toolCalls: AgentToolCallRecord[];
}

export interface TranscriptView {
  turns: TranscriptTurnView[];
  /** True when the served turn window is full — earlier turns may exist beyond
   *  the snapshot's bounded recovery cap. */
  windowFull: boolean;
}

/** Reconcile the durable snapshot with the client-held annex into the bounded,
 *  fixed-order transcript. Pure — the render tests drive it directly. */
export function assembleTranscript(
  snapshot: SessionSnapshot,
  toolCalls: readonly AgentToolCallRecord[],
  thinking: readonly AgentThinkingSegment[],
): TranscriptView {
  // The engine serves turns newest-first; the transcript reads oldest-first.
  const ordered = [...snapshot.turns].sort((a, b) => a.turn_index - b.turn_index);
  // Derive the render cap from the snapshot's own recovery cap so the window and
  // the `windowFull` flag share one source; fall back to the constant floor.
  const renderCap =
    snapshot.caps.turn_cap > 0 ? snapshot.caps.turn_cap : AGENT_TRANSCRIPT_TURN_CAP;
  const kept = ordered.slice(-renderCap);
  const turns = kept.map((turn): TranscriptTurnView => {
    const run = snapshot.runs.find((r) => r.turn_id === turn.turn_id) ?? null;
    const runId = run?.run_id ?? null;
    return {
      turnId: turn.turn_id,
      turnIndex: turn.turn_index,
      prompt: turn.prompt_text,
      summary: turn.summary,
      runId,
      runStatus: run?.status ?? null,
      live: run !== null && LIVE_RUN_STATUS[run.status],
      thinking:
        runId === null ? null : (thinking.find((t) => t.runId === runId) ?? null),
      toolCalls:
        runId === null
          ? []
          : toolCalls
              .filter((c) => c.runId === runId)
              .sort((a, b) => a.recordedAtMs - b.recordedAtMs),
    };
  });
  const windowFull =
    ordered.length > kept.length ||
    (snapshot.caps.turn_cap > 0 && snapshot.turns.length >= snapshot.caps.turn_cap);
  return { turns, windowFull };
}

/** The per-turn run-state line: a live turn shows the streaming indicator with
 *  the served state word; a settled turn collapses to the terminal status only
 *  (collapse-on-settle — no residual running chrome). */
function TurnStatusLine({ view }: { view: TranscriptTurnView }) {
  const resolveMessage = useLocalizedMessageResolver();
  if (view.runStatus === null) return null;
  const label = resolveMessage(RUN_STATUS_MESSAGE[view.runStatus]).message;
  if (view.live) {
    return (
      <p
        className="flex items-center gap-fg-1-5 px-fg-2 text-meta text-ink-muted"
        data-transcript-streaming={view.runStatus}
      >
        <Spinner size="sm" label={label} />
        {label}
      </p>
    );
  }
  return (
    <p
      className="flex items-center gap-fg-1-5 px-fg-2 text-meta text-ink-faint"
      data-transcript-status={view.runStatus}
    >
      <span
        aria-hidden
        className={`size-fg-2 shrink-0 rounded-full ${
          RUN_STATUS_DOT[view.runStatus] ?? "bg-state-archived"
        }`}
      />
      {label}
    </p>
  );
}

function TranscriptTurn({ view }: { view: TranscriptTurnView }) {
  const resolveMessage = useLocalizedMessageResolver();
  return (
    <li
      className="flex flex-col gap-fg-1-5"
      data-transcript-turn={view.turnId}
      data-transcript-live={view.live ? "" : undefined}
    >
      <div data-transcript-prompt>
        <p className="rounded-fg-md bg-paper-sunken px-fg-2 py-fg-1-5 text-body text-ink">
          {view.prompt}
        </p>
        {view.summary !== null && view.summary.length > 0 && (
          <p className="px-fg-2 pt-fg-1 text-meta text-ink-muted">{view.summary}</p>
        )}
      </div>
      <ThinkingEntry segment={view.thinking} />
      {view.toolCalls.length > 0 && (
        <ul
          className="flex flex-col gap-fg-1"
          aria-label={resolveMessage({ key: MSG.toolCalls }).message}
          data-transcript-tools
        >
          {view.toolCalls.map((record) => (
            <li key={record.toolCallId}>
              <ToolCallEntry record={record} live={view.live} />
            </li>
          ))}
        </ul>
      )}
      {/* Final text: no wire surface serves the agent's message yet (a2a relay
          gap) — the position stays honestly empty rather than faking output. */}
      <TurnStatusLine view={view} />
      {/* S16/S42 proposal-card slot: the inline proposal card mounts here bound to
          THIS turn's run by the served `run_id` (ADR D5). Per-turn now — each turn
          shows only the proposal its own run produced (an exact bind, not the former
          latest-turn heuristic); the slot stays empty until that run's proposal
          resolves. `AgentTurnProposal` reads the shared review-queue store. */}
      <div
        data-agent-proposal-slot
        data-turn-id={view.turnId}
        data-run-id={view.runId ?? undefined}
      >
        <AgentTurnProposal runId={view.runId} />
      </div>
    </li>
  );
}

/**
 * The transcript body. Mounts into the panel's `data-agent-transcript-entries`
 * slot; consumes the passed snapshot (the container owns the query) and the
 * transcript view store, deriving the reconciled view in `useMemo` off the raw
 * selector slices (frontend-store-selectors).
 */
export function Transcript({ snapshot }: { snapshot: SessionSnapshot }) {
  const resolveMessage = useLocalizedMessageResolver();
  const toolCalls = useAgentToolCalls();
  const thinking = useAgentThinking();
  const view = useMemo(
    () => assembleTranscript(snapshot, toolCalls, thinking),
    [snapshot, toolCalls, thinking],
  );
  return (
    <div className="flex flex-col gap-fg-2">
      {view.windowFull && (
        <p className="px-fg-2 text-caption text-ink-faint" data-transcript-window>
          {resolveMessage({ key: MSG.showingRecent }).message}
        </p>
      )}
      <ol className="flex flex-col gap-fg-3" data-agent-transcript-entries>
        {view.turns.map((turn) => (
          <TranscriptTurn key={turn.turnId} view={turn} />
        ))}
      </ol>
    </div>
  );
}
