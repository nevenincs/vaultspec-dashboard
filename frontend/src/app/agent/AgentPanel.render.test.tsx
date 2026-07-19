// @vitest-environment happy-dom
//
// AgentPanel shell render tests. Online against
// the real `vaultspec serve` the global setup spawns (the agent client is bound to
// the live transport in `liveSetup`) — never a mocked wire. Covers the mount
// gating (nothing when collapsed) and the honest transcript container states off
// `useSession`: the no-session empty, the created-session "No messages yet" empty,
// and the 422 error a bad/expired session id faults into (never a fabricated empty
// snapshot). Core vitest matchers only.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import {
  AuthoringClient,
  getAuthoringStreamCursor,
  resetAuthoringStreamCursor,
} from "../../stores/server/authoring";
import { AgentClient } from "../../stores/server/agent";
import { useAgentPanel } from "../../stores/view/agentPanel";
import { AgentPanel } from "./AgentPanel";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function resetStore(): void {
  useAgentPanel.setState({
    open: false,
    currentSessionId: null,
    panelView: "transcript",
  });
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  resetAuthoringStreamCursor();
  resetStore();
});

function renderPanel() {
  const runtime = createTestLocalizationRuntime();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <AgentPanel className="col-start-4" />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

/** Create a real, empty session in the live engine and return its id (for the
 *  "No messages yet" empty state). Mints a registered actor exactly as the comment
 *  live suite does — the agent commands present the same token. */
async function createLiveSession(prompt?: string): Promise<string> {
  const authoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
  const agent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
  const issued = await authoring.issueActorToken({
    actor: { id: `human:agent-panel-${run}`, kind: "human" },
  });
  const scope = await liveScope();
  const outcome = await agent.createSession(
    { scope, title: `Panel live ${run}` },
    { actorToken: issued.raw_token },
  );
  if (outcome.kind !== "settled") throw new Error("session did not settle");
  if (prompt) {
    const turned = await agent.startTurn(
      outcome.session_id,
      { prompt },
      { actorToken: issued.raw_token },
    );
    if (turned.kind !== "settled") throw new Error("turn did not settle");
  }
  return outcome.session_id;
}

describe("AgentPanel mount gating", () => {
  it("owns the lifecycle feed while collapsed without mounting review or comments", async () => {
    useAgentPanel.setState({ open: false });
    resetAuthoringStreamCursor();
    renderPanel();
    expect(document.querySelector("[data-agent-panel]")).toBeNull();
    expect(document.querySelector("[data-review-station]")).toBeNull();
    expect(document.querySelector("[data-comment-thread]")).toBeNull();
    await waitFor(() => {
      expect(getAuthoringStreamCursor().streamConnected).toBe(true);
    });
  });

  it("renders the docked region when open", () => {
    useAgentPanel.setState({ open: true });
    renderPanel();
    const panel = document.querySelector("[data-agent-panel]");
    expect(panel).not.toBeNull();
    // The composer slot is present in an empty session.
    expect(document.querySelector("[data-agent-composer-slot]")).not.toBeNull();
  });
});

describe("AgentPanel transcript states", () => {
  it("shows the no-session empty state when no session is current", () => {
    useAgentPanel.setState({ open: true, currentSessionId: null });
    renderPanel();
    expect(screen.getByText("Message the agent to start a conversation.")).toBeTruthy();
  });

  it("shows an honest error (not an empty snapshot) when the session id faults", async () => {
    useAgentPanel.setState({
      open: true,
      currentSessionId: `session:does-not-exist-${run}`,
    });
    renderPanel();
    await waitFor(
      () => {
        const block = document.querySelector('[data-state-block="degraded"]');
        expect(block).not.toBeNull();
      },
      { timeout: 10_000 },
    );
    expect(
      screen.getByText(
        "This conversation couldn’t be loaded. It may have expired. Open a new session.",
      ),
    ).toBeTruthy();
  });

  it("shows the 'No messages yet' empty state for a fresh session with no turns", async () => {
    const sessionId = await createLiveSession();
    useAgentPanel.setState({ open: true, currentSessionId: sessionId });
    renderPanel();
    await waitFor(() => expect(screen.getByText("No messages yet.")).toBeTruthy(), {
      timeout: 10_000,
    });
  });

  it("keeps sent prompts visible in a populated conversation", async () => {
    const prompt = `Summarize the active document ${run}`;
    const sessionId = await createLiveSession(prompt);
    useAgentPanel.setState({ open: true, currentSessionId: sessionId });
    renderPanel();
    await waitFor(() => expect(screen.getByText(prompt)).toBeTruthy(), {
      timeout: 10_000,
    });
    expect(document.querySelector("[data-agent-transcript-entries]")).not.toBeNull();
  });
});

describe("AgentPanel view switcher (review-surface-flow ADR F1)", () => {
  it("defaults to the conversation view: composer present, no pending inbox", () => {
    useAgentPanel.setState({ open: true, currentSessionId: null });
    renderPanel();
    expect(document.querySelector("[data-agent-view-switcher]")).not.toBeNull();
    expect(document.querySelector("[data-agent-composer-slot]")).not.toBeNull();
    expect(document.querySelector("[data-agent-pending-changes]")).toBeNull();
    // The switcher shows the conversation segment selected.
    expect(
      screen.getByRole("radio", { name: "Conversation" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("switches to the pending-changes inbox: queue body shown, composer hidden", () => {
    useAgentPanel.setState({ open: true, currentSessionId: null });
    renderPanel();
    fireEvent.click(screen.getByRole("radio", { name: "Pending changes" }));
    expect(document.querySelector("[data-agent-pending-changes]")).not.toBeNull();
    // The inbox carries no composer of its own.
    expect(document.querySelector("[data-agent-composer-slot]")).toBeNull();
    // And no transcript container in the pending view.
    expect(document.querySelector("[data-agent-transcript]")).toBeNull();
  });

  it("opens directly in the pending view when the store targets it", () => {
    useAgentPanel.setState({
      open: true,
      currentSessionId: null,
      panelView: "pending",
    });
    renderPanel();
    expect(document.querySelector("[data-agent-pending-changes]")).not.toBeNull();
    expect(document.querySelector("[data-agent-composer-slot]")).toBeNull();
  });
});

/** Seed a live, out-of-session pending proposal (not correlated to the panel's
 *  current session) so the bridge has something to signpost. Mirrors the authoring
 *  live suites' create+submit flow against the scratch fixture; created proposals
 *  accumulate in the shared queue exactly as the sibling live tests leave them. */
async function seedOutOfSessionProposal(): Promise<void> {
  const authoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
  const agent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
  const engine = createLiveClient();
  const token = (
    await authoring.issueActorToken({
      actor: { id: `agent:bridge-${run}`, kind: "agent" },
    })
  ).raw_token;
  const scope = await liveScope();
  const created = await agent.createSession(
    { scope, title: `bridge seed ${run}` },
    { actorToken: token },
  );
  if (created.kind !== "settled") throw new Error("seed session did not settle");
  const stem = "2026-01-04-beta-research";
  const nodeId = `doc:${stem}`;
  const content = await engine.content(nodeId, scope);
  const baseRevision = `blob:${content.blob_hash}`;
  const changesetId = `changeset_bridge_${run}`;
  const proposed = await authoring.createProposal(
    {
      session_id: created.session_id,
      changeset_id: changesetId,
      summary: "Bridge live-test proposal",
      operations: [
        {
          child_key: "child_1",
          operation: "replace_body",
          target: {
            document: {
              kind: "existing",
              scope,
              node_id: nodeId,
              stem,
              path: ".vault/research/2026-01-04-beta-research.md",
              doc_type: "research",
              base_revision: baseRevision,
            },
            base_revision: baseRevision,
            current_revision: baseRevision,
          },
          draft: {
            mode: "whole_document",
            body:
              "---\ntags:\n  - '#research'\n  - '#beta'\ndate: '2026-01-04'\n---\n\n" +
              "# `beta` research: scope\n\nAdded by the pending-bridge render test.\n",
          },
        },
      ],
    },
    { actorToken: token },
  );
  if (proposed.kind !== "ok") throw new Error("seed proposal was not accepted");
  const queued = await authoring.projectProposal(changesetId);
  await authoring.submitForReview(
    changesetId,
    { expected_revision: queued!.proposal.changeset_revision, summary: "ready" },
    { actorToken: token },
  );
}

describe("AgentPanel autonomy + bridge (review-surface-flow ADR F2/F1)", () => {
  it("renders the autonomy control composer-adjacent in the transcript view", async () => {
    useAgentPanel.setState({
      open: true,
      currentSessionId: null,
      panelView: "transcript",
    });
    renderPanel();
    // The served scope-level mode (GET /v1/mode) resolves to a default, so the
    // control renders even with an empty queue — composer-adjacent, inside the panel.
    const control = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>("[data-autonomy-control]");
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 15_000 },
    );
    const panel = document.querySelector("[data-agent-panel]");
    const composer = document.querySelector("[data-agent-composer-slot]");
    expect(panel?.contains(control)).toBe(true);
    expect(composer).not.toBeNull();
    // Composer-adjacent: the control sits ABOVE the composer in document order.
    expect(
      control.compareDocumentPosition(composer!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not render the autonomy control (or a composer) in the pending view", () => {
    useAgentPanel.setState({
      open: true,
      currentSessionId: null,
      panelView: "pending",
    });
    renderPanel();
    // The pending view hosts only the queue body — structurally no autonomy control
    // and no composer (the inbox has neither).
    expect(document.querySelector("[data-agent-pending-changes]")).not.toBeNull();
    expect(document.querySelector("[data-autonomy-control]")).toBeNull();
    expect(document.querySelector("[data-agent-composer-slot]")).toBeNull();
  });

  it("shows the pending bridge for out-of-session changes and switches to the inbox", async () => {
    await seedOutOfSessionProposal();
    useAgentPanel.setState({
      open: true,
      currentSessionId: null,
      panelView: "transcript",
    });
    renderPanel();
    const bridge = await waitFor(
      () => {
        const el = document.querySelector<HTMLElement>("[data-pending-changes-bridge]");
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 15_000 },
    );
    // The affordance is composer-adjacent in the transcript view (not a modal).
    expect(document.querySelector("[data-agent-panel]")?.contains(bridge)).toBe(true);
    fireEvent.click(bridge);
    // Clicking switches the panel to the pending inbox view.
    expect(useAgentPanel.getState().panelView).toBe("pending");
    await waitFor(() =>
      expect(document.querySelector("[data-agent-pending-changes]")).not.toBeNull(),
    );
  });
});

describe("AgentPanel header", () => {
  it("opens the sessions menu and offers New session", () => {
    useAgentPanel.setState({ open: true, currentSessionId: null });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("menuitem", { name: "New session" })).toBeTruthy();
  });
});
