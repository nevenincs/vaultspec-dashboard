import {
  createActionConfirmationDescriptor,
  createCountMessageDescriptor,
  type ActionConfirmationDescriptor,
  type ActionConfirmationDescriptorInput,
  type CountMessageDescriptor,
  type DestructiveActionMessageDescriptor,
  type GuardedActionMessageDescriptor,
  type MessageDescriptor,
} from "../../../platform/localization/message";
import type { ReviewCommand, ReviewCommandFailureKind } from "./reviewStationOutcome";
import type {
  ActorKind,
  ApprovalRequirement,
  ChangesetStatus,
  OperationMode,
  ValidationStatus,
} from "./wireTypes";

const descriptor = <Key extends MessageDescriptor["key"]>(
  key: Key,
): MessageDescriptor<Key> => Object.freeze({ key });

const STATUS_DESCRIPTORS = Object.freeze({
  draft: descriptor("documents:reviewStation.statuses.draft"),
  generating: descriptor("documents:reviewStation.statuses.generating"),
  proposed: descriptor("documents:reviewStation.statuses.proposed"),
  needs_review: descriptor("documents:reviewStation.statuses.needsReview"),
  approved: descriptor("documents:reviewStation.statuses.approved"),
  applying: descriptor("documents:reviewStation.statuses.applying"),
  applied: descriptor("documents:reviewStation.statuses.applied"),
  partially_applied: descriptor("documents:reviewStation.statuses.partiallyApplied"),
  compensation_required: descriptor(
    "documents:reviewStation.statuses.compensationRequired",
  ),
  rejected: descriptor("documents:reviewStation.statuses.rejected"),
  conflicted: descriptor("documents:reviewStation.statuses.conflicted"),
  superseded: descriptor("documents:reviewStation.statuses.superseded"),
  failed: descriptor("documents:reviewStation.statuses.failed"),
  rollback_proposed: descriptor("documents:reviewStation.statuses.rollbackProposed"),
  cancelled: descriptor("documents:reviewStation.statuses.cancelled"),
} as const satisfies Readonly<Record<ChangesetStatus, MessageDescriptor>>);

const UNKNOWN_STATUS = descriptor("documents:reviewStation.statuses.unknown");

export function reviewStatusDescriptor(value: unknown): MessageDescriptor {
  return typeof value === "string" && Object.hasOwn(STATUS_DESCRIPTORS, value)
    ? STATUS_DESCRIPTORS[value as ChangesetStatus]
    : UNKNOWN_STATUS;
}

const cancelLabel = descriptor("common:actions.cancel");

function confirmation(
  input: Extract<ActionConfirmationDescriptorInput, { readonly kind: "guarded" }>,
): Extract<ActionConfirmationDescriptor, { readonly kind: "guarded" }>;
function confirmation(
  input: Extract<ActionConfirmationDescriptorInput, { readonly kind: "destructive" }>,
): Extract<ActionConfirmationDescriptor, { readonly kind: "destructive" }>;
function confirmation(
  input: ActionConfirmationDescriptorInput,
): ActionConfirmationDescriptor {
  const result = createActionConfirmationDescriptor(input);
  if (result === null || result.kind !== input.kind) throw new TypeError();
  return result;
}

export const REVIEW_CONFIRMATIONS = Object.freeze({
  approve: confirmation({
    kind: "guarded",
    title: descriptor("documents:reviewStation.confirmations.approve.title"),
    body: descriptor("documents:reviewStation.confirmations.approve.body"),
    confirmLabel: descriptor("documents:guardedActions.reviewStationApproveProposal"),
    cancelLabel,
  }),
  apply: confirmation({
    kind: "guarded",
    title: descriptor("documents:reviewStation.confirmations.apply.title"),
    body: descriptor("documents:reviewStation.confirmations.apply.body"),
    confirmLabel: descriptor("documents:guardedActions.reviewStationApplyChanges"),
    cancelLabel,
  }),
  reject: confirmation({
    kind: "destructive",
    title: descriptor("documents:reviewStation.confirmations.reject.title"),
    body: descriptor("documents:reviewStation.confirmations.reject.body"),
    confirmLabel: descriptor(
      "documents:destructiveActions.reviewStationRejectProposal",
    ),
    cancelLabel,
  }),
  rollback: confirmation({
    kind: "guarded",
    title: descriptor("documents:reviewStation.confirmations.rollback.title"),
    body: descriptor("documents:reviewStation.confirmations.rollback.body"),
    confirmLabel: descriptor("documents:guardedActions.reviewStationPrepareRollback"),
    cancelLabel,
  }),
});

interface DirectReviewCommandPresentation {
  readonly kind: "direct";
  readonly command: "submit_for_review";
  readonly label: MessageDescriptor;
  readonly confirmation?: never;
}

