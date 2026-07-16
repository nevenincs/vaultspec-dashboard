import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link, Link2, RotateCcw, Send, Trash2, X } from "lucide-react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import type {
  AnyMessageDescriptor,
  MessageDescriptor,
} from "../../platform/localization/message";
import type { ServedComment } from "../../stores/server/authoring";
import {
  COMMENT_ACTIONS,
  COMMENT_DELETE_CONFIRMATION,
  COMMENT_MESSAGES,
  commentAuthorKindDescriptor,
  commentConnectionIssueDescriptor,
  commentFailureDescriptor,
  commentRelativeTimeDescriptor,
  commentsToReviewCountDescriptor,
  commentSuccessDescriptor,
} from "../../stores/server/authoring/commentVocabulary";
import { ActionConfirmationDialog } from "../chrome/ActionConfirmationDialog";
import { Badge, Button, Card, Divider, IconButton, Popover } from "../kit";
import type { ReaderCommentActions } from "./readerComments";
import {
  headingPathKey,
  sectionSelectorForBlock,
  type CommentAnchorIndex,
  type HeadingBlock,
} from "./sectionAnchor";

type ResolveMessage = ReturnType<typeof useLocalizedMessageResolver>;

function localized(
  resolveMessage: ResolveMessage,
  descriptor: AnyMessageDescriptor,
): string | null {
  const result = resolveMessage(descriptor);
  return result.usedFallback ? null : result.message;
}

