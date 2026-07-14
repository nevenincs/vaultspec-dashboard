// The section comment thread panel (authoring-surface ADR D2, W02.P05.S16).
//
// Opens anchored to the invoked section (the reader positions it beside the
// heading, mirroring PropertiesPopover's Popover pattern — Escape / outside-pointer
// dismiss for free). Two roles, one panel:
//
//   - Section thread: lists a live section's ANCHORED comments (author + relative
//     time + body) with resolve/reopen, edit, delete, and a compose box that creates
//     a fresh comment whose selector is computed from the CURRENT section bytes (so
//     it lists as anchored immediately — the same git-blob-oid the backend fences).
//   - Orphaned notes: lists comments whose anchor drifted, under a clearly-labeled
//     stale state with the typed reason in plain language and an explicit
//     "Re-anchor to current section" action — the mutation is never a silent side
//     effect of a read.
//
// Presentational: the parent owns the served comments + the mutations (this composes
// kit atoms and calls the plane callbacks). Tokens only; every string plain language.

import { useEffect, useState } from "react";
import { Check, Link, Link2, RotateCcw, Trash2, X } from "lucide-react";

import { Badge, Button, Card, Divider, IconButton, Popover } from "../kit";
import type {
  CommentOrphanEvidence,
  ServedComment,
} from "../../stores/server/authoring";
import {
  headingPathKey,
  sectionSelectorForBlock,
  type CommentAnchorIndex,
  type HeadingBlock,
} from "./sectionAnchor";
import type { ReaderCommentActions } from "./readerComments";

