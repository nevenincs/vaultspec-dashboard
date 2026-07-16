// @vitest-environment happy-dom
//
// The autonomy / operation-mode control, ONLINE against the real `vaultspec serve`
// the global setup spawns over a scratch fixture workspace (agentic-authoring-ux
// W04.P04.S19). Drives the control through `ReviewStationSection` against a real
// review queue: it reads the SERVED worktree mode from a proposal's policy
// projection, and clicking "Apply automatically" fires the real `POST
// /authoring/v1/mode` and round-trips — the re-projected policy reads autonomous
// and the control reflects it. Ambient provenance: the mode mutation mints the
// operator token (human:local-operator), the human/system principal the engine
// allows to change mode. No cargo rebuild — reuses the running engine.
//
// Served-shape honesty: there is NO scope-level mode read; the mode is observable
// only through a proposal's `policy.effective_mode`, so the control needs a queued
// proposal to reflect a mode (an empty queue shows no control).

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import {
  AuthoringClient,
  type CreateProposalPayload,
} from "../../stores/server/authoring";
import { queryClient } from "../../stores/server/queryClient";
import { ReviewStationSection } from "./ReviewStation";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const liveAuthoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });

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
    "# `beta` research: scope\n\nAdded by the autonomy-control live test.\n";
});

afterEach(async () => {
  cleanup();
  queryClient.clear();
  // The worktree mode is GLOBAL on the shared scratch engine, and the live suite
  // runs sequentially — so ALWAYS restore the default here, even if an assertion
  // in the test threw. Otherwise a left-over `autonomous` bleeds into sibling live
  // tests (e.g. ProposalCard.live) and silently changes their gate semantics. Only
  // a human/system principal may set mode.
  const humanToken = (
    await liveAuthoring.issueActorToken({
      actor: { id: `human:autonomy-reset-${run}`, kind: "human" },
    })
  ).raw_token;
  await liveAuthoring.setOperationMode({ mode: "manual" }, { actorToken: humanToken });
});

function replaceProposal(
  sessionId: string,
  changesetId: string,
): CreateProposalPayload {
  return {
    session_id: sessionId,
    changeset_id: changesetId,
    summary: "Autonomy-control live-test proposal",
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

async function createLiveSession(actorToken: string): Promise<string> {
  const res = await liveTransport("/authoring/v1/sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-authoring-actor-token": actorToken,
    },
    body: JSON.stringify({
      api_version: "v1",
      command: "create_session",
      idempotency_key: `session-mode-${run}`,
      payload: { scope: "worktree", title: "autonomy live session" },
    }),
  });
  const body = (await res.json()) as { data?: { session_id?: string } };
  if (!res.ok || typeof body.data?.session_id !== "string") {
    throw new Error(`session create failed (${res.status})`);
  }
  return body.data.session_id;
}

function renderReviewStation() {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <ReviewStationSection />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("autonomy control (live wire)", () => {
  it("reads the served mode from the queue and round-trips a POST /mode switch", async () => {
    const authorToken = (
      await liveAuthoring.issueActorToken({
        actor: { id: `agent:autonomy-${run}`, kind: "agent" },
      })
    ).raw_token;
    const sessionId = await createLiveSession(authorToken);
    const changesetId = `changeset_autonomy_${run}`;
    const proposed = await liveAuthoring.createProposal(
      replaceProposal(sessionId, changesetId),
      { actorToken: authorToken },
    );
    expect(proposed.kind).toBe("ok");
    const queued = await liveAuthoring.projectProposal(changesetId);
    await liveAuthoring.submitForReview(
      changesetId,
      {
        expected_revision: queued!.proposal.changeset_revision,
        summary: "ready for review",
      },
      { actorToken: authorToken },
    );

    renderReviewStation();

    // The control appears once the queue serves a proposal, reflecting the default
    // worktree mode (manual → "Review each change" active).
    const control = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>("[data-autonomy-control]");
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 15_000 },
    );
    const group = within(control).getByRole("radiogroup", { name: "Autonomy" });
    expect(
      within(group)
        .getByRole("radio", { name: "Review each change" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    // Switch to "Apply automatically": the real POST /mode fires and the served
    // policy round-trips to autonomous.
    fireEvent.click(within(group).getByRole("radio", { name: "Apply automatically" }));
    await waitFor(
      async () => {
        const after = await liveAuthoring.projectProposal(changesetId);
        expect(after?.proposal.policy?.effective_mode).toBe("autonomous");
      },
      { timeout: 15_000 },
    );
    // The control reflects the round-tripped mode.
    await waitFor(
      () =>
        expect(
          document.querySelector("[data-autonomy-control]")?.getAttribute("data-mode"),
        ).toBe("autonomous"),
      { timeout: 15_000 },
    );
    // The worktree mode is restored to the default in `afterEach` (crash-safe),
    // regardless of how this test exits.
  });
});