function reanchorTarget(
  served: ServedComment,
  anchorIndex: CommentAnchorIndex,
): HeadingBlock | undefined {
  const wanted = headingPathKey(served.comment.selector.heading_path);
  const matches: HeadingBlock[] = [];
  for (const [pluginPath, block] of anchorIndex.byPluginPath) {
    if (
      !anchorIndex.ambiguousPaths.has(pluginPath) &&
      headingPathKey(block.path) === wanted
    ) {
      matches.push(block);
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

interface FeedbackProps {
  descriptor: MessageDescriptor | null;
  resolveMessage: ResolveMessage;
}

function Feedback({ descriptor, resolveMessage }: FeedbackProps) {
  if (descriptor === null) return null;
  const message = localized(resolveMessage, descriptor);
  if (message === null) return null;
  return (
    <p role="status" className="text-meta text-ink-muted">
      {message}
    </p>
  );
}

interface CommentRowProps {
  served: ServedComment;
  actions: ReaderCommentActions;
  reanchorBlock?: HeadingBlock;
  /** Stage this comment into the agent composer's pending batch (feedback-loop ADR
   *  D6). Absent when no agent surface is mounted — the affordance then hides. */
  onSendToAgent?: () => void;
}

function CommentRow({
  served,
  actions,
  reanchorBlock,
  onSendToAgent,
}: CommentRowProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const { comment, orphaned } = served;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<MessageDescriptor | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const busyRef = useRef(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const restoreDeleteFocusRef = useRef(false);

  useEffect(() => {
    if (confirmDelete || !restoreDeleteFocusRef.current) return;
    const timer = setTimeout(() => {
      restoreDeleteFocusRef.current = false;
      deleteButtonRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  const author = localized(
    resolveMessage,
    commentAuthorKindDescriptor(comment.author.kind),
  );
  const time = localized(
    resolveMessage,
    commentRelativeTimeDescriptor(comment.created_at_ms),
  );
  const resolved = localized(resolveMessage, COMMENT_MESSAGES.states.resolved);
  const reopen = localized(resolveMessage, COMMENT_ACTIONS.reopen);
  const resolve = localized(resolveMessage, COMMENT_ACTIONS.resolve);
  const deleteComment = localized(resolveMessage, COMMENT_ACTIONS.delete);
  const editComment = localized(resolveMessage, COMMENT_ACTIONS.edit);
  const save = localized(resolveMessage, COMMENT_ACTIONS.save);
  const cancel = localized(resolveMessage, COMMENT_ACTIONS.cancel);
  const move = localized(resolveMessage, COMMENT_ACTIONS.moveToThisSection);
  // Resolved outside the required-copy bail below: a missing agent key must hide
  // only the send affordance, never the whole comment row.
  const sendToAgent = onSendToAgent
    ? localized(resolveMessage, { key: "common:agent.sendComment" })
    : null;
  const issue =
    orphaned && served.anchor.state === "orphaned"
      ? localized(
          resolveMessage,
          commentConnectionIssueDescriptor(served.anchor.evidence.reason),
        )
      : "";

  if (
    [
      author,
      time,
      resolved,
      reopen,
      resolve,
      deleteComment,
      editComment,
      save,
      cancel,
      move,
      issue,
    ].some((value) => value === null)
  ) {
    return null;
  }

  const run = async (
    operation: () => Promise<void>,
    success: MessageDescriptor,
    failure: MessageDescriptor,
    onSuccess?: () => void,
  ): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      await operation();
      onSuccess?.();
      setFeedback(success);
    } catch {
      setFeedback(failure);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const resolveOperation = comment.resolved ? "reopen" : "resolve";
  const closeDeleteConfirmation = () => {
    restoreDeleteFocusRef.current = true;
    setConfirmDelete(false);
  };

  return (
    <div className="flex flex-col gap-fg-1 rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-2">
      <div className="flex items-center justify-between gap-fg-2">
        <span className="flex items-center gap-fg-1 text-label text-ink-muted">
          <span>{author}</span>
          <span aria-hidden className="h-fg-2 w-px bg-rule" />
          <span>{time}</span>
        </span>
        <div className="flex items-center gap-fg-1">
          {comment.resolved && <Badge tone="neutral">{resolved}</Badge>}
          {onSendToAgent !== undefined && sendToAgent !== null && (
            <IconButton
              label={sendToAgent}
              data-comment-send-agent
              onClick={onSendToAgent}
              disabled={busy}
            >
              <Send size={14} aria-hidden />
            </IconButton>
          )}
          <IconButton
            label={comment.resolved ? reopen! : resolve!}
            onClick={() => {
              void run(
                () => actions.setResolved(comment.comment_id, !comment.resolved),
                commentSuccessDescriptor(resolveOperation),
                commentFailureDescriptor(resolveOperation),
              );
            }}
            disabled={busy}
          >
            {comment.resolved ? (
              <RotateCcw size={14} aria-hidden />
            ) : (
              <Check size={14} aria-hidden />
            )}
          </IconButton>
          <IconButton
            ref={deleteButtonRef}
            label={deleteComment!}
            onClick={() => {
              restoreDeleteFocusRef.current = false;
              setConfirmDelete(true);
            }}
            disabled={busy}
          >
            <Trash2 size={14} aria-hidden />
          </IconButton>
        </div>
      </div>

      {issue !== "" && (
        <div className="rounded-fg-xs bg-paper-sunken px-fg-2 py-fg-1 text-meta text-ink-muted">
          {issue}
          {reanchorBlock !== undefined && (
            <button
              type="button"
              className="ml-fg-2 inline-flex items-center gap-fg-1 font-medium text-accent-text underline-offset-2 hover:underline disabled:opacity-50"
              disabled={busy}
              onClick={() => {
                void run(
                  async () => {
                    const selector = await sectionSelectorForBlock(reanchorBlock);
                    await actions.reanchorComment(comment.comment_id, selector);
                  },
                  commentSuccessDescriptor("move"),
                  commentFailureDescriptor("move"),
                );
              }}
            >
              <Link2 size={12} aria-hidden />
              {move}
            </button>
          )}
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-fg-1">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={editComment!}
            rows={3}
            className="w-full resize-y rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
          />
          <div className="flex items-center gap-fg-2">
            <Button
              variant="secondary"
              disabled={busy || draft.trim().length === 0}
              onClick={() => {
                void run(
                  () => actions.editComment(comment.comment_id, draft.trim()),
                  commentSuccessDescriptor("save"),
                  commentFailureDescriptor("save"),
                  () => setEditing(false),
                );
              }}
            >
              {save}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
                setFeedback(null);
              }}
            >
              {cancel}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="whitespace-pre-wrap break-words text-left text-body text-ink hover:text-accent-text"
          title={editComment!}
          onClick={() => {
            setDraft(comment.body);
            setEditing(true);
            setFeedback(null);
          }}
        >
          {comment.body}
        </button>
      )}

      <Feedback descriptor={feedback} resolveMessage={resolveMessage} />
      <ActionConfirmationDialog
        open={confirmDelete}
        confirmation={COMMENT_DELETE_CONFIRMATION}
        onCancel={closeDeleteConfirmation}
        onConfirm={() => {
          closeDeleteConfirmation();
          void run(
            () => actions.deleteComment(comment.comment_id),
            commentSuccessDescriptor("delete"),
            commentFailureDescriptor("delete"),
          );
        }}
      />
    </div>
  );
}

interface ComposeBoxProps {
  block: HeadingBlock;
  actions: ReaderCommentActions;
  actorReady: boolean;
  actorBootstrapping: boolean;
}

function ComposeBox({
  block,
  actions,
  actorReady,
  actorBootstrapping,
}: ComposeBoxProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<MessageDescriptor | null>(null);
  const busyRef = useRef(false);
  const placeholder = localized(
    resolveMessage,
    COMMENT_MESSAGES.placeholders.newComment,
  );
  const fieldLabel = localized(
    resolveMessage,
    COMMENT_MESSAGES.accessibility.newComment,
  );
  const add = localized(resolveMessage, COMMENT_ACTIONS.add);
  const ready = localized(
    resolveMessage,
    COMMENT_MESSAGES.descriptions.attachedToSection,
  );
  const preparing = localized(resolveMessage, COMMENT_MESSAGES.states.preparing);
  const unavailable = localized(
    resolveMessage,
    COMMENT_MESSAGES.errors.actorUnavailable,
  );

  if (
    [placeholder, fieldLabel, add, ready, preparing, unavailable].some(
      (value) => value === null,
    )
  ) {
    return null;
  }

  const canSubmit = actorReady && !busy && draft.trim().length > 0;
  const submit = async (): Promise<void> => {
    if (!canSubmit || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const selector = await sectionSelectorForBlock(block);
      await actions.createComment(selector, draft.trim());
      setDraft("");
      setFeedback(commentSuccessDescriptor("add"));
    } catch {
      setFeedback(commentFailureDescriptor("add"));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-fg-1">
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder!}
        aria-label={fieldLabel!}
        rows={3}
        className="w-full resize-y rounded-fg-sm border border-rule bg-paper px-fg-2 py-fg-1 text-body text-ink outline-none focus-visible:border-accent"
      />
      <div className="flex items-center justify-between gap-fg-2">
        <span className="text-meta text-ink-muted">
          {actorReady ? ready : actorBootstrapping ? preparing : unavailable}
        </span>
        <Button variant="primary" disabled={!canSubmit} onClick={() => void submit()}>
          {add}
        </Button>
      </div>
      <Feedback descriptor={feedback} resolveMessage={resolveMessage} />
    </div>
  );
}

export interface CommentThreadPanelProps {
  block?: HeadingBlock;
  comments: ServedComment[];
  actions: ReaderCommentActions;
  anchorIndex: CommentAnchorIndex;
  actorReady: boolean;
  actorBootstrapping: boolean;
  ensureActor(): void;
  title: string;
  orphanedPanel?: boolean;
  onCopyLink?: () => void;
  /** Stage one comment into the agent composer's pending batch (feedback-loop ADR
   *  D6). Absent when no agent surface is available; the per-row affordance hides. */
  onSendToAgent?: (served: ServedComment) => void;
  ambiguous?: boolean;
  onClose(): void;
  className?: string;
}

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
  onSendToAgent,
  ambiguous = false,
  onClose,
  className,
}: CommentThreadPanelProps) {
  const resolveMessage = useLocalizedMessageResolver();
  const [feedback, setFeedback] = useState<MessageDescriptor | null>(null);
  const bootstrapActor = useCallback(() => {
    try {
      ensureActor();
    } catch {
      setFeedback(COMMENT_MESSAGES.errors.actorUnavailable);
    }
  }, [ensureActor]);

  useEffect(() => {
    if (!actorReady) bootstrapActor();
  }, [actorReady, bootstrapActor]);

  const dialogLabel = localized(
    resolveMessage,
    orphanedPanel
      ? COMMENT_MESSAGES.accessibility.commentsToReview
      : COMMENT_MESSAGES.accessibility.sectionComments,
  );
  const commentsToReview = localized(
    resolveMessage,
    commentsToReviewCountDescriptor(comments.length),
  );
  const copyLink = localized(resolveMessage, COMMENT_ACTIONS.copyLink);
  const close = localized(resolveMessage, COMMENT_ACTIONS.close);
  const noComments = localized(
    resolveMessage,
    orphanedPanel
      ? COMMENT_MESSAGES.emptyStates.noCommentsToReview
      : COMMENT_MESSAGES.emptyStates.noComments,
  );
  const duplicateHeading = localized(
    resolveMessage,
    COMMENT_MESSAGES.disabledReasons.duplicateHeading,
  );
  const copyFailure = localized(resolveMessage, commentFailureDescriptor("copyLink"));

  if (
    [
      dialogLabel,
      commentsToReview,
      copyLink,
      close,
      noComments,
      duplicateHeading,
      copyFailure,
    ].some((value) => value === null)
  ) {
    return null;
  }

  const panelTitle = orphanedPanel ? commentsToReview! : title;

  return (
    <Popover
      open
      onDismiss={onClose}
      role="dialog"
      aria-label={dialogLabel!}
      className={className}
      data-comment-thread
    >
      <Card elevation="overlay" padded>
        <div className="flex max-h-[24rem] w-80 max-w-[calc(100cqw-1.5rem)] flex-col gap-fg-2 overflow-auto">
          <div className="flex items-center justify-between gap-fg-2">
            <span
              className="truncate text-label font-medium text-ink"
              title={panelTitle}
            >
              {panelTitle}
            </span>
            <div className="flex shrink-0 items-center gap-fg-1">
              {onCopyLink !== undefined && !orphanedPanel && (
                <IconButton
                  label={copyLink!}
                  onClick={() => {
                    try {
                      onCopyLink();
                      setFeedback(null);
                    } catch {
                      setFeedback(commentFailureDescriptor("copyLink"));
                    }
                  }}
                >
                  <Link size={14} aria-hidden />
                </IconButton>
              )}
              <IconButton label={close!} onClick={onClose}>
                <X size={14} aria-hidden />
              </IconButton>
            </div>
          </div>
          <Divider />

          {comments.length === 0 ? (
            <p className="py-fg-1 text-meta text-ink-muted">{noComments}</p>
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
                  onSendToAgent={
                    onSendToAgent ? () => onSendToAgent(served) : undefined
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
                  {duplicateHeading}
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
          <Feedback descriptor={feedback} resolveMessage={resolveMessage} />
        </div>
      </Card>
    </Popover>
  );
}
