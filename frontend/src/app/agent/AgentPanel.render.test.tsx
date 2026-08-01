// @vitest-environment happy-dom
//
// AgentPanel shell render tests. Online against
// the real `vaultspec serve` the global setup spawns (the agent client is bound to
// the live transport in `liveSetup`) — never a mocked wire. Covers the mount
// contract (the body is unconditional now — the center slot decides whether it is
// mounted at all, and the lifecycle feed outlives it) and the honest transcript
// container states off `useSession`: the no-session empty, the created-session
// "No messages yet" empty, and the 422 error a bad/expired session id faults into
// (never a fabricated empty snapshot). Core vitest matchers only.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import { a2aKeys, type ActiveRunsResult } from "../../stores/server/agent/a2aTeam";
import {
  setAgentPanelView,
  setAgentTeamRun,
  useAgentPanel,
} from "../../stores/view/agentPanel";
import { AgentLifecycleHost, AgentPanel } from "./AgentPanel";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const canonicalTiers = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

function resetStore(): void {
  useAgentPanel.setState({
    currentSessionId: null,
    panelView: "transcript",
    teamRunId: null,
    teamRunPrompt: null,
    teamRunScope: null,
  });
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  resetAuthoringStreamCursor();
  resetStore();
});

function renderPanel(
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <AgentPanel />
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
  it("keeps the lifecycle feed alive without mounting the panel, review, or comments", async () => {
    // The feed must OUTLIVE the panel: the panel body now unmounts whenever the
    // graph takes the center slot back, but the footer AgentChip still has to trace
    // a streaming run, so the subscription is the shell's, not the panel's.
    resetAuthoringStreamCursor();
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={new QueryClient()}>
          <AgentLifecycleHost />
        </QueryClientProvider>
      </I18nextProvider>,
    );
    expect(document.querySelector("[data-agent-panel]")).toBeNull();
    expect(document.querySelector("[data-review-station]")).toBeNull();
    expect(document.querySelector("[data-comment-thread]")).toBeNull();
    await waitFor(() => {
      expect(getAuthoringStreamCursor().streamConnected).toBe(true);
    });
  });

  it("renders its region whenever it is mounted, carrying no open flag of its own", () => {
    // The panel body is unconditional: WHETHER it renders is the center slot's
    // decision, made by DockWorkspace, so nothing here re-decides it.
    renderPanel();
    const panel = document.querySelector("[data-agent-panel]");
    expect(panel).not.toBeNull();
    // The composer slot is present in an empty session.
    expect(document.querySelector("[data-agent-composer-slot]")).not.toBeNull();
    // No panel-owned resize handle: the dock sash is the one size control now.
    expect(panel?.querySelector("[role=separator]")).toBeFalsy();
  });
});

