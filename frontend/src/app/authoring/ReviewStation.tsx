import { useState } from "react";

import { useLocalizedMessageResolver } from "../../platform/localization/LocalizationProvider";
import {
  normalizeReviewCommandOutcome,
  reviewAcknowledgementCountDescriptor,
  reviewAuthorKindDescriptor,
  reviewChangeCountDescriptor,
  reviewCommand,
  reviewCommandFailureKind,
  reviewCommandPresentation,
  reviewFailureDescriptor,
  reviewPolicyDescriptor,
  reviewStaleDescriptor,
  reviewStatusDescriptor,
  reviewValidationDescriptor,
  REVIEW_STATION_MESSAGES,
  useApplyChangeset,
  useCreateRollback,
  useReviewDecision,
  useReviewStationView,
  useSubmitForReview,
  type ActionEligibility,
  type AppliedUnderPolicyProjection,
  type AuthoringCommandOutcome,
  type ProposalProjection,
  type ReviewCommand,
  type ReviewStationView,
} from "../../stores/server/authoring";
import { Badge, Button, SectionLabel, Skeleton, SkeletonRow, StateBlock } from "../kit";
import { ActionConfirmationDialog } from "../chrome/ActionConfirmationDialog";
import { DiffPanel } from "./DiffPanel";

type ResolveMessage = ReturnType<typeof useLocalizedMessageResolver>;

function safeMessage(
  resolveMessage: ResolveMessage,
  descriptor: Parameters<ResolveMessage>[0],
): string | null {
  const result = resolveMessage(descriptor);
  return result.usedFallback ? null : result.message;
}

export interface ReviewActions {
  decide(
    proposal: ProposalProjection,
    decision: "approve" | "reject",
  ): Promise<AuthoringCommandOutcome>;
  submit(proposal: ProposalProjection): Promise<AuthoringCommandOutcome>;
  apply(proposal: ProposalProjection): Promise<AuthoringCommandOutcome>;
  rollback(proposal: ProposalProjection): Promise<AuthoringCommandOutcome>;
}

function useReviewActions(): ReviewActions {
  const decision = useReviewDecision();
  const submit = useSubmitForReview();
  const apply = useApplyChangeset();
  const rollback = useCreateRollback();
  return {
    decide: (proposal, kind) =>
      decision.mutateAsync({
        approvalId: proposal.approval.approval_id ?? "",
        payload: {
          proposal_id: proposal.approval.proposal_id ?? "",
          approval_id: proposal.approval.approval_id ?? "",
          decision: kind,
          reviewed_revision:
            proposal.approval.reviewed_proposal_revision ?? proposal.changeset_revision,
        },
      }),
    submit: (proposal) =>
      submit.mutateAsync({
        changesetId: proposal.changeset_id,
        payload: {
          expected_revision: proposal.changeset_revision,
          summary: proposal.summary,
        },
      }),
    apply: (proposal) =>
      apply.mutateAsync({
        changeset_id: proposal.changeset_id,
        approval_id: proposal.approval.approval_id ?? "",
      }),
    rollback: (proposal) =>
      rollback.mutateAsync({
        source_changeset_id: proposal.changeset_id,
        source_children: proposal.rollback.child_key
          ? [{ source_child_key: proposal.rollback.child_key }]
          : [],
        reason: "reviewer-initiated rollback",
      }),
  };
}

type CardFeedback = {
  tone: "refused" | "error" | "accepted";
  descriptor: ReturnType<typeof reviewFailureDescriptor>;
} | null;

type PendingConfirmation = {
  command: Exclude<ReviewCommand, "submit_for_review">;
  proposal: ProposalProjection;
};

type AppliedPolicyMeta = Pick<AppliedUnderPolicyProjection, "acknowledgement_count">;

function outcomeFeedback(
  outcome: AuthoringCommandOutcome,
): Exclude<CardFeedback, null> | null {
  const normalized = normalizeReviewCommandOutcome(outcome);
  if (normalized.kind === "accepted" || normalized.kind === "inFlight") {
    return {
      tone: "accepted",
      descriptor: REVIEW_STATION_MESSAGES.actionAccepted,
    };
  }
  return normalized.reason === "rollbackUnavailable"
    ? { tone: "refused", descriptor: REVIEW_STATION_MESSAGES.rollbackRefused }
    : { tone: "refused", descriptor: REVIEW_STATION_MESSAGES.actionNotAllowed };
}

