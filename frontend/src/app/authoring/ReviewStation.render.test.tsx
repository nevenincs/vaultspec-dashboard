// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import {
  type ActorRef,
  type AppliedUnderPolicyProjection,
  type AuthoringCommandOutcome,
  type OperationMode,
  type ProposalProjection,
  type ReviewStationView,
} from "../../stores/server/authoring";
import { EngineError } from "../../stores/server/engine";
import {
  AppliedUnderPolicyLane,
  AutonomyControl,
  ProposalCard,
  ReviewStationBody,
  type ReviewActions,
} from "./ReviewStation";

afterEach(cleanup);

const agent: ActorRef = { id: "agent:private-writer-17", kind: "agent" };
const accepted: AuthoringCommandOutcome = {
  kind: "ok",
  status: "decided",
  data: {},
  tiers: {},
};

function needsReviewProposal(
  overrides: Partial<ProposalProjection> = {},
): ProposalProjection {
  return {
    changeset_id: "changeset_private_1",
    changeset_revision: "proposal:private-rev2",
    kind: "authoring",
    status: "needs_review",
    summary: "Rewrite the introduction",
    actor: agent,
    origin_actor: agent,
    operation_count: 2,
    validation: {
      present: true,
      status: "valid",
      approval_ready: true,
      validation_digest: "validation:private-v1",
    },
    approval: {
      present: true,
      queue_state: "queued",
      stale: false,
      approval_id: "approval:private-abc",
      proposal_id: "proposal:private-abc",
      reviewed_proposal_revision: "proposal:private-rev2",
    },
    policy: {
      policy_version: "private.policy.v1",
      scope_mode: "manual",
      effective_mode: "manual",
      session_override_ignored: false,
      risk: "non_destructive",
      requirement: "human_approval_required",
      reason: "private-policy-reason",
    },
    eligibility: [
      { command: "approve", allowed: true },
      { command: "reject", allowed: true },
    ],
    rollback: { available: false, reason: "private-rollback-reason" },
    created_at_ms: 1_775_000_000_000,
    ...overrides,
  };
}

interface ActionCounts {
  approve: number;
  reject: number;
  submit: number;
  apply: number;
  rollback: number;
}

function actionCallbacks(
  counts: ActionCounts,
  outcome: AuthoringCommandOutcome = accepted,
  failure?: unknown,
): ReviewActions {
  const result = (): Promise<AuthoringCommandOutcome> =>
    failure === undefined ? Promise.resolve(outcome) : Promise.reject(failure);
  return {
    decide: (_proposal, decision) => {
      counts[decision] += 1;
      return result();
    },
    submit: () => {
      counts.submit += 1;
      return result();
    },
    apply: () => {
      counts.apply += 1;
      return result();
    },
    rollback: () => {
      counts.rollback += 1;
      return result();
    },
  };
}

function emptyCounts(): ActionCounts {
  return { approve: 0, reject: 0, submit: 0, apply: 0, rollback: 0 };
}

function localized(ui: React.ReactNode) {
  const runtime = createTestLocalizationRuntime();
  return {
    runtime,
    ...render(<I18nextProvider i18n={runtime}>{ui}</I18nextProvider>),
  };
}

function view(overrides: Partial<ReviewStationView> = {}): ReviewStationView {
  return {
    rows: [],
    afterFactRows: [],
    loading: false,
    degraded: false,
    storeUnavailable: false,
    availabilityIssue: null,
    empty: false,
    truncated: false,
    afterFactTruncated: false,
    operationMode: null,
    ...overrides,
  };
}