describe("AgentPanel transcript states", () => {
  it("never renders an A-bound team run after scope B is active", async () => {
    const scope = await liveScope();
    useAgentPanel.setState({
      currentSessionId: null,
      teamRunId: "run-from-a",
      teamRunPrompt: "A prompt",
      teamRunScope: `${scope}-other`,
    });
    renderPanel();
    expect(document.querySelector("[data-team-run]")).toBeNull();
    await waitFor(() => expect(useAgentPanel.getState().teamRunId).toBeNull());
  });

  it("consumes a recovered discovery snapshot before a dismissed run can rebind", async () => {
    const scope = await liveScope();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = a2aKeys.activeRuns(scope);
    const discovery: ActiveRunsResult = {
      state: "active",
      runs: [{ run_id: "run-recovered", status: "running" }],
      truncated: false,
      contractValid: true,
    };
    useAgentPanel.setState({ currentSessionId: null });
    renderPanel(queryClient);
    await waitFor(
      () => expect(queryClient.getQueryState(key)?.fetchStatus).toBe("idle"),
      { timeout: 10_000 },
    );
    queryClient.setQueryData(key, { ...discovery, tiers: canonicalTiers });
    await waitFor(() =>
      expect(useAgentPanel.getState().teamRunId).toBe("run-recovered"),
    );
    expect(queryClient.getQueryData(key)).toBeUndefined();

    setAgentTeamRun(null);
    await waitFor(
      () => expect(queryClient.getQueryState(key)?.fetchStatus).toBe("idle"),
      { timeout: 10_000 },
    );
    expect(useAgentPanel.getState().teamRunId).toBeNull();
  });

  it("refetches bounded discovery whenever recovery is reactivated", async () => {
    const scope = await liveScope();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const key = a2aKeys.activeRuns(scope);
    queryClient.setQueryData(key, {
      state: "active",
      runs: [],
      truncated: false,
      contractValid: true,
      tiers: canonicalTiers,
    } satisfies ActiveRunsResult);
    const seededAt = queryClient.getQueryState(key)?.dataUpdatedAt ?? 0;

    useAgentPanel.setState({ currentSessionId: null });
    renderPanel(queryClient);
    await waitFor(
      () => {
        const state = queryClient.getQueryState(key);
        expect(state?.fetchStatus).toBe("idle");
        expect(
          Math.max(state?.dataUpdatedAt ?? 0, state?.errorUpdatedAt ?? 0),
        ).toBeGreaterThan(seededAt);
      },
      { timeout: 10_000 },
    );
    const firstState = queryClient.getQueryState(key);
    const firstUpdatedAt = Math.max(
      firstState?.dataUpdatedAt ?? 0,
      firstState?.errorUpdatedAt ?? 0,
    );

    // Deactivate and reactivate recovery. The panel no longer carries an open flag
    // to flip — leaving the center slot unmounts the whole body, which this test
    // cannot drive because it renders the panel directly rather than through the
    // dock. The pending/transcript transition is the OTHER path the recovery host
    // is documented to unmount across, and it exercises the same remount.
    act(() => setAgentPanelView("pending"));
    await waitFor(() =>
      expect(document.querySelector("[data-agent-transcript]")).toBeNull(),
    );
    act(() => setAgentPanelView("transcript"));
    await waitFor(
      () => {
        const state = queryClient.getQueryState(key);
        expect(state?.fetchStatus).toBe("idle");
        expect(
          Math.max(state?.dataUpdatedAt ?? 0, state?.errorUpdatedAt ?? 0),
        ).toBeGreaterThan(firstUpdatedAt);
      },
      { timeout: 10_000 },
    );
    expect(useAgentPanel.getState().teamRunId).toBeNull();
  });

  it("shows the no-session empty state when no session is current", () => {
    useAgentPanel.setState({ currentSessionId: null });
    renderPanel();
    expect(screen.getByText("Message the agent to start a conversation.")).toBeTruthy();
  });

  it("shows an honest error (not an empty snapshot) when the session id faults", async () => {
    useAgentPanel.setState({
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
    useAgentPanel.setState({ currentSessionId: sessionId });
    renderPanel();
    await waitFor(() => expect(screen.getByText("No messages yet.")).toBeTruthy(), {
      timeout: 10_000,
    });
  });

  it("keeps sent prompts visible in a populated conversation", async () => {
    const prompt = `Summarize the active document ${run}`;
    const sessionId = await createLiveSession(prompt);
    useAgentPanel.setState({ currentSessionId: sessionId });
    renderPanel();
    await waitFor(() => expect(screen.getByText(prompt)).toBeTruthy(), {
      timeout: 10_000,
    });
    expect(document.querySelector("[data-agent-transcript-entries]")).not.toBeNull();
  });
});

describe("AgentPanel view switcher", () => {
  it("defaults to the conversation view: composer present, no pending inbox", () => {
    useAgentPanel.setState({ currentSessionId: null });
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
    useAgentPanel.setState({ currentSessionId: null });
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

describe("AgentPanel autonomy + bridge", () => {
  it("renders the autonomy control composer-adjacent in the transcript view", async () => {
    useAgentPanel.setState({
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
    useAgentPanel.setState({ currentSessionId: null });
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Sessions" }));
    expect(screen.getByRole("menuitem", { name: "New session" })).toBeTruthy();
  });
});
