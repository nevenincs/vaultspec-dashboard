import {
  createActionConfirmationDescriptor,
  createCountMessageDescriptor,
  type ActionConfirmationDescriptor,
  type AnyMessageDescriptor,
  type CountMessageDescriptor,
  type DestructiveActionMessageDescriptor,
  type GuardedActionMessageDescriptor,
  type MessageDescriptor,
} from "../../../platform/localization/message";
import type { CommentOrphanEvidence } from "../authoringComments";
import type { ActorKind } from "./wireTypes";

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

const cancelLabel = descriptor("common:actions.cancel");
const deleteLabel = descriptor(
  "documents:destructiveActions.deleteComment",
) as DestructiveActionMessageDescriptor;
const moveLabel = descriptor(
  "documents:guardedActions.moveCommentToThisSection",
) as GuardedActionMessageDescriptor;

function destructiveConfirmation(
  input: Parameters<typeof createActionConfirmationDescriptor>[0],
): Extract<ActionConfirmationDescriptor, { readonly kind: "destructive" }> {
  const result = createActionConfirmationDescriptor(input);
  if (result === null || result.kind !== "destructive") throw new TypeError();
  return result;
}

export const COMMENT_DELETE_CONFIRMATION = destructiveConfirmation({
  kind: "destructive",
  title: descriptor("documents:viewer.comments.confirmations.delete.title"),
  body: descriptor("documents:viewer.comments.confirmations.delete.body"),
  confirmLabel: deleteLabel,
  cancelLabel,
});

export const COMMENT_ACTIONS = Object.freeze({
  add: descriptor("documents:viewer.comments.actions.add"),
  open: descriptor("documents:viewer.comments.actions.open"),
  edit: descriptor("documents:viewer.comments.actions.edit"),
  save: descriptor("documents:viewer.comments.actions.save"),
  cancel: cancelLabel,
  resolve: descriptor("documents:viewer.comments.actions.resolve"),
  reopen: descriptor("documents:viewer.comments.actions.reopen"),
  delete: deleteLabel,
  moveToThisSection: moveLabel,
  copyLink: descriptor("documents:viewer.comments.actions.copyLink"),
  close: descriptor("documents:viewer.comments.actions.close"),
  tryAgain: descriptor("documents:viewer.comments.actions.tryAgain"),
});

export const COMMENT_MESSAGES = Object.freeze({
  accessibility: Object.freeze({
    commentsToReview: descriptor(
      "documents:viewer.comments.accessibility.commentsToReview",
    ),
    editComment: descriptor("documents:viewer.comments.accessibility.editComment"),
    newComment: descriptor("documents:viewer.comments.accessibility.newComment"),
    sectionComments: descriptor(
      "documents:viewer.comments.accessibility.sectionComments",
    ),
  }),
  descriptions: Object.freeze({
    attachedToSection: descriptor(
      "documents:viewer.comments.descriptions.attachedToSection",
    ),
  }),
  disabledReasons: Object.freeze({
    actorPreparing: descriptor(
      "documents:viewer.comments.disabledReasons.actorPreparing",
    ),
    duplicateHeading: descriptor(
      "documents:viewer.comments.disabledReasons.duplicateHeading",
    ),
  }),
  emptyStates: Object.freeze({
    noComments: descriptor("documents:viewer.comments.emptyStates.noComments"),
    noCommentsToReview: descriptor(
      "documents:viewer.comments.emptyStates.noCommentsToReview",
    ),
  }),
  errors: Object.freeze({
    actorUnavailable: descriptor("documents:viewer.comments.errors.actorUnavailable"),
    loadFailed: descriptor("documents:viewer.comments.errors.loadFailed"),
  }),
  placeholders: Object.freeze({
    newComment: descriptor("documents:viewer.comments.placeholders.newComment"),
  }),
  states: Object.freeze({
    justNow: descriptor("documents:viewer.comments.states.justNow"),
    loading: descriptor("documents:viewer.comments.states.loading"),
    preparing: descriptor("documents:viewer.comments.states.preparing"),
    resolved: descriptor("documents:viewer.comments.states.resolved"),
  }),
});

const AUTHOR_KIND_DESCRIPTORS = Object.freeze({
  human: descriptor("documents:viewer.comments.authorKinds.human"),
  agent: descriptor("documents:viewer.comments.authorKinds.agent"),
  system: descriptor("documents:viewer.comments.authorKinds.system"),
  tool_executor: descriptor("documents:viewer.comments.authorKinds.toolExecutor"),
} as const satisfies Readonly<Record<ActorKind, MessageDescriptor>>);

const UNKNOWN_AUTHOR = descriptor("documents:viewer.comments.authorKinds.unknown");

export function commentAuthorKindDescriptor(value: unknown): MessageDescriptor {
  return typeof value === "string" && Object.hasOwn(AUTHOR_KIND_DESCRIPTORS, value)
    ? AUTHOR_KIND_DESCRIPTORS[value as ActorKind]
    : UNKNOWN_AUTHOR;
}