describe("ProposalCard", () => {
  it("reacts on the same node in English, French, and Arabic", async () => {
    const counts = emptyCounts();
    const { runtime } = localized(
      <ProposalCard
        proposal={needsReviewProposal()}
        actions={actionCallbacks(counts)}
      />,
    );

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("Needs review")).toBeTruthy();
    expect(within(card).getByText("2 changes")).toBeTruthy();
    expect(within(card).getByText("Assistant")).toBeTruthy();

    await runtime.changeLanguage(ltrTestLocale);
    await waitFor(() => expect(card.textContent).toContain("Révision nécessaire"));
    expect(card.textContent).toContain("2 modifications");

    await runtime.changeLanguage(rtlTestLocale);
    await waitFor(() => expect(card.textContent).toContain("يحتاج إلى مراجعة"));
    expect(card.textContent).toContain("تغييران");
  });

  it("keeps hostile metadata, identifiers, and raw reasons out of visible copy", () => {
    const counts = emptyCounts();
    localized(
      <ProposalCard
        proposal={needsReviewProposal({
          status: "future_private_status" as ProposalProjection["status"],
          validation: {
            present: true,
            status: "private_validation_token" as NonNullable<
              ProposalProjection["validation"]["status"]
            >,
            approval_ready: false,
          },
          approval: {
            ...needsReviewProposal().approval,
            stale: true,
            stale_reason: "private-stale-reason",
          },
          eligibility: [
            {
              command: "future_private_command",
              allowed: false,
              reason: "private-eligibility-reason",
            },
            {
              command: "approve",
              allowed: false,
              reason: "private-approval-reason",
            },
          ],
          conflict: { child_key: "private-child", reason: "private-conflict" },
        })}
        actions={actionCallbacks(counts)}
      />,
    );

    const text = screen.getByRole("listitem").textContent ?? "";
    for (const privateValue of [
      "agent:private-writer-17",
      "private.policy.v1",
      "private-policy-reason",
      "private_validation_token",
      "private-validation-reason",
      "private-stale-reason",
      "future_private_command",
      "private-eligibility-reason",
      "private-approval-reason",
      "private-conflict",
    ]) {
      expect(text).not.toContain(privateValue);
    }
    expect(screen.queryByRole("button", { name: "Action unavailable" })).toBeNull();
    expect(screen.getByRole("button", { name: "Approve proposal" })).toBeTruthy();
  });

  it("uses served eligibility and approval identity without recomputing them", () => {
    const counts = emptyCounts();
    const { rerender, runtime } = localized(
      <ProposalCard
        proposal={needsReviewProposal({
          eligibility: [{ command: "approve", allowed: false, reason: "private" }],
        })}
        actions={actionCallbacks(counts)}
      />,
    );
    const approve = screen.getByRole("button", { name: "Approve proposal" });
    expect(approve.getAttribute("disabled")).not.toBeNull();
    expect(approve.getAttribute("title")).toBe("Refresh the proposal and try again.");

    rerender(
      <I18nextProvider i18n={runtime}>
        <ProposalCard
          proposal={needsReviewProposal({
            approval: { present: true, queue_state: "queued", stale: false },
          })}
          actions={actionCallbacks(counts)}
        />
      </I18nextProvider>,
    );
    expect(screen.queryByRole("button", { name: "Approve proposal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reject proposal" })).toBeNull();
  });

  it("reaches every review action with zero prior editing (ambient provenance)", () => {
    // ADR D5: provenance is ambient — the mutation mints the actor token on
    // first use, so an action is enabled purely by served eligibility with no
    // sign-in gate. A reviewer who never edited still gets live buttons.
    const counts = emptyCounts();
    localized(
      <ProposalCard
        proposal={needsReviewProposal()}
        actions={actionCallbacks(counts)}
      />,
    );
    const reject = screen.getByRole("button", { name: "Reject proposal" });
    expect(reject.getAttribute("disabled")).toBeNull();
    const approve = screen.getByRole("button", { name: "Approve proposal" });
    expect(approve.getAttribute("disabled")).toBeNull();
  });

  it("submits for review directly", async () => {
    const counts = emptyCounts();
    localized(
      <ProposalCard
        proposal={needsReviewProposal({
          status: "draft",
          approval: { present: false, stale: false },
          eligibility: [{ command: "submit_for_review", allowed: true }],
        })}
        actions={actionCallbacks(counts)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));
    await waitFor(() => expect(counts.submit).toBe(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  const confirmations = [
    {
      name: "approve",
      proposal: needsReviewProposal({
        eligibility: [{ command: "approve", allowed: true }],
      }),
      trigger: "Approve proposal",
      confirm: "Approve proposal",
    },
    {
      name: "reject",
      proposal: needsReviewProposal({
        eligibility: [{ command: "reject", allowed: true }],
      }),
      trigger: "Reject proposal",
      confirm: "Reject proposal",
    },
    {
      name: "apply",
      proposal: needsReviewProposal({
        status: "approved",
        eligibility: [{ command: "request_apply", allowed: true }],
      }),
      trigger: "Apply changes",
      confirm: "Apply changes",
    },
    {
      name: "rollback",
      proposal: needsReviewProposal({
        status: "applied",
        eligibility: [],
        rollback: { available: true, child_key: "child_1" },
      }),
      trigger: "Prepare rollback",
      confirm: "Prepare rollback",
    },
  ] as const;

  for (const confirmation of confirmations) {
    it(`cancels and confirms ${confirmation.name} exactly once`, async () => {
      const counts = emptyCounts();
      localized(
        <ProposalCard
          proposal={confirmation.proposal}
          actions={actionCallbacks(counts)}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: confirmation.trigger }));
      const firstDialog = screen.getByRole("dialog");
      fireEvent.click(within(firstDialog).getByRole("button", { name: "Cancel" }));
      expect(counts[confirmation.name]).toBe(0);

      fireEvent.click(screen.getByRole("button", { name: confirmation.trigger }));
      const secondDialog = screen.getByRole("dialog");
      fireEvent.click(
        within(secondDialog).getByRole("button", { name: confirmation.confirm }),
      );
      await waitFor(() => expect(counts[confirmation.name]).toBe(1));
    });
  }

  it("classifies refused outcomes without rendering the served reason", async () => {
    const counts = emptyCounts();
    localized(
      <ProposalCard
        proposal={needsReviewProposal({
          eligibility: [{ command: "approve", allowed: true }],
        })}
        actions={actionCallbacks(counts, {
          kind: "denied",
          command: "approve",
          reason: "private-denial-reason",
          tiers: {},
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve proposal" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Approve proposal",
      }),
    );
    const feedback = await screen.findByText(
      "Review the proposal and choose an available action.",
    );
    expect(feedback.getAttribute("data-card-feedback")).toBe("refused");
    expect(document.body.textContent).not.toContain("private-denial-reason");
  });

  it("classifies typed failures without rendering error metadata", async () => {
    const counts = emptyCounts();
    const error = new EngineError("/private/authoring/route", 409, {
      body: {
        error_kind: "authoring_stale_review",
        error: "private-error-message",
      },
    });
    localized(
      <ProposalCard
        proposal={needsReviewProposal({
          eligibility: [{ command: "approve", allowed: true }],
        })}
        actions={actionCallbacks(counts, accepted, error)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve proposal" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Approve proposal",
      }),
    );
    const feedback = await screen.findByText(
      "Review the latest proposal, then try again.",
    );
    expect(feedback.getAttribute("data-card-feedback")).toBe("error");
    expect(document.body.textContent).not.toContain("private-error-message");
    expect(document.body.textContent).not.toContain("authoring_stale_review");
  });

  it("toggles the change preview with the real query client", () => {
    const counts = emptyCounts();
    const runtime = createTestLocalizationRuntime();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={queryClient}>
          <ProposalCard
            proposal={needsReviewProposal()}
            actions={actionCallbacks(counts)}
          />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    const toggle = screen.getByRole("button", { name: "Show changes" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide changes" })).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("AutonomyControl", () => {
  it("renders plain labels, marks the served mode active, and emits the served token in three locales", async () => {
    const selected: OperationMode[] = [];
    const { runtime } = localized(
      <AutonomyControl
        mode="manual"
        onSelect={(m) => {
          selected.push(m);
          return Promise.resolve(accepted);
        }}
      />,
    );
    const group = screen.getByRole("radiogroup", { name: "Autonomy" });
    const reviewEach = within(group).getByRole("radio", {
      name: "Review each change",
    });
    const applyAuto = within(group).getByRole("radio", {
      name: "Apply automatically",
    });
    expect(reviewEach.getAttribute("aria-checked")).toBe("true");
    expect(applyAuto.getAttribute("aria-checked")).toBe("false");

    // Selecting the other segment emits the served mode token (never re-derived);
    // a successful switch shows NO feedback chatter (the active segment IS the cue).
    fireEvent.click(applyAuto);
    await waitFor(() => expect(selected).toEqual(["autonomous"]));
    expect(document.querySelector("[data-autonomy-feedback]")).toBeNull();

    await runtime.changeLanguage(ltrTestLocale);
    await waitFor(() =>
      expect(group.textContent).toContain("Vérifier chaque modification"),
    );
    expect(group.textContent).toContain("Appliquer automatiquement");

    await runtime.changeLanguage(rtlTestLocale);
    await waitFor(() => expect(group.textContent).toContain("مراجعة كل تغيير"));
  });

  it("marks neither segment when the served mode is assisted (no fabricated selection)", () => {
    localized(
      <AutonomyControl mode="assisted" onSelect={() => Promise.resolve(accepted)} />,
    );
    const radios = within(
      screen.getByRole("radiogroup", { name: "Autonomy" }),
    ).getAllByRole("radio");
    for (const radio of radios) {
      expect(radio.getAttribute("aria-checked")).toBe("false");
    }
  });

  it("surfaces a served denial as inline feedback without the raw reason", async () => {
    localized(
      <AutonomyControl
        mode="manual"
        onSelect={() =>
          Promise.resolve({
            kind: "denied",
            command: "set_operation_mode",
            reason: "private-mode-denial",
            tiers: {},
          })
        }
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Apply automatically" }));
    const feedback = await screen.findByText(
      "Review the proposal and choose an available action.",
    );
    expect(feedback.getAttribute("data-autonomy-feedback")).toBe("refused");
    expect(document.body.textContent).not.toContain("private-mode-denial");
  });

  it("surfaces a typed transport failure as inline error feedback", async () => {
    localized(
      <AutonomyControl
        mode="manual"
        onSelect={() =>
          Promise.reject(
            new EngineError("/private/authoring/mode", 409, {
              body: { error_kind: "authoring_stale_review", error: "private-error" },
            }),
          )
        }
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Apply automatically" }));
    const feedback = await screen.findByText(
      "Review the latest proposal, then try again.",
    );
    expect(feedback.getAttribute("data-autonomy-feedback")).toBe("error");
    expect(document.body.textContent).not.toContain("private-error");
  });
});

describe("ReviewStation states", () => {
  it("renders loading, empty, degraded, unavailable, and truncation states", () => {
    const counts = emptyCounts();
    const actions = actionCallbacks(counts);
    const runtime = createTestLocalizationRuntime();
    const { rerender } = render(
      <I18nextProvider i18n={runtime}>
        <ReviewStationBody view={view({ loading: true })} actions={actions} />
      </I18nextProvider>,
    );
    expect(screen.getByRole("status").getAttribute("aria-label")).toBe(
      "Loading approvals",
    );

    const states = [
      [view({ empty: true }), "No proposals are waiting for review."],
      [
        view({
          degraded: true,
          availabilityIssue: "informationMayBeOutOfDate",
        }),
        "Approval information may be out of date. Refresh to get the latest information.",
      ],
      [
        view({ storeUnavailable: true, availabilityIssue: "queueUnavailable" }),
        "Approvals are unavailable. Refresh the app and try again.",
      ],
      [
        view({ truncated: true, afterFactTruncated: true }),
        "More proposals are available. Narrow the queue to see them.",
      ],
    ] as const;
    for (const [state, expected] of states) {
      rerender(
        <I18nextProvider i18n={runtime}>
          <ReviewStationBody view={state} actions={actions} />
        </I18nextProvider>,
      );
      expect(document.body.textContent).toContain(expected);
    }
    expect(document.body.textContent).toContain(
      "More automatically applied changes are available.",
    );
  });

  it("renders the bounded after-fact lane without policy identifiers", () => {
    const counts = emptyCounts();
    const item: AppliedUnderPolicyProjection = {
      proposal: needsReviewProposal({
        changeset_id: "changeset_applied",
        status: "applied",
        eligibility: [],
        rollback: { available: true, child_key: "child_1" },
      }),
      policy_id: "private.policy.id",
      policy_version: "private.policy.version",
      mode: "autonomous",
      system_actor: { id: "system:private", kind: "system" },
      applied_at_ms: 1_775_000_000_100,
      acknowledgement_count: 1,
    };
    localized(
      <AppliedUnderPolicyLane items={[item]} actions={actionCallbacks(counts)} />,
    );

    expect(screen.getAllByText("Applied automatically")).toHaveLength(2);
    expect(screen.getByText("1 acknowledgement")).toBeTruthy();
    expect(document.body.textContent).not.toContain("private.policy.id");
    expect(document.body.textContent).not.toContain("private.policy.version");
    expect(document.body.textContent).not.toContain("system:private");
  });
});
