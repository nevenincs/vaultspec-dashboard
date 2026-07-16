// @vitest-environment happy-dom
//
// The inline proposal card, preview-then-approve happy path INSIDE the transcript
// (agentic-authoring-ux W03.P03.S16), ONLINE against the real `vaultspec serve`
// the global setup spawns over a scratch fixture workspace — never a mocked wire.
//
// The scenario mirrors the authoring happy-path but drives it through the AGENT
// transcript surface: an agent principal opens a session + turn and proposes a
// real changeset, submits it for review; the transcript's latest-turn slot
// correlates and mounts the ONE proposal card; Show-changes opens the ONE diff
// primitive (proposal-preview) over the served base/proposed texts; and Approve
// fires the REAL review decision with zero prior editing — the ambient reviewer
// (`human:local-operator`) is a distinct principal from the agent author, so the
// self-approval ban is cleared (ADR D5 ambient provenance). The approve leg needs
// no core (a decision is recorded, not applied), so it is not core-gated.
//
// Correlation note: no run/turn link is served on a proposal projection, so the
// card binds by the actor-identity heuristic the component documents; here the
// session actor IS the proposal's origin actor, the exact happy case.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import {
  AuthoringClient,
  type CreateProposalPayload,
} from "../../stores/server/authoring";
import { AgentClient, type SessionSnapshot } from "../../stores/server/agent";
import { queryClient } from "../../stores/server/queryClient";
import { Transcript } from "./Transcript";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const liveAgent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
const liveAuthoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });

// A prose research doc that stays schema-valid through submit validation. Only
// this test's throwaway changeset touches it, and it is never applied.
const TARGET_STEM = "2026-01-04-beta-research";
const TARGET_NODE_ID = `doc:${TARGET_STEM}`;
const TARGET_PATH = ".vault/research/2026-01-04-beta-research.md";

let scope: string;
let baseRevision: string;
let proposedBody: string;

beforeAll(async () => {
  scope = await liveScope();
  const engine = createLiveClient();
  const content = await engine.content(TARGET_NODE_ID, scope);
  baseRevision = `blob:${content.blob_hash}`;
  proposedBody =
    "---\ntags:\n  - '#research'\n  - '#beta'\ndate: '2026-01-04'\n---\n\n" +
    "# `beta` research: scope\n\nAdded by the transcript proposal-card live test.\n";
});

afterEach(() => {
  cleanup();
  queryClient.clear();
});

function replaceProposal(
  sessionId: string,
  changesetId: string,
): CreateProposalPayload {
  return {
    session_id: sessionId,
    changeset_id: changesetId,
    summary: "Add a transcript-card note to the research doc",
    operations: [
      {
        child_key: "child_1",
        operation: "replace_body",
        target: {
          document: {
            kind: "existing",
            scope,
            node_id: TARGET_NODE_ID,
            stem: TARGET_STEM,
            path: TARGET_PATH,
            doc_type: "research",
            base_revision: baseRevision,
          },
          base_revision: baseRevision,
          current_revision: baseRevision,
        },
        draft: { mode: "whole_document", body: proposedBody },
      },
    ],
  };
}

function renderTranscript(snapshot: SessionSnapshot) {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <Transcript snapshot={snapshot} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("inline proposal card (live wire)", () => {
  it("correlates the served proposal into the latest turn's slot, previews it, and approves it", async () => {
    const authorToken = (
      await liveAuthoring.issueActorToken({
        actor: { id: `agent:proposal-panel-${run}`, kind: "agent" },
      })
    ).raw_token;

    // A real session + first turn so the snapshot carries a turn to host the slot.
    const created = await liveAgent.createSession(
      { scope, title: `Proposal panel ${run}` },
      { actorToken: authorToken },
    );
    if (created.kind !== "settled") throw new Error("session did not settle");
    const sessionId = created.session_id;
    const turned = await liveAgent.startTurn(
      sessionId,
      { prompt: `draft a change ${run}` },
      { actorToken: authorToken },
    );
    if (turned.kind !== "settled") throw new Error("turn did not settle");

    // Propose a real changeset in the session, then submit it for review so the
    // served projection carries approve/reject eligibility + approval identity.
    const changesetId = `changeset_panel_${run}`;
    const proposed = await liveAuthoring.createProposal(
      replaceProposal(sessionId, changesetId),
      { actorToken: authorToken },
    );
    expect(proposed.kind).toBe("ok");
    const queued = await liveAuthoring.projectProposal(changesetId);
    expect(queued?.proposal.changeset_id).toBe(changesetId);
    const submitted = await liveAuthoring.submitForReview(
      changesetId,
      {
        expected_revision: queued!.proposal.changeset_revision,
        summary: "ready for review",
      },
      { actorToken: authorToken },
    );
    expect(submitted.kind).toBe("ok");

    const snapshot = await liveAgent.getSession(sessionId);
    expect(snapshot.session.actor.id).toBe(`agent:proposal-panel-${run}`);
    renderTranscript(snapshot);

    // The correlated card mounts in the latest turn's slot once the queue loads.
    const card = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>(
          "[data-agent-proposal] [data-proposal]",
        );
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 15_000 },
    );
    expect(card.getAttribute("data-changeset-id")).toBe(changesetId);
    // Served summary + change count are rendered (never re-derived client-side).
    expect(card.querySelector("[data-proposal-ops]")).not.toBeNull();

    // Eligibility-driven, ambient: Approve/Reject render enabled with no sign-in.
    const approve = within(card).getByRole("button", { name: "Approve proposal" });
    const reject = within(card).getByRole("button", { name: "Reject proposal" });
    expect(approve.getAttribute("disabled")).toBeNull();
    expect(reject.getAttribute("disabled")).toBeNull();

    // Show changes opens the ONE diff primitive in proposal-preview mode over the
    // served base/proposed texts (the unified DiffView, ADR D7).
    fireEvent.click(card.querySelector("[data-toggle-diff]")!);
    await waitFor(
      () =>
        expect(
          document.querySelector('[data-diff-source="proposal-preview"]'),
        ).not.toBeNull(),
      { timeout: 15_000 },
    );

    // Approve fires the REAL review decision end-to-end (confirm → recorded
    // acceptance). Zero prior editing; the ambient reviewer is a distinct principal.
    fireEvent.click(approve);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve proposal" }));
    await waitFor(
      () =>
        expect(
          document.querySelector('[data-card-feedback="accepted"]'),
        ).not.toBeNull(),
      { timeout: 15_000 },
    );

    // The decision really landed: the served projection now reads approved.
    const afterApprove = await liveAuthoring.projectProposal(changesetId);
    expect(afterApprove?.proposal.status).toBe("approved");
  });
});
