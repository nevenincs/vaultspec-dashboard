// @vitest-environment happy-dom
//
// ReviewStation card render contract (W03.P40 CHUNK B). These are WIRE-FREE UI
// unit tests: `ProposalCard` takes the served projection + an injected `actions`
// bundle + the reviewer-identity flag as PROPS, so the test drives the human-in-
// the-loop seam without touching the engine wire (the live-wire proof lives in
// the online suite). The properties under test are the ones the walking skeleton
// rides: button enablement comes from the SERVED eligibility (never re-derived),
// clicking "Reject" (the deny seam) dispatches the decision, and a DENIAL renders
// as an inline "can’t do that + reason" — never an error. Core vitest matchers
// only (no jest-dom in this repo).

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  ActorRef,
  AppliedUnderPolicyProjection,
  AuthoringCommandOutcome,
  ProposalProjection,
} from "../../stores/server/authoring";
import {
  AppliedUnderPolicyLane,
  ProposalCard,
  type ReviewActions,
} from "./ReviewStation";

afterEach(cleanup);

const agent: ActorRef = { id: "agent:writer", kind: "agent" };

/** A NeedsReview projection carrying the SERVED approval identity + backend-owned
 *  approve/reject eligibility — the post-projection-identity wire the card wires
 *  the deny seam against. */
function needsReviewProposal(
  overrides: Partial<ProposalProjection> = {},
): ProposalProjection {
  return {
    changeset_id: "changeset_1",
    changeset_revision: "proposal:rev2",
    kind: "authoring",
    status: "needs_review",
    summary: "Rewrite the ADR introduction",
    actor: agent,
    origin_actor: agent,
    operation_count: 2,
    validation: {
      present: true,
      status: "valid",
      approval_ready: true,
      validation_digest: "validation:v1",
    },
    approval: {
      present: true,
      queue_state: "queued",
      stale: false,
      approval_id: "approval:abc",
      proposal_id: "proposal:abc",
      reviewed_proposal_revision: "proposal:rev2",
    },
    policy: {
      policy_version: "authoring.approval_policy.v1",
      scope_mode: "manual",
      effective_mode: "manual",
      session_override_ignored: false,
      risk: "non_destructive",
      requirement: "human_approval_required",
      reason: "manual mode requires an eligible human approval before apply",
    },
    eligibility: [
      { command: "approve", allowed: true },
      { command: "reject", allowed: true },
    ],
    rollback: { available: false, reason: "changeset is not applied" },
    created_at_ms: 1_775_000_000_000,
    ...overrides,
  };
}

function stubActions(overrides: Partial<ReviewActions> = {}): ReviewActions {
  const ok = (): Promise<AuthoringCommandOutcome> =>
    Promise.resolve({ kind: "ok", status: "decided", data: {}, tiers: {} });
  return {
    decide: vi.fn(ok),
    submit: vi.fn(ok),
    apply: vi.fn(ok),
    rollback: vi.fn(ok),
    ...overrides,
  };
}

