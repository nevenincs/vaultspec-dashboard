// Local view chrome only (architecture-boundaries): the wire truth (session
// snapshot, active run) lives in `stores/server/agent`; this store holds the
// client-side attachment state the composer renders above its input: the
// `@`-mention chips, staged comment batch, queued-prompt slot, and the
// pending interrupt staged when a tool execution parks the
// run on a permission interrupt (the engine serves no pending-interrupt read;
// the only wire surface for an `interrupt_id` is the tool-execute
// `awaiting_permission` arm, so the transcript forwards it here).
//
// Every accumulator is bounded at creation (resource-bounds): the mention list
// carries a hard cap, the queued prompt is exactly one slot (latest wins), the
// comment batch and pending interrupt are single nullable records, and the
// composer text itself is capped by `AGENT_COMPOSER_TEXT_CAP` at the input.

import { create } from "zustand";

/** Hard cap on attached `@`-mention chips (bounded-by-default). */
export const AGENT_COMPOSER_MENTION_CAP = 16;

/** Hard cap on the composer draft length, enforced as the input's maxLength. */
export const AGENT_COMPOSER_TEXT_CAP = 16_384;

/** The two corpus kinds a mention chip can reference. */
export type AgentMentionKind = "feature" | "document";

export interface AgentMention {
  kind: AgentMentionKind;
  /** The corpus value: a document stem or a bare feature tag. */
  value: string;
  /** The human label the chip renders (a document title or the tag). */
  label: string;
}

/** A staged comment batch. Callers stage it via `stageAgentCommentBatch`;
 *  the composer renders it as one removable "N comments" chip in the same chip
 *  grammar as mentions. The batch payload stays with its owning feature; this record is
 *  only what the chip needs to render and be removed. */
export interface AgentCommentBatch {
  count: number;
  /** The immutable batch id, or null while unassigned. */
  batchId: string | null;
}

/** The interrupt the active run is parked on. Staged from the tool-execute
 *  `awaiting_permission` response; the session
 *  snapshot serves no interrupt state, so this client record is the only way the
 *  composer knows the same input should target the interrupt resume. */
export interface AgentPendingInterrupt {
  interruptId: string;
  /** The run the interrupt belongs to, so a settled/replaced run drops it. */
  runId: string | null;
}

/** Where one composer submit goes:
 *  - `bootstrap`: no usable session; create one, then start the first turn.
 *    This includes a current session whose SERVED status is no longer `active`:
 *    the engine's `cancel_run` cancels the whole session and a non-active
 *    session rejects every further turn, so Stop ends the conversation and the
 *    next prompt opens a fresh session seamlessly.
 *  - `turn`: an active session with no live run; start the next prompt turn.
 *  - `steer`: the live run is parked on an interrupt; the same input resumes it.
 *  - `queue`: a run is streaming and not parked; hold the queued prompt. */
export type AgentSubmitDestination = "bootstrap" | "turn" | "steer" | "queue";

/** Resolve the input's destination from the session/run truth (pure — the
 *  component feeds it the snapshot's session status + `active_run` and this
 *  store's staged interrupt). `sessionStatus` is the SERVED bounded token (null
 *  while the snapshot loads — treated as active, and a stale submit faults
 *  honestly on the wire). An interrupt staged for a DIFFERENT run never steers. */
export function agentSubmitDestination(args: {
  sessionId: string | null;
  sessionStatus: string | null;
  activeRunId: string | null;
  pendingInterrupt: AgentPendingInterrupt | null;
}): AgentSubmitDestination {
  if (args.sessionId === null) return "bootstrap";
  if (args.sessionStatus !== null && args.sessionStatus !== "active") {
    return "bootstrap";
  }
  if (args.activeRunId === null) return "turn";
  const interrupt = args.pendingInterrupt;
  if (
    interrupt !== null &&
    (interrupt.runId === null || interrupt.runId === args.activeRunId)
  ) {
    return "steer";
  }
  return "queue";
}