type GuardedReviewCommand = "approve" | "request_apply" | "create_rollback";
type GuardedReviewCommandPresentation = {
  [Command in GuardedReviewCommand]: {
    readonly kind: "guarded";
    readonly command: Command;
    readonly label: GuardedActionMessageDescriptor;
    readonly confirmation: Extract<
      ActionConfirmationDescriptor,
      { readonly kind: "guarded" }
    >;
  };
}[GuardedReviewCommand];

interface DestructiveReviewCommandPresentation {
  readonly kind: "destructive";
  readonly command: "reject";
  readonly label: DestructiveActionMessageDescriptor;
  readonly confirmation: Extract<
    ActionConfirmationDescriptor,
    { readonly kind: "destructive" }
  >;
}

interface UnavailableReviewCommandPresentation {
  readonly kind: "unavailable";
  readonly command: null;
  readonly label: MessageDescriptor;
  readonly confirmation: null;
}

export type ReviewCommandPresentation =
  | DirectReviewCommandPresentation
  | GuardedReviewCommandPresentation
  | DestructiveReviewCommandPresentation
  | UnavailableReviewCommandPresentation;

const COMMAND_PRESENTATION = Object.freeze({
  approve: Object.freeze({
    kind: "guarded",
    command: "approve",
    label: descriptor("documents:guardedActions.reviewStationApproveProposal"),
    confirmation: REVIEW_CONFIRMATIONS.approve,
  }),
  reject: Object.freeze({
    kind: "destructive",
    command: "reject",
    label: descriptor("documents:destructiveActions.reviewStationRejectProposal"),
    confirmation: REVIEW_CONFIRMATIONS.reject,
  }),
  submit_for_review: Object.freeze({
    kind: "direct",
    command: "submit_for_review",
    label: descriptor("documents:reviewStation.actions.submitForReview"),
  }),
  request_apply: Object.freeze({
    kind: "guarded",
    command: "request_apply",
    label: descriptor("documents:guardedActions.reviewStationApplyChanges"),
    confirmation: REVIEW_CONFIRMATIONS.apply,
  }),
  create_rollback: Object.freeze({
    kind: "guarded",
    command: "create_rollback",
    label: descriptor("documents:guardedActions.reviewStationPrepareRollback"),
    confirmation: REVIEW_CONFIRMATIONS.rollback,
  }),
} as const satisfies Readonly<Record<ReviewCommand, ReviewCommandPresentation>>);

const UNKNOWN_COMMAND = Object.freeze({
  kind: "unavailable",
  command: null,
  label: descriptor("documents:reviewStation.labels.actionUnavailable"),
  confirmation: null,
} satisfies ReviewCommandPresentation);

export function reviewCommandPresentation(value: unknown): ReviewCommandPresentation {
  return typeof value === "string" && Object.hasOwn(COMMAND_PRESENTATION, value)
    ? COMMAND_PRESENTATION[value as ReviewCommand]
    : UNKNOWN_COMMAND;
}

const POLICY_DESCRIPTORS = Object.freeze({
  manual: Object.freeze({
    human_approval_required: descriptor(
      "documents:reviewStation.policy.manualHumanApproval",
    ),
    system_auto_approvable: descriptor(
      "documents:reviewStation.policy.manualSystemApproval",
    ),
  }),
  assisted: Object.freeze({
    human_approval_required: descriptor(
      "documents:reviewStation.policy.assistedHumanApproval",
    ),
    system_auto_approvable: descriptor(
      "documents:reviewStation.policy.assistedSystemApproval",
    ),
  }),
  autonomous: Object.freeze({
    human_approval_required: descriptor(
      "documents:reviewStation.policy.autonomousHumanApproval",
    ),
    system_auto_approvable: descriptor(
      "documents:reviewStation.policy.autonomousSystemApproval",
    ),
  }),
} as const satisfies Readonly<
  Record<OperationMode, Readonly<Record<ApprovalRequirement, MessageDescriptor>>>
>);

const UNKNOWN_POLICY = descriptor("documents:reviewStation.policy.unavailable");

export function reviewPolicyDescriptor(
  mode: unknown,
  requirement: unknown,
): MessageDescriptor {
  if (
    typeof mode !== "string" ||
    !Object.hasOwn(POLICY_DESCRIPTORS, mode) ||
    typeof requirement !== "string" ||
    !Object.hasOwn(POLICY_DESCRIPTORS[mode as OperationMode], requirement)
  ) {
    return UNKNOWN_POLICY;
  }
  return POLICY_DESCRIPTORS[mode as OperationMode][requirement as ApprovalRequirement];
}

const AUTHOR_KIND_DESCRIPTORS = Object.freeze({
  human: descriptor("documents:reviewStation.authorKinds.human"),
  agent: descriptor("documents:reviewStation.authorKinds.agent"),
  system: descriptor("documents:reviewStation.authorKinds.system"),
  tool_executor: descriptor("documents:reviewStation.authorKinds.toolExecutor"),
} as const satisfies Readonly<Record<ActorKind, MessageDescriptor>>);

const UNKNOWN_AUTHOR = descriptor("documents:reviewStation.authorKinds.unknown");

