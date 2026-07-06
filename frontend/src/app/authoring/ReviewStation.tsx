// The review station — the thin, human-in-the-loop review surface for agentic
// authoring proposals (agentic plan W03.P40, Increment 1). The walking skeleton
// "is not done until a human can click deny": this surface renders the backend-
// served proposal queue and lets a reviewer approve/reject (and apply/roll back)
// each proposal.
//
// Layer ownership (architecture-boundaries / views-are-projections): this is a
// DUMB app-chrome view. It consumes the authoring STORE hooks exclusively
// (`useReviewStationView`, `useReviewDecision`, …) — it fetches nothing, never
// inspects the raw `tiers` block (degradation arrives interpreted on the view),
// and defines no client model. Button ENABLEMENT is the backend-served
// `eligibility` (rendered directly, never re-derived from events —
// review-station-state-is-backend-served). A DENIAL is a VALUE the store returns
// (denials-are-values): the surface renders it as an inline "can’t do that +
// reason", never an error toast.
//
// Design system (design-system-is-centralized): every control resolves to a kit
// primitive (Button / Badge / StateBlock / Skeleton / SectionLabel) over bound
// tokens — no raw hex, no loose sizes. Labels are plain user-facing language
// (labels-are-user-facing): the wire status/command tokens map to reworded
// labels here; internal ids stay off-screen.

import { useState } from "react";

import {
  setActorToken,
  useApplyChangeset,
  useCreateRollback,
  useHasActorToken,
  useIssueActorToken,
  useReviewDecision,
  useReviewStationView,
  useSubmitForReview,
  type ActionEligibility,
  type AuthoringCommandOutcome,
  type ChangesetStatus,
  type ProposalProjection,
  type ReviewStationView,
} from "../../stores/server/authoring";
import { Badge, Button, SectionLabel, Skeleton, SkeletonRow, StateBlock } from "../kit";

// The reviewer principal the bootstrap provisions — a HUMAN actor distinct from
// any agent author (the automated-self-approval ban is a real gate the reviewer
// must clear by being a different, human, principal; security-provenance ADR).
const REVIEWER_ACTOR = { id: "human:reviewer", kind: "human" as const };

/** Wire status token → plain label. Frontend maps only presentation
 *  (display-state-is-backend-served); the served token stays authoritative. */
const STATUS_LABEL: Record<ChangesetStatus, string> = {
  draft: "Draft",
  generating: "Generating",
  proposed: "Proposed",
  needs_review: "Needs review",
  approved: "Approved",
  applying: "Applying",
  applied: "Applied",
  partially_applied: "Partially applied",
  compensation_required: "Needs repair",
  rejected: "Rejected",
  conflicted: "Conflicted",
  superseded: "Superseded",
  failed: "Failed",
  rollback_proposed: "Rollback proposed",
  cancelled: "Cancelled",
};

/** Wire command token → plain button label. */
const COMMAND_LABEL: Record<string, string> = {
  approve: "Approve",
  reject: "Reject",
  submit_for_review: "Submit for review",
  request_apply: "Apply",
  create_rollback: "Roll back",
};

function statusLabel(status: ChangesetStatus): string {
  return STATUS_LABEL[status] ?? status;
}

function commandLabel(command: string): string {
  return COMMAND_LABEL[command] ?? command;
}

// --- reviewer identity ----------------------------------------------------------

/** The reviewer identity control: bootstrap a per-principal actor token (the
 *  human-reviewer credential every command presents), or show the signed-in
 *  reviewer with a sign-out. Without it, no command can resolve a principal. */
function ReviewerIdentity() {
  const hasToken = useHasActorToken();
  const issue = useIssueActorToken();

  if (hasToken) {
    return (
      <div className="flex items-center gap-fg-2 text-meta text-ink-muted">
        <span data-reviewer-signed-in>Signed in as reviewer</span>
        <Button
          variant="ghost"
          onClick={() => setActorToken(null)}
          data-reviewer-signout
        >
          Sign out
        </Button>
      </div>
    );
  }
  return (
    <Button
      variant="secondary"
      disabled={issue.isPending}
      onClick={() => issue.mutate({ actor: REVIEWER_ACTOR })}
      data-reviewer-signin
    >
      {issue.isPending ? "Signing in…" : "Sign in as reviewer"}
    </Button>
  );
}

// --- per-proposal review actions ------------------------------------------------