/** The deterministic trailing context line mentions serialize into the prompt —
 *  the wire carries only `prompt` text, so attached context rides IN it, in the
 *  corpus's own grammar (`[[stem]]` wiki-links, `#feature` tags). */
export const AGENT_COMPOSER_CONTEXT_PREFIX = "Context:";

/** Serialize the typed text plus attached mentions into the one prompt string. */
export function buildAgentPrompt(
  text: string,
  mentions: readonly AgentMention[],
): string {
  const body = text.trim();
  if (mentions.length === 0) return body;
  const refs = mentions
    .map((m) => (m.kind === "feature" ? `#${m.value}` : `[[${m.value}]]`))
    .join(" ");
  const context = `${AGENT_COMPOSER_CONTEXT_PREFIX} ${refs}`;
  return body.length === 0 ? context : `${body}\n\n${context}`;
}

interface AgentComposerState {
  /** Attached `@`-mention chips, capped at `AGENT_COMPOSER_MENTION_CAP`. */
  mentions: AgentMention[];
  /** The staged comment batch chip, or null when none is staged. */
  commentBatch: AgentCommentBatch | null;
  /** The queued-prompt slot; latest submit wins. */
  queuedPrompt: string | null;
  /** The interrupt the active run is parked on, staged by the transcript. */
  pendingInterrupt: AgentPendingInterrupt | null;
  addMention: (mention: AgentMention) => void;
  removeMention: (value: string) => void;
  clearMentions: () => void;
  stageCommentBatch: (batch: AgentCommentBatch | null) => void;
  setQueuedPrompt: (prompt: string | null) => void;
  stageInterrupt: (interrupt: AgentPendingInterrupt | null) => void;
}

export const useAgentComposer = create<AgentComposerState>((set) => ({
  mentions: [],
  commentBatch: null,
  queuedPrompt: null,
  pendingInterrupt: null,
  addMention: (mention) =>
    set((state) => {
      if (state.mentions.length >= AGENT_COMPOSER_MENTION_CAP) return state;
      if (state.mentions.some((m) => m.value === mention.value)) return state;
      return { mentions: [...state.mentions, mention] };
    }),
  removeMention: (value) =>
    set((state) => ({ mentions: state.mentions.filter((m) => m.value !== value) })),
  clearMentions: () =>
    set((state) => (state.mentions.length === 0 ? state : { mentions: [] })),
  stageCommentBatch: (batch) => set({ commentBatch: batch }),
  setQueuedPrompt: (prompt) =>
    set({
      queuedPrompt: prompt === null ? null : prompt.slice(0, AGENT_COMPOSER_TEXT_CAP),
    }),
  stageInterrupt: (interrupt) => set({ pendingInterrupt: interrupt }),
}));

// --- selector hooks (raw references; derive downstream in useMemo) ---------------

export function useAgentMentions(): AgentMention[] {
  return useAgentComposer((state) => state.mentions);
}

export function useAgentCommentBatch(): AgentCommentBatch | null {
  return useAgentComposer((state) => state.commentBatch);
}

export function useAgentQueuedPrompt(): string | null {
  return useAgentComposer((state) => state.queuedPrompt);
}

export function useAgentPendingInterrupt(): AgentPendingInterrupt | null {
  return useAgentComposer((state) => state.pendingInterrupt);
}

// --- imperative seams --------------------------------------------------------------

/** Stage batched comments for the composer; the
 *  composer renders the "N comments" chip and offers its removal. Passing null
 *  clears the staged batch (the chip's × and the post-attach cleanup). */
export function stageAgentCommentBatch(batch: AgentCommentBatch | null): void {
  useAgentComposer.getState().stageCommentBatch(batch);
}

/** Stage the interrupt a tool execution parked the run
 *  on (`awaiting_permission` → `interrupt_id`); the composer flips to steer mode.
 *  Passing null clears it (after a successful resume, or when the run settles). */
export function stageAgentInterrupt(interrupt: AgentPendingInterrupt | null): void {
  useAgentComposer.getState().stageInterrupt(interrupt);
}