export function reviewAuthorKindDescriptor(value: unknown): MessageDescriptor {
  return typeof value === "string" && Object.hasOwn(AUTHOR_KIND_DESCRIPTORS, value)
    ? AUTHOR_KIND_DESCRIPTORS[value as ActorKind]
    : UNKNOWN_AUTHOR;
}

const VALIDATION_DESCRIPTORS = Object.freeze({
  valid: descriptor("documents:reviewStation.validation.valid"),
  valid_with_warnings: descriptor(
    "documents:reviewStation.validation.validWithWarnings",
  ),
  invalid: descriptor("documents:reviewStation.validation.invalid"),
  stale: descriptor("documents:reviewStation.validation.stale"),
} as const satisfies Readonly<Record<ValidationStatus, MessageDescriptor>>);

const UNKNOWN_VALIDATION = descriptor("documents:reviewStation.validation.unavailable");

export function reviewValidationDescriptor(value: unknown): MessageDescriptor {
  return typeof value === "string" && Object.hasOwn(VALIDATION_DESCRIPTORS, value)
    ? VALIDATION_DESCRIPTORS[value as ValidationStatus]
    : UNKNOWN_VALIDATION;
}

export function reviewStaleDescriptor(reason: unknown): MessageDescriptor {
  return reason === "policy_version_changed"
    ? descriptor("documents:reviewStation.stale.policyChanged")
    : descriptor("documents:reviewStation.stale.reviewChanged");
}

const FAILURE_DESCRIPTORS = Object.freeze({
  reviewChanged: descriptor("documents:reviewStation.feedback.reviewChanged"),
  reviewUnavailable: descriptor("documents:reviewStation.errors.queueUnavailable"),
  reviewerUnavailable: descriptor(
    "documents:reviewStation.feedback.reviewerUnavailable",
  ),
  actionFailed: descriptor("documents:reviewStation.errors.actionFailed"),
} as const satisfies Readonly<Record<ReviewCommandFailureKind, MessageDescriptor>>);

export function reviewFailureDescriptor(
  failure: ReviewCommandFailureKind,
): MessageDescriptor {
  return FAILURE_DESCRIPTORS[failure];
}

export const REVIEW_STATION_MESSAGES = Object.freeze({
  loadingQueue: descriptor("documents:reviewStation.accessibility.loadingQueue"),
  showChanges: descriptor("documents:reviewStation.actions.showChanges"),
  hideChanges: descriptor("documents:reviewStation.actions.hideChanges"),
  signIn: descriptor("documents:reviewStation.actions.signInAsReviewer"),
  signOut: descriptor("documents:reviewStation.actions.signOut"),
  signInToAct: descriptor("documents:reviewStation.disabledReasons.signInToAct"),
  actionInProgress: descriptor(
    "documents:reviewStation.disabledReasons.actionInProgress",
  ),
  actionUnavailable: descriptor(
    "documents:reviewStation.disabledReasons.actionUnavailable",
  ),
  rollbackUnavailable: descriptor(
    "documents:reviewStation.disabledReasons.rollbackUnavailable",
  ),
  actionAccepted: descriptor("documents:reviewStation.feedback.actionAccepted"),
  actionNotAllowed: descriptor("documents:reviewStation.feedback.actionNotAllowed"),
  rollbackRefused: descriptor("documents:reviewStation.feedback.rollbackUnavailable"),
  conflict: descriptor("documents:reviewStation.errors.conflict"),
  queueUnavailable: descriptor("documents:reviewStation.errors.queueUnavailable"),
  appliedAutomatically: descriptor(
    "documents:reviewStation.states.appliedAutomatically",
  ),
  empty: descriptor("documents:reviewStation.states.empty"),
  informationMayBeOutOfDate: descriptor(
    "documents:reviewStation.states.informationMayBeOutOfDate",
  ),
  loading: descriptor("documents:reviewStation.states.loading"),
  moreAppliedChanges: descriptor("documents:reviewStation.states.moreAppliedChanges"),
  moreProposals: descriptor("documents:reviewStation.states.moreProposals"),
  signedIn: descriptor("documents:reviewStation.states.signedIn"),
  signingIn: descriptor("documents:reviewStation.states.signingIn"),
  untitledProposal: descriptor("documents:reviewStation.states.untitledProposal"),
  appliedAutomaticallySection: descriptor(
    "documents:reviewStation.sections.appliedAutomatically",
  ),
});

function countDescriptor(
  key:
    | "documents:reviewStation.counts.changes"
    | "documents:reviewStation.counts.acknowledgements",
  count: number,
): CountMessageDescriptor {
  return (
    createCountMessageDescriptor(key, count) ?? createCountMessageDescriptor(key, 0)!
  );
}

export function reviewChangeCountDescriptor(count: number): CountMessageDescriptor {
  return countDescriptor("documents:reviewStation.counts.changes", count);
}

export function reviewAcknowledgementCountDescriptor(
  count: number,
): CountMessageDescriptor {
  return countDescriptor("documents:reviewStation.counts.acknowledgements", count);
}