type CommentConnectionIssue = CommentOrphanEvidence["reason"];

const CONNECTION_ISSUE_DESCRIPTORS = Object.freeze({
  content_hash_mismatch: descriptor(
    "documents:viewer.comments.connectionIssues.changed",
  ),
  missing_anchor: descriptor("documents:viewer.comments.connectionIssues.missing"),
  ambiguous_anchor: descriptor("documents:viewer.comments.connectionIssues.ambiguous"),
  malformed_anchor: descriptor("documents:viewer.comments.connectionIssues.malformed"),
} as const satisfies Readonly<Record<CommentConnectionIssue, MessageDescriptor>>);

const UNKNOWN_CONNECTION_ISSUE = CONNECTION_ISSUE_DESCRIPTORS.malformed_anchor;

export function commentConnectionIssueDescriptor(value: unknown): MessageDescriptor {
  return typeof value === "string" && Object.hasOwn(CONNECTION_ISSUE_DESCRIPTORS, value)
    ? CONNECTION_ISSUE_DESCRIPTORS[value as CommentConnectionIssue]
    : UNKNOWN_CONNECTION_ISSUE;
}

export type CommentMutationKind =
  | "add"
  | "save"
  | "resolve"
  | "reopen"
  | "move"
  | "delete";

const SUCCESS_DESCRIPTORS = Object.freeze({
  add: descriptor("documents:viewer.comments.feedback.added"),
  save: descriptor("documents:viewer.comments.feedback.saved"),
  resolve: descriptor("documents:viewer.comments.feedback.resolved"),
  reopen: descriptor("documents:viewer.comments.feedback.reopened"),
  move: descriptor("documents:viewer.comments.feedback.moved"),
  delete: descriptor("documents:viewer.comments.feedback.deleted"),
} as const satisfies Readonly<Record<CommentMutationKind, MessageDescriptor>>);

export function commentSuccessDescriptor(
  operation: CommentMutationKind,
): MessageDescriptor {
  return SUCCESS_DESCRIPTORS[operation];
}

export type CommentFailureKind = CommentMutationKind | "copyLink" | "load";

const FAILURE_DESCRIPTORS = Object.freeze({
  add: descriptor("documents:viewer.comments.errors.addFailed"),
  save: descriptor("documents:viewer.comments.errors.saveFailed"),
  resolve: descriptor("documents:viewer.comments.errors.resolveFailed"),
  reopen: descriptor("documents:viewer.comments.errors.reopenFailed"),
  move: descriptor("documents:viewer.comments.errors.moveFailed"),
  delete: descriptor("documents:viewer.comments.errors.deleteFailed"),
  copyLink: descriptor("documents:viewer.comments.errors.copyLinkFailed"),
  load: descriptor("documents:viewer.comments.errors.loadFailed"),
} as const satisfies Readonly<Record<CommentFailureKind, MessageDescriptor>>);

export function commentFailureDescriptor(
  operation: CommentFailureKind,
): MessageDescriptor {
  return FAILURE_DESCRIPTORS[operation];
}

type CommentCountKey =
  | "documents:viewer.comments.counts.commentsToReview"
  | "documents:viewer.comments.counts.minutes"
  | "documents:viewer.comments.counts.hours"
  | "documents:viewer.comments.counts.days"
  | "documents:viewer.comments.counts.months"
  | "documents:viewer.comments.counts.years";

function countDescriptor(key: CommentCountKey, count: number): CountMessageDescriptor {
  return (
    createCountMessageDescriptor(key, count) ?? createCountMessageDescriptor(key, 0)!
  );
}

export function commentsToReviewCountDescriptor(count: number): CountMessageDescriptor {
  return countDescriptor("documents:viewer.comments.counts.commentsToReview", count);
}

export function commentRelativeTimeDescriptor(
  createdAtMs: unknown,
  nowMs: unknown = Date.now(),
): AnyMessageDescriptor {
  if (
    typeof createdAtMs !== "number" ||
    !Number.isFinite(createdAtMs) ||
    typeof nowMs !== "number" ||
    !Number.isFinite(nowMs)
  ) {
    return COMMENT_MESSAGES.states.justNow;
  }

  const seconds = Math.max(0, Math.round((nowMs - createdAtMs) / 1_000));
  if (seconds < 45) return COMMENT_MESSAGES.states.justNow;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return countDescriptor("documents:viewer.comments.counts.minutes", minutes);
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return countDescriptor("documents:viewer.comments.counts.hours", hours);
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return countDescriptor("documents:viewer.comments.counts.days", days);
  }
  const months = Math.round(days / 30);
  if (months < 12) {
    return countDescriptor("documents:viewer.comments.counts.months", months);
  }
  return countDescriptor(
    "documents:viewer.comments.counts.years",
    Math.round(months / 12),
  );
}