function ActionButton({
  eligibility,
  command,
  label,
  busy,
  variant,
  resolveMessage,
  onRun,
}: {
  eligibility: ActionEligibility;
  command: ReviewCommand;
  label: string;
  busy: boolean;
  variant: "primary" | "secondary" | "danger";
  resolveMessage: ResolveMessage;
  onRun: () => void;
}) {
  // Provenance is ambient (ADR D5): the mutation itself mints the actor token on
  // first use, so a review action is gated ONLY by served eligibility — never by
  // a client-side identity check. There is no sign-in wall before acting.
  const blockedByBackend = !eligibility.allowed;
  const disabled = busy || blockedByBackend;
  const titleDescriptor = busy
    ? REVIEW_STATION_MESSAGES.actionInProgress
    : blockedByBackend
      ? REVIEW_STATION_MESSAGES.actionUnavailable
      : null;
  const title = titleDescriptor
    ? safeMessage(resolveMessage, titleDescriptor)
    : undefined;
  if (titleDescriptor && !title) return null;

  return (
    <Button
      variant={variant}
      disabled={disabled}
      title={title ?? undefined}
      onClick={onRun}
      data-action={command}
      data-allowed={eligibility.allowed}
    >
      {label}
    </Button>
  );
}

export function ProposalCard({
  proposal,
  actions,
  appliedPolicy,
}: {
  proposal: ProposalProjection;
  actions: ReviewActions;
  appliedPolicy?: AppliedPolicyMeta;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<CardFeedback>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  const status = safeMessage(resolveMessage, reviewStatusDescriptor(proposal.status));
  const author = safeMessage(
    resolveMessage,
    reviewAuthorKindDescriptor(proposal.origin_actor.kind),
  );
  const changes = safeMessage(
    resolveMessage,
    reviewChangeCountDescriptor(proposal.operation_count),
  );
  const untitled = safeMessage(
    resolveMessage,
    REVIEW_STATION_MESSAGES.untitledProposal,
  );
  const showChanges = safeMessage(resolveMessage, REVIEW_STATION_MESSAGES.showChanges);
  const hideChanges = safeMessage(resolveMessage, REVIEW_STATION_MESSAGES.hideChanges);
  const policy = proposal.policy
    ? safeMessage(
        resolveMessage,
        reviewPolicyDescriptor(
          proposal.policy.effective_mode,
          proposal.policy.requirement,
        ),
      )
    : null;
  const validation =
    proposal.validation.present && proposal.validation.status
      ? safeMessage(
          resolveMessage,
          reviewValidationDescriptor(proposal.validation.status),
        )
      : null;
  const stale =
    proposal.approval.stale || proposal.approval.stale_reason
      ? safeMessage(
          resolveMessage,
          reviewStaleDescriptor(proposal.approval.stale_reason),
        )
      : null;
  const conflict = proposal.conflict
    ? safeMessage(resolveMessage, REVIEW_STATION_MESSAGES.conflict)
    : null;
  const appliedAutomatically = appliedPolicy
    ? safeMessage(resolveMessage, REVIEW_STATION_MESSAGES.appliedAutomatically)
    : null;
  const acknowledgements =
    appliedPolicy && appliedPolicy.acknowledgement_count > 0
      ? safeMessage(
          resolveMessage,
          reviewAcknowledgementCountDescriptor(appliedPolicy.acknowledgement_count),
        )
      : null;

  if (
    !status ||
    !author ||
    !changes ||
    !untitled ||
    !showChanges ||
    !hideChanges ||
    (proposal.policy && !policy) ||
    (proposal.validation.present && proposal.validation.status && !validation) ||
    ((proposal.approval.stale || proposal.approval.stale_reason) && !stale) ||
    (proposal.conflict && !conflict) ||
    (appliedPolicy && !appliedAutomatically) ||
    (appliedPolicy && appliedPolicy.acknowledgement_count > 0 && !acknowledgements)
  ) {
    return null;
  }

  const run = async (fn: () => Promise<AuthoringCommandOutcome>) => {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(outcomeFeedback(await fn()));
    } catch (error) {
      setFeedback({
        tone: "error",
        descriptor: reviewFailureDescriptor(reviewCommandFailureKind(error)),
      });
    } finally {
      setBusy(false);
    }
  };

  const hasApprovalIdentity =
    !!proposal.approval.approval_id && !!proposal.approval.proposal_id;

  const variantFor = (command: ReviewCommand): "primary" | "secondary" | "danger" =>
    command === "reject" ? "danger" : command === "approve" ? "primary" : "secondary";

  const runCommand = (command: ReviewCommand, target: ProposalProjection) => {
    switch (command) {
      case "approve":
        return run(() => actions.decide(target, "approve"));
      case "reject":
        return run(() => actions.decide(target, "reject"));
      case "submit_for_review":
        return run(() => actions.submit(target));
      case "request_apply":
        return run(() => actions.apply(target));
      case "create_rollback":
        return run(() => actions.rollback(target));
    }
  };

  const eligibilityForRender = proposal.eligibility.flatMap((entry) => {
    const command = reviewCommand(entry.command);
    if (!command || command === "create_rollback") return [];
    if (
      (command === "approve" || command === "reject" || command === "request_apply") &&
      !hasApprovalIdentity
    ) {
      return [];
    }
    const presentation = reviewCommandPresentation(command);
    if (presentation.kind === "unavailable" || presentation.command === null) {
      return [];
    }
    const label = safeMessage(resolveMessage, presentation.label);
    return label ? [{ entry, command: presentation.command, label, presentation }] : [];
  });

  const feedbackMessage = feedback
    ? safeMessage(resolveMessage, feedback.descriptor)
    : null;
  if (feedback && !feedbackMessage) return null;

  const pendingPresentation = pending
    ? reviewCommandPresentation(pending.command)
    : null;
  const confirmation = pendingPresentation?.confirmation
    ? pendingPresentation.confirmation
    : null;
  if (pending && !confirmation) return null;

  return (
    <li
      className="flex flex-col gap-fg-2 rounded-fg-sm border border-rule bg-paper-raised px-fg-2 py-fg-2"
      data-proposal
      data-changeset-id={proposal.changeset_id}
      data-status={proposal.status}
    >
      <div className="flex items-start gap-fg-2">
        <span
          className="min-w-0 flex-1 text-body font-medium text-ink"
          title={proposal.summary || untitled}
        >
          {proposal.summary || untitled}
        </span>
        <Badge>{status}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-fg-2 text-meta text-ink-muted">
        <span data-proposal-author>{author}</span>
        <span data-proposal-ops>{changes}</span>
        {policy && <span data-proposal-policy>{policy}</span>}
        {appliedAutomatically && (
          <span data-applied-policy>{appliedAutomatically}</span>
        )}
        {acknowledgements && <span data-applied-policy-ack>{acknowledgements}</span>}
        {validation && <span data-proposal-validation>{validation}</span>}
        {stale && (
          <span className="text-state-stale" data-proposal-stale>
            {stale}
          </span>
        )}
      </div>

      {conflict && <StateBlock mode="degraded" layout="inline" message={conflict} />}

      <div className="flex flex-wrap items-center gap-fg-2">
        {eligibilityForRender.map(({ entry, command, label, presentation }) => (
          <ActionButton
            key={command}
            eligibility={entry}
            command={command}
            label={label}
            busy={busy}
            variant={variantFor(command)}
            resolveMessage={resolveMessage}
            onRun={() => {
              if (presentation.kind === "direct") {
                void runCommand(presentation.command, proposal);
              } else {
                setPending({ command: presentation.command, proposal });
              }
            }}
          />
        ))}
        {proposal.rollback.available &&
          (() => {
            const presentation = reviewCommandPresentation("create_rollback");
            const label = safeMessage(resolveMessage, presentation.label);
            const title = busy
              ? safeMessage(resolveMessage, REVIEW_STATION_MESSAGES.actionInProgress)
              : undefined;
            if (!label || (busy && !title)) return null;
            return (
              <Button
                variant="secondary"
                disabled={busy}
                title={title ?? undefined}
                onClick={() => setPending({ command: "create_rollback", proposal })}
                data-action="create_rollback"
              >
                {label}
              </Button>
            );
          })()}
        <Button
          variant="ghost"
          onClick={() => setShowDiff((open) => !open)}
          aria-expanded={showDiff}
          data-toggle-diff
        >
          {showDiff ? hideChanges : showChanges}
        </Button>
      </div>

      {showDiff && <DiffPanel changesetId={proposal.changeset_id} />}

      {feedbackMessage && feedback && (
        <p
          className={`text-meta ${feedback.tone === "error" ? "text-diff-remove" : "text-ink-muted"}`}
          role="status"
          data-card-feedback={feedback.tone}
        >
          {feedbackMessage}
        </p>
      )}

      {confirmation && pending && (
        <ActionConfirmationDialog
          open
          confirmation={confirmation}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const target = pending;
            setPending(null);
            void runCommand(target.command, target.proposal);
          }}
        />
      )}
    </li>
  );
}