/** A coarse, plain-language relative time from an epoch-ms stamp. */
function relativeTime(ms: number): string {
  const deltaSeconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (deltaSeconds < 45) return "just now";
  const minutes = Math.round(deltaSeconds / 60);
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "1 day ago" : `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.round(months / 12);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

/** The single-principal author label (V1 is one shared editor by ADR): a human
 *  comment is the current editor ("You"); other kinds name their kind plainly. */
function authorLabel(kind: string): string {
  if (kind === "human") return "You";
  if (kind === "agent") return "Assistant";
  return "System";
}

/** The typed orphan reason in plain, user-facing language (no engine vocabulary). */
function orphanReason(evidence: CommentOrphanEvidence): string {
  switch (evidence.reason) {
    case "content_hash_mismatch":
      return "The section this note was left on has been edited since.";
    case "missing_anchor":
      return "The section this note was left on no longer exists.";
    case "ambiguous_anchor":
      return "This note's section now matches more than one heading.";
    case "malformed_anchor":
      return "This note's anchor is no longer valid.";
  }
}

/** The live block whose path still matches an orphaned comment's stored anchor (the
 *  re-anchor target), or undefined when the section is truly gone. */
function reanchorTarget(
  served: ServedComment,
  anchorIndex: CommentAnchorIndex,
): HeadingBlock | undefined {
  const wanted = headingPathKey(served.comment.selector.heading_path);
  for (const block of anchorIndex.byPluginPath.values()) {
    if (headingPathKey(block.path) === wanted) return block;
  }
  return undefined;
}

interface CommentRowProps {
  served: ServedComment;
  actions: ReaderCommentActions;
  /** The live re-anchor target for an orphaned row, or undefined when unavailable. */
  reanchorBlock?: HeadingBlock;
}

/** One comment: author + relative time + body, with resolve/reopen, edit, delete,
 *  and (for an orphaned row) the explicit re-anchor. Tracks its own in-flight state
 *  so one busy row never freezes the thread. */
function CommentRow({ served, actions, reanchorBlock }: CommentRowProps) {
  const { comment, orphaned } = served;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);

  const run = (op: () => Promise<void>) => {
    setBusy(true);
    void op().finally(() => setBusy(false));
  };

  return (
    <div
      className="flex flex-col gap-fg-1 rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-2"
      data-comment-id={comment.comment_id}
      data-comment-orphaned={orphaned}
    >
      <div className="flex items-center justify-between gap-fg-2">
        <span className="text-label text-ink-muted">
          {authorLabel(comment.author.kind)} · {relativeTime(comment.created_at_ms)}
        </span>
        <div className="flex items-center gap-fg-1">
          {comment.resolved && <Badge tone="neutral">Resolved</Badge>}
          <IconButton
            label={comment.resolved ? "Reopen comment" : "Resolve comment"}
            onClick={() =>
              run(() => actions.setResolved(comment.comment_id, !comment.resolved))
            }
            disabled={busy}
          >
            {comment.resolved ? (
              <RotateCcw size={14} aria-hidden />
            ) : (
              <Check size={14} aria-hidden />
            )}
          </IconButton>
          <IconButton
            label="Delete comment"
            onClick={() => run(() => actions.deleteComment(comment.comment_id))}
            disabled={busy}
          >
            <Trash2 size={14} aria-hidden />
          </IconButton>
        </div>
      </div>

      {orphaned && served.anchor.state === "orphaned" && (
        <div
          className="rounded-fg-xs bg-paper-sunken px-fg-2 py-fg-1 text-meta text-ink-muted"
          data-comment-orphan-reason={served.anchor.evidence.reason}
        >
          {orphanReason(served.anchor.evidence)}
          {reanchorBlock !== undefined && (
            <button
              type="button"
              className="ml-fg-2 inline-flex items-center gap-fg-1 font-medium text-accent-text underline-offset-2 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  actions.reanchorComment(
                    comment.comment_id,
                    await sectionSelectorForBlock(reanchorBlock),
                  ),
                )
              }
            >
              <Link2 size={12} aria-hidden />
              Re-anchor to current section
            </button>
          )}
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-fg-1">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="edit comment"
            rows={3}
            className="w-full resize-y rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
          />
          <div className="flex items-center gap-fg-2">
            <Button
              variant="secondary"
              disabled={busy || draft.trim().length === 0}
              onClick={() =>
                run(async () => {
                  await actions.editComment(comment.comment_id, draft.trim());
                  setEditing(false);
                })
              }
            >
              Save
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="whitespace-pre-wrap break-words text-left text-body text-ink hover:text-accent-text"
          title="Edit comment"
          onClick={() => {
            setDraft(comment.body);
            setEditing(true);
          }}
        >
          {comment.body}
        </button>
      )}
    </div>
  );
}

/** The compose box: a textarea + a Comment button that creates a comment anchored
 *  to the CURRENT section. Disabled until the shared editor actor is bootstrapped
 *  (a comment command needs a resolved principal). */
function ComposeBox({
  block,
  actions,
  actorReady,
  actorBootstrapping,
}: {
  block: HeadingBlock;
  actions: ReaderCommentActions;
  actorReady: boolean;
  actorBootstrapping: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = actorReady && !busy && draft.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    setBusy(true);
    void (async () => {
      const selector = await sectionSelectorForBlock(block);
      await actions.createComment(selector, draft.trim());
      setDraft("");
    })().finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-fg-1">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Leave a note on this section…"
        aria-label="new comment"
        rows={3}
        className="w-full resize-y rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
      />
      <div className="flex items-center justify-between gap-fg-2">
        <span className="text-meta text-ink-muted">
          {actorReady
            ? "Notes attach to this section's heading."
            : actorBootstrapping
              ? "Preparing your editor identity…"
              : "Sign-in is being prepared…"}
        </span>
        <Button variant="primary" disabled={!canSubmit} onClick={submit}>
          Comment
        </Button>
      </div>
    </div>
  );
}

export interface CommentThreadPanelProps {
  /** The section this thread is anchored to; when set, the compose box + that
   *  section's anchored comments render. Omit for the doc-level orphaned panel. */
  block?: HeadingBlock;
  /** The comments to list (the parent has already narrowed to the section's
   *  anchored comments, or to the orphaned set). */
  comments: ServedComment[];
  /** The plane's bound command callbacks + actor-identity state. */
  actions: ReaderCommentActions;
  anchorIndex: CommentAnchorIndex;
  actorReady: boolean;
  actorBootstrapping: boolean;
  ensureActor(): void;
  /** Panel title (e.g. the section heading, or "Orphaned notes"). */
  title: string;
  /** True for the doc-level orphaned panel (no compose; rows offer re-anchor). */
  orphanedPanel?: boolean;
  /** Copy a section link (`[[stem#slug]]`) to this heading; omitted when the source
   *  is not a document. Rendered as a header verb on the section thread. */
  onCopyLink?: () => void;
  /** The section's heading path is duplicated in the document, so a new comment
   *  could not be told apart from the identically-titled section(s). Compose is
   *  replaced with an honest hint rather than silently creating an orphan. */
  ambiguous?: boolean;
  onClose(): void;
  /** Popover positioning class supplied by the reader (anchored to the heading). */
  className?: string;
}

/**
 * The section comment thread panel. Composed from kit atoms in a light-dismiss
 * Popover; the parent supplies the narrowed comments and the section anchor.
 */
export function CommentThreadPanel({
  block,
  comments,
  actions,
  anchorIndex,
  actorReady,
  actorBootstrapping,
  ensureActor,
  title,
  orphanedPanel = false,
  onCopyLink,
  ambiguous = false,
  onClose,
  className,
}: CommentThreadPanelProps) {
  // Bootstrap the shared editor actor the moment a thread opens (the least-eager
  // mint: a reader that never opens a thread never mints a token).
  useEffect(() => {
    if (!actorReady) ensureActor();
  }, [actorReady, ensureActor]);

  return (
    <Popover
      open
      onDismiss={onClose}
      role="dialog"
      aria-label={orphanedPanel ? "Orphaned comments" : "Section comments"}
      className={className}
      data-comment-thread
    >
      <Card elevation="overlay" padded>
        {/* Clamp the panel to the reader pane (the `@container` root exposes `cqw`)
            so a reader narrower than the 20rem panel never scrolls horizontally. */}
        <div className="flex max-h-[24rem] w-80 max-w-[calc(100cqw-1.5rem)] flex-col gap-fg-2 overflow-auto">
          <div className="flex items-center justify-between gap-fg-2">
            <span className="truncate text-label font-medium text-ink" title={title}>
              {title}
            </span>
            <div className="flex shrink-0 items-center gap-fg-1">
              {onCopyLink !== undefined && !orphanedPanel && (
                <IconButton label="Copy section link" onClick={onCopyLink}>
                  <Link size={14} aria-hidden />
                </IconButton>
              )}
              <IconButton label="Close comments" onClick={onClose}>
                <X size={14} aria-hidden />
              </IconButton>
            </div>
          </div>
          <Divider />

          {comments.length === 0 ? (
            <p className="py-fg-1 text-meta text-ink-muted">
              {orphanedPanel
                ? "No orphaned notes."
                : "No comments on this section yet."}
            </p>
          ) : (
            <div className="flex flex-col gap-fg-2">
              {comments.map((served) => (
                <CommentRow
                  key={served.comment.comment_id}
                  served={served}
                  actions={actions}
                  reanchorBlock={
                    orphanedPanel ? reanchorTarget(served, anchorIndex) : undefined
                  }
                />
              ))}
            </div>
          )}

          {block !== undefined && !orphanedPanel && (
            <>
              <Divider />
              {ambiguous ? (
                <p
                  className="rounded-fg-sm bg-paper-sunken px-fg-2 py-fg-2 text-meta text-ink-muted"
                  data-comment-ambiguous
                >
                  This document has more than one section with this heading, so a note
                  here couldn't be told apart from the others. Rename one of the
                  headings to comment on it.
                </p>
              ) : (
                <ComposeBox
                  block={block}
                  actions={actions}
                  actorReady={actorReady}
                  actorBootstrapping={actorBootstrapping}
                />
              )}
            </>
          )}
        </div>
      </Card>
    </Popover>
  );
}
