// Local view chrome only (architecture-boundaries): the wire truth (session
// snapshot, active run, SERVED queued-turn state) lives in `stores/server/agent`;
// this store holds the client-side attachment state the composer renders above
// its input: the `@`-mention chips, staged comment batch, and the pending
// interrupt staged when a tool execution parks the run on a permission interrupt
// (the engine serves no pending-interrupt read; the only wire surface for an
// `interrupt_id` is the tool-execute `awaiting_permission` arm, so the transcript
// forwards it here).
//
// The one-slot queued prompt was REMOVED (agent-wire-gaps S39): a mid-run submit
// now dispatches the turn to the engine, which enqueues it (`queued_turn_ids`) and
// auto-promotes the next queued turn when the active run settles — server-side, in
// the same unit of work — so the client holds no queue state.
//
// Every accumulator is bounded at creation (resource-bounds): the mention list
// carries a hard cap, the comment batch and pending interrupt are single nullable
// records, and the composer text itself is capped by `AGENT_COMPOSER_TEXT_CAP`.

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
 *  text and its byte-range anchor a "Send to agent" action captured. On submit the
 *  batch is frozen into an engine feedback batch (ADR D4) and the turn carries its
 *  opaque `feedback_batch_id`; a2a retrieves the authoritative context by id. Every
 *  field maps to one `FeedbackBatchItem` field the engine freezes verbatim. */
export interface AgentCommentAttachment {
  /** The durable comment id — the dedupe key so re-sending the same comment is a
   *  no-op, and the engine item's `comment_id`. */
  commentId: string;
  /** The section heading path the comment anchors to (`anchor.heading_path`). */
  headingPath: string[];
  /** The anchor's resolved byte range in the source document (`anchor.content_start`
   *  / `anchor.content_end`), snapshotted at stage time from the served anchor. */
  contentStart: number;
  contentEnd: number;
  /** The comment body — the human note the agent should address (`body`). */
  body: string;
}

/** A staged comment batch (feedback-loop ADR D2), scoped to ONE source document:
 *  a turn carries exactly one `feedback_batch_id` and the engine batch is
 *  single-document, so staging a comment from a different document starts a fresh
 *  batch (latest-document-wins). Callers append via `stageAgentComment`; the
 *  composer renders it as one removable "N comments" chip and, on submit, creates
 *  the engine batch and passes its id on the turn. */
