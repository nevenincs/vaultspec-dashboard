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

/** Hard cap on staged comment attachments in one pending batch (bounded-by-default;
 *  the feedback-loop ADR bounds a batch by comment count). */
export const AGENT_COMPOSER_COMMENT_CAP = 32;

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

/** One comment staged for the pending batch (feedback-loop ADR D2): the anchored
 *  text and provenance a "Send to agent" action captured. Held client-side so the
 *  interim serialization (below) can ride it into the prompt; the future
 *  `feedback_batch_id` continuation (ADR D4) is upstream-gated on the a2a edge. */
export interface AgentCommentAttachment {
  /** The durable comment id — the dedupe key so re-sending the same comment is a
   *  no-op rather than a duplicate line. */
  commentId: string;
  /** The document stem the comment anchors to (provenance); null when unknown. */
  docStem: string | null;
  /** The section heading path the comment anchors to (the anchor). */
  headingPath: string[];
  /** The comment body — the human note the agent should address. */
  body: string;
}

/** A staged comment batch (feedback-loop ADR D2). Callers append to it via
 *  `stageAgentComment`; the composer renders it as one removable "N comments" chip
 *  in the same chip grammar as mentions, and submitting the next turn serializes it
 *  into the prompt context (interim, until the structured continuation ships). */
export interface AgentCommentBatch {
  /** The immutable backend batch id, or null while the interim client
   *  serialization is used (the structured `feedback_batch_id` is upstream-gated). */
  batchId: string | null;
  /** The staged comments in stage order, bounded at `AGENT_COMPOSER_COMMENT_CAP`. */
  comments: AgentCommentAttachment[];
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

/** The deterministic heading of the serialized comment block. Prompt grammar (like
 *  `Context:` and `[[stem]]`), NOT UI copy — it rides IN the prompt text because the
 *  turn contract carries only `prompt` (the structured `feedback_batch_id` is
 *  upstream-gated, feedback-loop ADR D4). */
export const AGENT_COMPOSER_COMMENTS_PREFIX = "Comments to address:";

/** Serialize a staged comment batch into a deterministic prompt block: one line per
 *  comment, each carrying its provenance (`[[stem]]`), section anchor, and body.
 *  Pure and exported so the serialization is unit-tested directly. */
export function serializeCommentBatch(batch: AgentCommentBatch | null): string {
  if (batch === null || batch.comments.length === 0) return "";
  const lines = batch.comments.map((comment) => {
    const ref = comment.docStem !== null ? `[[${comment.docStem}]]` : "";
    const anchor =
      comment.headingPath.length > 0 ? comment.headingPath.join(" › ") : "";
    const location = [ref, anchor].filter((part) => part.length > 0).join(" ");
    return location.length > 0 ? `- ${location}: ${comment.body}` : `- ${comment.body}`;
  });
  return `${AGENT_COMPOSER_COMMENTS_PREFIX}\n${lines.join("\n")}`;
}

/** Serialize the typed text plus attached mentions and staged comments into the one
 *  prompt string — each block deterministic and separated by a blank line. A
 *  comments-only or mentions-only submit is valid (attached context is the prompt). */
export function buildAgentPrompt(
  text: string,
  mentions: readonly AgentMention[],
  commentBatch: AgentCommentBatch | null = null,
): string {
  const parts: string[] = [];
  const body = text.trim();
  if (body.length > 0) parts.push(body);
  if (mentions.length > 0) {
    const refs = mentions
      .map((m) => (m.kind === "feature" ? `#${m.value}` : `[[${m.value}]]`))
      .join(" ");
    parts.push(`${AGENT_COMPOSER_CONTEXT_PREFIX} ${refs}`);
  }
  const comments = serializeCommentBatch(commentBatch);
  if (comments.length > 0) parts.push(comments);
  return parts.join("\n\n");
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
  stageComment: (attachment: AgentCommentAttachment) => void;
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
  stageComment: (attachment) =>
    set((state) => {
      const existing = state.commentBatch?.comments ?? [];
      // Upsert by comment id: a re-stage of the same comment refreshes its body /
      // anchor in place (an edit after the first stage must not freeze a stale
      // body), keeping its position. Only a NEW id grows the set, and only up to
      // the bound.
      const index = existing.findIndex((c) => c.commentId === attachment.commentId);
      if (index >= 0) {
        const comments = existing.slice();
        comments[index] = attachment;
        return {
          commentBatch: { batchId: state.commentBatch?.batchId ?? null, comments },
        };
      }
      if (existing.length >= AGENT_COMPOSER_COMMENT_CAP) return state;
      return {
        commentBatch: {
          batchId: state.commentBatch?.batchId ?? null,
          comments: [...existing, attachment],
        },
      };
    }),
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

/** Append one comment to the composer's pending batch (feedback-loop ADR D2, the
 *  "Send to agent" action). Deduped by comment id and bounded; the composer renders
 *  the running "N comments" chip. */
export function stageAgentComment(attachment: AgentCommentAttachment): void {
  useAgentComposer.getState().stageComment(attachment);
}

/** Set or clear the whole staged batch. Passing null clears it (the chip's × and
 *  the post-submit cleanup). */
export function stageAgentCommentBatch(batch: AgentCommentBatch | null): void {
  useAgentComposer.getState().stageCommentBatch(batch);
}

/** Stage the interrupt a tool execution parked the run
 *  on (`awaiting_permission` → `interrupt_id`); the composer flips to steer mode.
 *  Passing null clears it (after a successful resume, or when the run settles). */
export function stageAgentInterrupt(interrupt: AgentPendingInterrupt | null): void {
  useAgentComposer.getState().stageInterrupt(interrupt);
}