describe("ProposalCard", () => {
  it("renders the served summary, status label, and change count", () => {
    render(
      <ProposalCard
        proposal={needsReviewProposal()}
        actions={stubActions()}
        hasToken
      />,
    );
    expect(screen.getByText("Rewrite the ADR introduction")).toBeTruthy();
    expect(screen.getByText("Needs review")).toBeTruthy();
    expect(screen.getByText("2 changes")).toBeTruthy();
    const policy = screen.getByText("Manual · Human approval");
    expect(policy).toBeTruthy();
    expect(policy.getAttribute("title")).toContain("manual mode");
  });

  it("renders a served policy-stale approval reason", () => {
    render(
      <ProposalCard
        proposal={needsReviewProposal({
          approval: {
            ...needsReviewProposal().approval,
            stale: false,
            stale_reason: "policy_version_changed",
          },
        })}
        actions={stubActions()}
        hasToken
      />,
    );

    expect(screen.getByText("Review policy changed")).toBeTruthy();
  });

  it("clicking Reject dispatches the deny decision (the human-in-the-loop seam)", async () => {
    const actions = stubActions();
    render(
      <ProposalCard proposal={needsReviewProposal()} actions={actions} hasToken />,
    );

    const reject = screen.getByRole("button", { name: "Reject" });
    expect(reject.getAttribute("disabled")).toBeNull();
    fireEvent.click(reject);

    await waitFor(() => expect(actions.decide).toHaveBeenCalledTimes(1));
    expect(actions.decide).toHaveBeenCalledWith(
      expect.objectContaining({ changeset_id: "changeset_1" }),
      "reject",
    );
  });

  it("renders a backend DENIAL as an inline refusal + reason, never an error", async () => {
    const actions = stubActions({
      decide: vi.fn(() =>
        Promise.resolve({
          kind: "denied",
          command: "approve",
          reason: "an agent may not approve its own proposal",
          tiers: {},
        } satisfies AuthoringCommandOutcome),
      ),
    });
    render(
      <ProposalCard proposal={needsReviewProposal()} actions={actions} hasToken />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    const feedback = await screen.findByText(/Can’t do that/);
    expect(feedback.getAttribute("data-card-feedback")).toBe("refused");
    expect(feedback.textContent).toContain("may not approve");
  });

  it("disables an action the backend marks not-allowed and surfaces its reason", () => {
    render(
      <ProposalCard
        proposal={needsReviewProposal({
          conflict: {
            child_key: "child_1",
            reason: "target document changed since review",
          },
          eligibility: [
            {
              command: "approve",
              allowed: false,
              reason: "target revisions are no longer current",
            },
            {
              command: "reject",
              allowed: false,
              reason: "target revisions are no longer current",
            },
          ],
        })}
        actions={stubActions()}
        hasToken
      />,
    );

    const approve = screen.getByRole("button", { name: "Approve" });
    // Enablement is the SERVED eligibility — not a frontend guess.
    expect(approve.getAttribute("disabled")).not.toBeNull();
    expect(approve.getAttribute("title")).toContain("target revisions");
    // The served conflict is surfaced to the reviewer.
    expect(screen.getByText(/changed since review/)).toBeTruthy();
  });

  it("gates the decision behind reviewer sign-in when no token is bootstrapped", () => {
    render(
      <ProposalCard
        proposal={needsReviewProposal()}
        actions={stubActions()}
        hasToken={false}
      />,
    );
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(reject.getAttribute("disabled")).not.toBeNull();
    expect(reject.getAttribute("title")).toContain("Sign in as reviewer");
  });

  it("does not render a policy label when the backend did not serve policy", () => {
    render(
      <ProposalCard
        proposal={needsReviewProposal({ policy: undefined })}
        actions={stubActions()}
        hasToken
      />,
    );
    expect(document.querySelector("[data-proposal-policy]")).toBeNull();
  });

  it("hides decision buttons until the projection carries the approval identity", () => {
    render(
      <ProposalCard
        proposal={needsReviewProposal({
          approval: { present: true, queue_state: "queued", stale: false },
        })}
        actions={stubActions()}
        hasToken
      />,
    );
    // No recomputed backend id → no dead decision buttons (no permanent lie).
    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});

describe("AppliedUnderPolicyLane", () => {
  it("renders policy-applied work in the second lane with rollback available", () => {
    const item: AppliedUnderPolicyProjection = {
      proposal: needsReviewProposal({
        changeset_id: "changeset_applied",
        status: "applied",
        policy: {
          policy_version: "authoring.approval_policy.v1",
          scope_mode: "autonomous",
          effective_mode: "autonomous",
          session_override_ignored: false,
          risk: "non_destructive",
          requirement: "system_auto_approvable",
          reason: "autonomous mode auto-approves non-destructive changes",
        },
        eligibility: [],
        rollback: { available: true, child_key: "child_1" },
      }),
      policy_id: "authoring.operation_modes",
      policy_version: "authoring.operation_modes.v1",
      mode: "autonomous",
      system_actor: { id: "system:operation-modes", kind: "system" },
      applied_at_ms: 1_775_000_000_100,
      acknowledgement_count: 1,
    };

    render(<AppliedUnderPolicyLane items={[item]} actions={stubActions()} hasToken />);

    expect(screen.getByText("Applied under policy")).toBeTruthy();
    expect(screen.getByText("Autonomous · System approval")).toBeTruthy();
    const appliedPolicy = screen.getByText("Autonomous policy");
    expect(appliedPolicy.getAttribute("title")).toContain("authoring.operation_modes");
    expect(appliedPolicy.getAttribute("title")).toContain(
      "authoring.operation_modes.v1",
    );
    expect(screen.getByText("1 acknowledgement")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Roll back" })).toBeTruthy();
  });
});