export function AppliedUnderPolicyLane({
  items,
  actions,
}: {
  items: AppliedUnderPolicyProjection[];
  actions: ReviewActions;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  if (items.length === 0) return null;
  const section = safeMessage(
    resolveMessage,
    REVIEW_STATION_MESSAGES.appliedAutomaticallySection,
  );
  if (!section) return null;
  return (
    <section className="flex flex-col gap-fg-2" data-after-fact-lane>
      <SectionLabel count={items.length}>{section}</SectionLabel>
      <ul className="flex flex-col gap-fg-2" role="list" data-after-fact-list>
        {items.map((item) => (
          <ProposalCard
            key={`${item.proposal.changeset_id}:${item.applied_at_ms}`}
            proposal={item.proposal}
            actions={actions}
            appliedPolicy={item}
          />
        ))}
      </ul>
    </section>
  );
}

export function ReviewStationBody({
  view,
  actions,
}: {
  view: ReviewStationView;
  actions: ReviewActions;
}) {
  const resolveMessage = useLocalizedMessageResolver();
  const queueUnavailable = safeMessage(
    resolveMessage,
    REVIEW_STATION_MESSAGES.queueUnavailable,
  );
  const loading = safeMessage(resolveMessage, REVIEW_STATION_MESSAGES.loading);
  const loadingQueue = safeMessage(
    resolveMessage,
    REVIEW_STATION_MESSAGES.loadingQueue,
  );
  const empty = safeMessage(resolveMessage, REVIEW_STATION_MESSAGES.empty);
  const moreProposals = safeMessage(
    resolveMessage,
    REVIEW_STATION_MESSAGES.moreProposals,
  );
  const moreAppliedChanges = safeMessage(
    resolveMessage,
    REVIEW_STATION_MESSAGES.moreAppliedChanges,
  );
  const informationMayBeOutOfDate = safeMessage(
    resolveMessage,
    REVIEW_STATION_MESSAGES.informationMayBeOutOfDate,
  );
  if (
    !queueUnavailable ||
    !loading ||
    !loadingQueue ||
    !empty ||
    !moreProposals ||
    !moreAppliedChanges ||
    !informationMayBeOutOfDate
  ) {
    return null;
  }

  if (view.storeUnavailable) {
    return <StateBlock mode="degraded" message={queueUnavailable} />;
  }
  if (view.loading) {
    return (
      <Skeleton label={loadingQueue}>
        <span className="sr-only">{loading}</span>
        <SkeletonRow width="w-2/3" boxed />
        <SkeletonRow width="w-1/2" boxed />
      </Skeleton>
    );
  }
  if (view.empty) {
    return <StateBlock mode="empty" message={empty} />;
  }
  return (
    <>
      {view.degraded && view.availabilityIssue === "informationMayBeOutOfDate" && (
        <StateBlock
          mode="degraded"
          layout="inline"
          message={informationMayBeOutOfDate}
        />
      )}
      {view.rows.length > 0 && (
        <ul className="flex flex-col gap-fg-2" role="list" data-proposal-list>
          {view.rows.map((proposal) => (
            <ProposalCard
              key={proposal.changeset_id}
              proposal={proposal}
              actions={actions}
            />
          ))}
        </ul>
      )}
      <AppliedUnderPolicyLane items={view.afterFactRows} actions={actions} />
      {view.truncated && (
        <StateBlock mode="degraded" layout="inline" message={moreProposals} />
      )}
      {view.afterFactTruncated && (
        <StateBlock mode="degraded" layout="inline" message={moreAppliedChanges} />
      )}
    </>
  );
}

export function ReviewStationSection() {
  const view = useReviewStationView();
  const actions = useReviewActions();
  // No identity affordance: provenance is ambient (ADR D5). The review actions
  // mint the actor token transparently on first use, so the queue renders and
  // every decision is reachable with zero prior editing and no sign-in surface.
  return (
    <div className="flex flex-col gap-fg-3 text-body" data-review-station>
      <ReviewStationBody view={view} actions={actions} />
    </div>
  );
}