/** The bundle of review commands a proposal card dispatches. Each returns the
 *  interpreted outcome (denials are VALUES — a refusal resolves, never throws;
 *  only a genuine fault throws). */
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
        // Identity comes from the served projection (never a frontend-recomputed
        // backend hash). The card only renders these buttons once it is present.
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

/** The inline feedback a command leaves on a card: a denial/unavailable VALUE
 *  (rendered as a refusal + reason, not an error), or a genuine fault. */
type CardFeedback =
  | { tone: "refused"; message: string }
  | { tone: "error"; message: string }
  | null;

function outcomeFeedback(outcome: AuthoringCommandOutcome): CardFeedback {
  if (outcome.kind === "denied") {
    return {
      tone: "refused",
      message: outcome.reason ?? "That action isn’t allowed right now.",
    };
  }
  if (outcome.kind === "unavailable") {
    return {
      tone: "refused",
      message: outcome.reason ?? "That action isn’t available right now.",
    };
  }
  // `ok` / `in_flight` need no notice — the polled queue refreshes the row.
  return null;
}

// --- one proposal card ----------------------------------------------------------

/** A single review-decision button driven by a served eligibility entry. Its
 *  ENABLEMENT is the backend `allowed` flag (never re-derived); a denial's
 *  `reason` is surfaced as the disabled title. When the reviewer is not signed
 *  in, the button is gated with a plain hint (a transient identity gate, not a
 *  permanent lie). */
function ActionButton({
  eligibility,
  hasToken,
  busy,
  variant,
  onRun,
}: {
  eligibility: ActionEligibility;
  hasToken: boolean;
  busy: boolean;
  variant: "primary" | "secondary" | "danger";
  onRun: () => void;
}) {
  const blockedByBackend = !eligibility.allowed;
  const blockedByIdentity = !hasToken;
  const disabled = busy || blockedByBackend || blockedByIdentity;
  const title = blockedByBackend
    ? (eligibility.reason ?? undefined)
    : blockedByIdentity
      ? "Sign in as reviewer to act"
      : undefined;
  return (
    <Button
      variant={variant}
      disabled={disabled}
      title={title}
      onClick={onRun}
      data-action={eligibility.command}
      data-allowed={eligibility.allowed}
    >
      {commandLabel(eligibility.command)}
    </Button>
  );
}

