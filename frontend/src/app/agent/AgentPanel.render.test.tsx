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
import { liveScope, liveTransport } from "../../testing/liveClient";
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
  useAgentPanel.setState({ open: false, currentSessionId: null });
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

describe("AgentPanel header", () => {
  it("opens the sessions menu and offers New session", () => {
    useAgentPanel.setState({ open: true, currentSessionId: null });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("menuitem", { name: "New session" })).toBeTruthy();
  });
});
