// The pure team-run reducer (a2a-orchestration-edge ADR D3): fold the relayed,
// non-authoritative progress frames of ONE team run into an ordered, bounded view
// the Transcript renders as a continuous scroll of collapsible sections. Pure so
// the render tests drive it directly (mirrors `assembleTranscript`).
//
// Wire honesty: every field mirrors a SERVED relay frame value — reasoning text
// from `thought_chunk`, final answer text from `message_chunk`, tool rows merged
// from `tool_call_start`/`tool_call_update`, per-agent liveness from
// `agent_status`/`team_status`. Nothing is derived or faked; a run with only
// status frames (the mock team) yields no entries and drives the active-agent
// indicator alone. Truth is always recoverable from `run-status` — these frames
// are droppable by contract, so a `gap`/`degraded`/loss is handled by the
// consumer's fallback, never by inventing state here.

import {
  relayAgentId,
  relayAgentState,
  relayContent,
  relayErrorMessage,
  relayMessageId,
  relayToolCallId,
  relayToolContentText,
  relayToolStatus,
  relayToolTitle,
  type RelayTranscriptFrame,
} from "../../stores/server/liveAdapters/a2aRelay";

/** Hard cap on rendered team-run entries (bounded-by-default; the relay frame
 *  buffer is itself capped, so this is a defensive ceiling on the derived view). */
export const TEAM_RUN_ENTRY_CAP = 128;

/** The a2a agent lifecycle state that means an agent is actively producing. */
const WORKING_STATE = "working";

/** The a2a tool-call statuses that mean the call has settled. */
const TERMINAL_TOOL_STATUS: ReadonlySet<string> = new Set(["completed", "failed"]);

/** One collapsible reasoning ("Thinking…") section for one agent's thought stream,
 *  grouped by `(agentId, messageId)`; `text` accretes across `thought_chunk`s. */
export interface TeamThinkingEntry {
  readonly kind: "thinking";
  readonly key: string;
  readonly agentId: string;
  readonly text: string;
  /** True while this is the run's most-recent stream and the run is not terminal. */
  readonly live: boolean;
}

/** One tool-call row, merged from a `tool_call_start` and its `tool_call_update`s
 *  by `tool_call_id`; `args` from the start frame, `result` from the last update. */
export interface TeamToolEntry {
  readonly kind: "tool";
  readonly key: string;
  readonly agentId: string;
  readonly toolCallId: string;
  readonly title: string;
  /** The served status token (`pending`/`running`/`completed`/`failed`), or `""`. */
  readonly status: string;
  readonly args: string | null;
  readonly result: string | null;
  /** True while the call has not reached a terminal status and the run is live. */
  readonly live: boolean;
}

/** One agent's final answer text, grouped by `(agentId, messageId)`; `text`
 *  accretes across `message_chunk`s. Rendered as the turn's visible answer. */
export interface TeamMessageEntry {
  readonly kind: "message";
  readonly key: string;
  readonly agentId: string;
  readonly text: string;
  readonly live: boolean;
}

export type TeamActivityEntry = TeamThinkingEntry | TeamToolEntry | TeamMessageEntry;

/** The reconciled team-run view. */
export interface TeamRunView {
  /** Activity entries in first-appearance order (continuous-scroll order). */
  readonly entries: TeamActivityEntry[];
  /** Agent ids currently `working` (drives the live pulsing indicator). */
  readonly activeAgents: string[];
  /** True once a terminal frame arrived (collapses all live chrome). */
  readonly terminal: boolean;
  /** A run-fault message when an `error` frame arrived, else null. */
  readonly error: string | null;
}

/** A mutable accumulator entry (internal; frozen into the readonly view at end). */
type MutableEntry =
  | { kind: "thinking"; key: string; agentId: string; text: string; lastSeq: number }
  | {
      kind: "tool";
      key: string;
      agentId: string;
      toolCallId: string;
      title: string;
      status: string;
      args: string | null;
      result: string | null;
      lastSeq: number;
    }
  | { kind: "message"; key: string; agentId: string; text: string; lastSeq: number };

/** Fold a run's relay frames into the ordered team-run view. Iterates in frame
 *  order (the relay reducer already appends seq-ordered, dedup'd frames), grouping
 *  streams by their correlation id so multi-chunk reasoning/answers/tool calls
 *  collapse into one entry positioned at their first frame. */
