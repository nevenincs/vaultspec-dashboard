// Local view chrome only (architecture-boundaries): the CLIENT-HELD transcript
// annex. The durable wire truth for a conversation is the session snapshot
// (turns + runs, `stores/server/agent`); the engine serves NO readable state for
// tool calls, thinking/reasoning content, or pending permissions — the only wire
// surfaces are the tool-execute RESPONSE envelope (`disposition` /
// `interrupt_id` / `result`) and the permission-decision OUTCOME
// (`granted`/`denied`). This store retains those command-time wire values so the
// transcript can render them between snapshot refreshes; every field mirrors a
// SERVED token or value, never a client-derived status. When the a2a relay ships
// its token/tool-call channel (a2a ADR D3), its consumer records through these
// same seams; truth stays recoverable from durable events — the annex is
// presentation state, honestly lost on reload.
//
// Every accumulator is bounded at creation (resource-bounds): the tool-call list
// and thinking list carry hard caps with oldest-first eviction, and thinking
// text is length-capped on write.

import { create } from "zustand";

import { stageAgentInterrupt } from "./agentComposer";

/** Hard cap on retained tool-call records across the panel (bounded-by-default;
 *  oldest evicted first — durable truth is never this annex). */
export const AGENT_TOOL_CALL_CAP = 64;

/** Hard cap on retained thinking segments (one per run at most). */
export const AGENT_THINKING_CAP = 20;

/** Hard cap on one thinking segment's retained text. */
export const AGENT_THINKING_TEXT_CAP = 16_384;

/** The SERVED tool-execute disposition tokens (`/agent-tools/execute` envelope). */
export type AgentToolCallDisposition =
  | "dispatched"
  | "awaiting_permission"
  | "refused"
  | "already_handled";

/** The SERVED permission-decision outcome tokens (`permission-decision` route). */
export type AgentToolPermissionDecision = "granted" | "denied";

/** One tool call the client dispatched, recorded from the SERVED execute
 *  envelope. `input`/`result` are retained opaquely for the per-row expand;
 *  `detail` is an optional plain-language target sub-line (a document title,
 *  never an internal id the operator shouldn't see). */
export interface AgentToolCallRecord {
  toolCallId: string;
  runId: string;
  /** The semantic tool name as served/dispatched (authored data, not UI copy). */
  tool: string;
  disposition: AgentToolCallDisposition;
  /** The served interrupt id — present exactly on the awaiting arm. */
  interruptId: string | null;
  /** The served decision outcome, once a reviewer decided; null while open. */
  permission: AgentToolPermissionDecision | null;
  input: unknown;
  result: unknown;
  detail: string | null;
  recordedAtMs: number;
}

/** One run's relayed reasoning segment. NOTHING on the current wire carries
 *  reasoning content (the engine maps LangGraph references only), so today no
 *  producer records these and the thinking block renders for no turn — the type
 *  and seam exist for the a2a relay channel (a2a ADR D3). */
export interface AgentThinkingSegment {
  runId: string;
  text: string;
  /** Served/relayed duration when the producer carries one; null renders the
   *  cost-less header (never a fabricated duration). */
  durationMs: number | null;
}

interface AgentTranscriptState {
  toolCalls: AgentToolCallRecord[];
  thinking: AgentThinkingSegment[];
  recordToolCall: (record: AgentToolCallRecord) => void;
  resolveToolPermission: (
    toolCallId: string,
    decision: AgentToolPermissionDecision,
  ) => void;
  recordThinking: (segment: AgentThinkingSegment) => void;
  clearAnnex: () => void;
}

export const useAgentTranscript = create<AgentTranscriptState>((set) => ({
  toolCalls: [],
  thinking: [],
  recordToolCall: (record) =>
    set((state) => {
      // Upsert by tool_call_id (an execute replay updates in place), then evict
      // oldest past the cap.
      const kept = state.toolCalls.filter((c) => c.toolCallId !== record.toolCallId);
      kept.push(record);
      return {
        toolCalls:
          kept.length > AGENT_TOOL_CALL_CAP
            ? kept.slice(kept.length - AGENT_TOOL_CALL_CAP)
            : kept,
      };
    }),
  resolveToolPermission: (toolCallId, decision) =>
    set((state) => ({
      toolCalls: state.toolCalls.map((c) =>
        c.toolCallId === toolCallId ? { ...c, permission: decision } : c,
      ),
    })),
  recordThinking: (segment) =>
    set((state) => {
      const bounded: AgentThinkingSegment = {
        ...segment,
        text: segment.text.slice(0, AGENT_THINKING_TEXT_CAP),
      };
      const kept = state.thinking.filter((t) => t.runId !== segment.runId);
      kept.push(bounded);
      return {
        thinking:
          kept.length > AGENT_THINKING_CAP
            ? kept.slice(kept.length - AGENT_THINKING_CAP)
            : kept,
      };
    }),
  clearAnnex: () => set({ toolCalls: [], thinking: [] }),
}));

// --- selector hooks (raw references; derive downstream in useMemo) ---------------

export function useAgentToolCalls(): AgentToolCallRecord[] {
  return useAgentTranscript((state) => state.toolCalls);
}

export function useAgentThinking(): AgentThinkingSegment[] {
  return useAgentTranscript((state) => state.thinking);
}

// --- imperative seams -------------------------------------------------------------

/** Record one tool call from its SERVED execute envelope. An awaiting call also
 *  stages its interrupt for the composer (ADR D4: the same input steers the
 *  parked run; the engine serves no pending-interrupt read, so this forward is
 *  the only path from the awaiting arm to the steer machine). */
export function recordAgentToolCall(record: AgentToolCallRecord): void {
  useAgentTranscript.getState().recordToolCall(record);
  if (record.disposition === "awaiting_permission" && record.interruptId !== null) {
    stageAgentInterrupt({ interruptId: record.interruptId, runId: record.runId });
  }
}

/** Record the SERVED permission-decision outcome onto its tool-call row. */
export function resolveAgentToolPermission(
  toolCallId: string,
  decision: AgentToolPermissionDecision,
): void {
  useAgentTranscript.getState().resolveToolPermission(toolCallId, decision);
}

/** Record one run's relayed reasoning segment (a2a relay consumer seam; no
 *  current wire produces these). */
export function recordAgentThinking(segment: AgentThinkingSegment): void {
  useAgentTranscript.getState().recordThinking(segment);
}

/** Drop the whole client-held annex (e.g. tests or a hard reset). */
export function clearAgentTranscriptAnnex(): void {
  useAgentTranscript.getState().clearAnnex();
}
