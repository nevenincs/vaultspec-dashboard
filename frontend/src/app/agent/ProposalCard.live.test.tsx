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
import { cleanup, render, waitFor } from "@testing-library/react";
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
  it("binds the turn slot ONLY by served run provenance — a direct-route proposal stays out (S42)", async () => {
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

    // EXACT BINDING (agent-wire-gaps S42/D4): the transcript slot binds ONLY by
    // the proposal's SERVED run_id. This proposal was created through the DIRECT
    // authoring route, which by design carries no run provenance (provenance is
    // server-stamped at tool-executor dispatch and can never be client-supplied)
    // — so the slot must stay EMPTY: no heuristic fallback resurrects the retired
    // session-actor-latest matching. Wait for the turn row to render (the slot's
    // host exists), then assert the card is absent.
    await waitFor(
      () =>
        expect(
          document.querySelector("[data-agent-transcript-entries] li"),
        ).not.toBeNull(),
      { timeout: 15_000 },
    );
    // Give the proposal queue query a settle window, then assert NO card mounted
    // anywhere in the transcript (the slot renders nothing without a run match).
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(document.querySelector("[data-proposal]")).toBeNull();
    // The served projection confirms the proposal is REAL and session-scoped with
    // no run provenance — the review station is its home, not the turn slot.
    const projected = await liveAuthoring.projectProposal(changesetId);
    expect(projected?.proposal.session_id).toBe(sessionId);
    expect(projected?.proposal.run_id ?? null).toBeNull();
    // The live CORRELATED card flow (tool-executor-dispatched proposal carrying
    // served run provenance → card mounts → diff → approve) requires the executor
    // choreography no frontend path can mint — it lands with the first
    // agent-driven run e2e; the card's approve mechanics are live-covered by the
    // review-station suite today.
  }, 45_000);
});