export function ProposalCard({
  proposal,
  actions,
  hasToken,
}: {
  proposal: ProposalProjection;
  actions: ReviewActions;
  hasToken: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<CardFeedback>(null);

  const run = async (fn: () => Promise<AuthoringCommandOutcome>) => {
    setBusy(true);
    setFeedback(null);
    try {
      setFeedback(outcomeFeedback(await fn()));
    } catch {
      // A genuine fault (4xx/5xx) — distinct from a denial VALUE above.
      setFeedback({ tone: "error", message: "Something went wrong — please retry." });
    } finally {
      setBusy(false);
    }
  };

  // The approval identity a decision/apply needs is served ON the projection; the
  // decision buttons render only when it is present (no recomputed backend hash).
  const hasApprovalIdentity =
    !!proposal.approval.approval_id && !!proposal.approval.proposal_id;

  const variantFor = (command: string): "primary" | "secondary" | "danger" =>
    command === "reject" ? "danger" : command === "approve" ? "primary" : "secondary";

  const runFor = (command: string): (() => void) => {
    switch (command) {
      case "approve":
        return () => void run(() => actions.decide(proposal, "approve"));
      case "reject":
        return () => void run(() => actions.decide(proposal, "reject"));
      case "submit_for_review":
        return () => void run(() => actions.submit(proposal));
      case "request_apply":
        return () => void run(() => actions.apply(proposal));
      default:
        return () => {};
    }
  };

  // A decision/apply needs the served approval identity; submit does not.
  const eligibilityForRender = proposal.eligibility.filter((entry) => {
    if (entry.command === "approve" || entry.command === "reject") {
      return hasApprovalIdentity;
    }
    if (entry.command === "request_apply") return hasApprovalIdentity;
    return true;
  });

  return (
    <li
      className="flex flex-col gap-fg-2 rounded-fg-sm border border-rule bg-paper-raised px-fg-3 py-fg-2"
      data-proposal
      data-changeset-id={proposal.changeset_id}
      data-status={proposal.status}
    >
      <div className="flex items-start gap-fg-2">
        <span
          className="min-w-0 flex-1 text-body font-medium text-ink"
          title={proposal.summary}
        >
          {proposal.summary || "Untitled proposal"}
        </span>
        <Badge>{statusLabel(proposal.status)}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-fg-2 text-meta text-ink-faint">
        <span data-proposal-author>{proposal.origin_actor.id || "unknown author"}</span>
        <span aria-hidden>·</span>
        <span data-proposal-ops>
          {proposal.operation_count === 1
            ? "1 change"
            : `${proposal.operation_count} changes`}
        </span>
        {proposal.validation.present && proposal.validation.status && (
          <>
            <span aria-hidden>·</span>
            <span data-proposal-validation>
              {proposal.validation.approval_ready
                ? "Validated"
                : `Validation: ${proposal.validation.status}`}
            </span>
          </>
        )}
        {proposal.approval.stale && (
          <>
            <span aria-hidden>·</span>
            <span className="text-state-stale" data-proposal-stale>
              Review is stale
            </span>
          </>
        )}
      </div>

      {proposal.conflict && (
        <StateBlock
          mode="degraded"
          layout="inline"
          message="This proposal’s target document changed since review — resolve the conflict before applying."
        />
      )}

      <div className="flex flex-wrap items-center gap-fg-2">
        {eligibilityForRender.map((entry) => (
          <ActionButton
            key={entry.command}
            eligibility={entry}
            hasToken={hasToken}
            busy={busy}
            variant={variantFor(entry.command)}
            onRun={runFor(entry.command)}
          />
        ))}
        {proposal.rollback.available && (
          <Button
            variant="secondary"
            disabled={busy || !hasToken}
            title={hasToken ? undefined : "Sign in as reviewer to act"}
            onClick={() => run(() => actions.rollback(proposal))}
            data-action="create_rollback"
          >
            {commandLabel("create_rollback")}
          </Button>
        )}
      </div>

      {feedback && (
        <p
          className={`text-meta ${feedback.tone === "error" ? "text-diff-remove" : "text-ink-muted"}`}
          role="status"
          data-card-feedback={feedback.tone}
        >
          {feedback.tone === "refused"
            ? `Can’t do that — ${feedback.message}`
            : feedback.message}
        </p>
      )}
    </li>
  );
}

// --- the surface ----------------------------------------------------------------

/** The review-station body: the four mutually-exclusive display modes over the
 *  interpreted view, then the populated proposal list. */
function ReviewStationBody({ view }: { view: ReviewStationView }) {
  const actions = useReviewActions();
  const hasToken = useHasActorToken();

  if (view.storeUnavailable) {
    return (
      <StateBlock
        mode="degraded"
        message={view.degradedMessage ?? "The authoring service is unavailable."}
      />
    );
  }
  if (view.loading) {
    return (
      <Skeleton label="Loading the review queue">
        <SkeletonRow width="w-2/3" boxed />
        <SkeletonRow width="w-1/2" boxed />
      </Skeleton>
    );
  }
  if (view.empty) {
    return <StateBlock mode="empty" message="No proposals are waiting for review." />;
  }
  return (
    <>
      {view.degraded && view.degradedMessage && (
        <StateBlock mode="degraded" layout="inline" message={view.degradedMessage} />
      )}
      <ul className="flex flex-col gap-fg-2" role="list" data-proposal-list>
        {view.rows.map((proposal) => (
          <ProposalCard
            key={proposal.changeset_id}
            proposal={proposal}
            actions={actions}
            hasToken={hasToken}
          />
        ))}
      </ul>
      {view.truncated && (
        <StateBlock
          mode="degraded"
          layout="inline"
          message="More proposals exist than are shown here — narrow the queue to see the rest."
        />
      )}
    </>
  );
}

/** The review station: a polled, backend-served proposal queue with per-proposal
 *  approve/reject/apply/rollback driven by served eligibility. The human-in-the-
 *  loop seam for agentic authoring. */
export function ReviewStation() {
  const view = useReviewStationView();
  return (
    <section
      className="flex flex-col gap-fg-3 text-body"
      data-review-station
      aria-label="Review station"
    >
      <header className="flex items-center justify-between gap-fg-2">
        <SectionLabel count={view.rows.length}>Review station</SectionLabel>
        <ReviewerIdentity />
      </header>
      <ReviewStationBody view={view} />
    </section>
  );
}