export function assembleTeamRun(frames: readonly RelayTranscriptFrame[]): TeamRunView {
  // Insertion-ordered map: first frame of a group fixes its position.
  const groups = new Map<string, MutableEntry>();
  const agentState = new Map<string, string>();
  let terminal = false;
  let error: string | null = null;
  let seqCounter = 0;

  for (const frame of frames) {
    // A frame may carry no engine seq (a control frame); use a monotone counter as
    // the ordering fallback so liveness ("the latest stream") stays deterministic.
    const order = frame.seq ?? seqCounter;
    seqCounter = order + 1;

    switch (frame.kind) {
      case "terminal":
        terminal = true;
        break;
      case "error":
        error = relayErrorMessage(frame) || "The team run reported an error.";
        break;
      case "status": {
        // `agent_status` carries one agent's state; `team_status` carries a roster.
        const rosterRaw = frame.payload.agents;
        if (Array.isArray(rosterRaw)) {
          for (const member of rosterRaw) {
            if (member && typeof member === "object") {
              const rec = member as Record<string, unknown>;
              const id = typeof rec.agent_id === "string" ? rec.agent_id : "";
              const state = typeof rec.state === "string" ? rec.state : "";
              if (id) agentState.set(id, state);
            }
          }
        }
        const id = relayAgentId(frame);
        const state = relayAgentState(frame);
        if (id && state) agentState.set(id, state);
        break;
      }
      case "thought": {
        const agentId = relayAgentId(frame);
        const key = `thought:${agentId}:${relayMessageId(frame) || "_"}`;
        const existing = groups.get(key);
        if (existing && existing.kind === "thinking") {
          existing.text += relayContent(frame);
          existing.lastSeq = order;
        } else {
          groups.set(key, {
            kind: "thinking",
            key,
            agentId,
            text: relayContent(frame),
            lastSeq: order,
          });
        }
        break;
      }
      case "token": {
        // `message_chunk` — the agent's visible final answer stream.
        const agentId = relayAgentId(frame);
        const key = `msg:${agentId}:${relayMessageId(frame) || "_"}`;
        const existing = groups.get(key);
        if (existing && existing.kind === "message") {
          existing.text += relayContent(frame);
          existing.lastSeq = order;
        } else {
          groups.set(key, {
            kind: "message",
            key,
            agentId,
            text: relayContent(frame),
            lastSeq: order,
          });
        }
        break;
      }
      case "tool_call": {
        const toolCallId = relayToolCallId(frame);
        if (!toolCallId) break;
        const key = `tool:${toolCallId}`;
        const status = relayToolStatus(frame);
        const title = relayToolTitle(frame);
        const contentText = relayToolContentText(frame) || null;
        const existing = groups.get(key);
        if (existing && existing.kind === "tool") {
          if (title) existing.title = title;
          if (status) existing.status = status;
          // The start frame's content is the args; later update content is result.
          if (contentText) existing.result = contentText;
          existing.lastSeq = order;
        } else {
          // Distinguish a first-seen START from a first-seen UPDATE (its `start`
          // was dropped/evicted): a `tool_call_start` carries `pending` status and
          // its content is the ARGS; an update carries running/completed/failed and
          // its content is the RESULT. Labeling a dropped-start update's result as
          // args would be a quiet lie, so branch on the status.
          const isStart = status === "" || status === "pending";
          groups.set(key, {
            kind: "tool",
            key,
            agentId: relayAgentId(frame),
            toolCallId,
            title: title || "tool",
            status,
            args: isStart ? contentText : null,
            result: isStart ? null : contentText,
            lastSeq: order,
          });
        }
        break;
      }
      // heartbeat / gap / degraded / dropped / progress: no entry (the consumer's
      // fallback reads gap/degraded; the rest carry no renderable activity).
      default:
        break;
    }
  }

  const ordered = Array.from(groups.values());
  // The single most-recently-touched STREAM (thinking/message) pulses as live.
  let liveStreamSeq = -1;
  for (const e of ordered) {
    if ((e.kind === "thinking" || e.kind === "message") && e.lastSeq > liveStreamSeq) {
      liveStreamSeq = e.lastSeq;
    }
  }

  const entries: TeamActivityEntry[] = ordered.map((e): TeamActivityEntry => {
    if (e.kind === "tool") {
      return {
        kind: "tool",
        key: e.key,
        agentId: e.agentId,
        toolCallId: e.toolCallId,
        title: e.title,
        status: e.status,
        args: e.args,
        result: e.result,
        live: !terminal && !TERMINAL_TOOL_STATUS.has(e.status),
      };
    }
    const live = !terminal && e.lastSeq === liveStreamSeq;
    return e.kind === "thinking"
      ? { kind: "thinking", key: e.key, agentId: e.agentId, text: e.text, live }
      : { kind: "message", key: e.key, agentId: e.agentId, text: e.text, live };
  });

  const capped =
    entries.length > TEAM_RUN_ENTRY_CAP
      ? entries.slice(entries.length - TEAM_RUN_ENTRY_CAP)
      : entries;

  const activeAgents = terminal
    ? []
    : [...agentState.entries()]
        .filter(([, state]) => state === WORKING_STATE)
        .map(([id]) => id);

  return { entries: capped, activeAgents, terminal, error };
}