export interface AgentCommentBatch {
  /** The document node id the batch's comments anchor to — the engine
   *  `source_document`. */
  sourceDocument: string;
  /** The document revision (content blob hash) the batch was taken against — the
   *  engine `source_revision`, the marker the D4 staleness fence checks. */
  sourceRevision: string;
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
 *    This includes a current session whose SERVED status is no longer `active`.
 *    Since D2 `cancel_run` is run-scoped and leaves the session `active`, Stop no
 *    longer ends the conversation — the next prompt continues the same session.
 *    Only an explicit session cancel makes a session non-active; then the next
 *    prompt opens a fresh session.
 *  - `turn`: an active session with no live run; start the next prompt turn.
 *  - `steer`: the live run is parked on an interrupt; the same input resumes it.
 *  - `queue`: a run is streaming and not parked; the submit dispatches a turn the
 *    engine ENQUEUES server-side (S39) — the input never locks, and the queued
 *    turn surfaces in the served `queued_turn_ids`, not a client slot. */
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

/** The engine `POST /authoring/v1/feedback-batches` request payload (feedback-loop
 *  ADR D4): the reviewer's chosen comments frozen into an immutable batch, keyed to
 *  one source document + revision and the current session. The engine returns
 *  `{batch_id, digest}`; the turn then carries the opaque `batch_id`. */
export interface FeedbackBatchRequest {
  session_id: string;
  source_document: string;
  source_revision: string;
  items: {
    comment_id: string;
    body: string;
    anchor: { heading_path: string[]; content_start: number; content_end: number };
  }[];
}

/** Build the engine feedback-batch create request from a staged batch and the turn's
 *  session. Pure and exported so the mapping is unit-tested directly; a2a never sees
 *  this content - it receives only the returned opaque id. Returns null for an empty
 *  batch (nothing to freeze). */
export function buildFeedbackBatchRequest(
  batch: AgentCommentBatch | null,
  sessionId: string,
): FeedbackBatchRequest | null {
  if (batch === null || batch.comments.length === 0) return null;
  return {
    session_id: sessionId,
    source_document: batch.sourceDocument,
    source_revision: batch.sourceRevision,
    items: batch.comments.map((comment) => ({
      comment_id: comment.commentId,
      body: comment.body,
      anchor: {
        heading_path: comment.headingPath,
        content_start: comment.contentStart,
        content_end: comment.contentEnd,
      },
    })),
  };
}

/** Serialize the typed text plus attached mentions into the one prompt string —
 *  each block deterministic and separated by a blank line. Staged comments no
 *  longer ride the prompt text: they are frozen into a structured engine feedback
 *  batch and the turn carries its opaque id (feedback-loop ADR D4). A mentions-only
 *  submit is valid (attached context is the prompt). */
export function buildAgentPrompt(
  text: string,
  mentions: readonly AgentMention[],
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
  return parts.join("\n\n");
}

interface AgentComposerState {
  /** Attached `@`-mention chips, capped at `AGENT_COMPOSER_MENTION_CAP`. */
  mentions: AgentMention[];
  /** The staged comment batch chip, or null when none is staged. */
  commentBatch: AgentCommentBatch | null;
  /** The interrupt the active run is parked on, staged by the transcript. */
  pendingInterrupt: AgentPendingInterrupt | null;
  addMention: (mention: AgentMention) => void;
  removeMention: (value: string) => void;
  clearMentions: () => void;
  stageComment: (
    attachment: AgentCommentAttachment,
    source: { sourceDocument: string; sourceRevision: string },
  ) => void;
  stageCommentBatch: (batch: AgentCommentBatch | null) => void;
  stageInterrupt: (interrupt: AgentPendingInterrupt | null) => void;
}

export const useAgentComposer = create<AgentComposerState>((set) => ({
  mentions: [],
  commentBatch: null,
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
  stageComment: (attachment, source) =>
    set((state) => {
      // Single-document invariant: the batch is scoped to one source document +
      // revision (a turn carries one feedback_batch_id, the engine batch is
      // single-document). A stage from a DIFFERENT document (or a new revision of
      // the same one) starts a fresh batch — latest-document-wins, mirroring the
      // queued-prompt slot — so the frozen batch always matches one document.
      const current = state.commentBatch;
      const sameSource =
        current !== null &&
        current.sourceDocument === source.sourceDocument &&
        current.sourceRevision === source.sourceRevision;
      const existing = sameSource ? current.comments : [];
      // Upsert by comment id: a re-stage of the same comment refreshes its body /
      // anchor in place (an edit after the first stage must not freeze a stale
      // body), keeping its position. Only a NEW id grows the set, up to the bound.
      const index = existing.findIndex((c) => c.commentId === attachment.commentId);
      let comments: AgentCommentAttachment[];
      if (index >= 0) {
        comments = existing.slice();
        comments[index] = attachment;
      } else {
        if (existing.length >= AGENT_COMPOSER_COMMENT_CAP) return state;
        comments = [...existing, attachment];
      }
      return {
        commentBatch: {
          sourceDocument: source.sourceDocument,
          sourceRevision: source.sourceRevision,
          comments,
        },
      };
    }),
  stageCommentBatch: (batch) => set({ commentBatch: batch }),
  stageInterrupt: (interrupt) => set({ pendingInterrupt: interrupt }),
}));

// --- selector hooks (raw references; derive downstream in useMemo) ---------------

export function useAgentMentions(): AgentMention[] {
  return useAgentComposer((state) => state.mentions);
}

export function useAgentCommentBatch(): AgentCommentBatch | null {
  return useAgentComposer((state) => state.commentBatch);
}

export function useAgentPendingInterrupt(): AgentPendingInterrupt | null {
  return useAgentComposer((state) => state.pendingInterrupt);
}

// --- imperative seams --------------------------------------------------------------

/** Append one comment to the composer's pending batch (feedback-loop ADR D2, the
 *  "Send to agent" action), scoped to its source document + revision. Deduped by
 *  comment id and bounded; a stage from a different document starts a fresh batch.
 *  The composer renders the running "N comments" chip. */
export function stageAgentComment(
  attachment: AgentCommentAttachment,
  source: { sourceDocument: string; sourceRevision: string },
): void {
  useAgentComposer.getState().stageComment(attachment, source);
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
