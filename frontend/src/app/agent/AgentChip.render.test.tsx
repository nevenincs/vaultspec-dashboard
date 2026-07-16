// @vitest-environment happy-dom
//
// AgentChip visibility-gating render tests.
// ONLINE against the real engine (the agent client is bound to the live transport
// in `liveSetup`). The chip is the COLLAPSED affordance: it renders NOTHING with
// no current session, NOTHING while the panel is open, and shows "Agent working"
// only while a run streams with the panel collapsed. The streaming case rides a
// real session + turn (which opens an active run) — never a stubbed run state.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { AuthoringClient, newIdempotencyKey } from "../../stores/server/authoring";
import { AgentClient } from "../../stores/server/agent";
import { useAgentPanel } from "../../stores/view/agentPanel";
import { AgentChip, useAgentChipView } from "./AgentChip";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

function resetStore(): void {
  useAgentPanel.setState({ open: false, currentSessionId: null });
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  resetStore();
});

/** Mirrors the cluster: resolve the view and render the chip only when non-null,
 *  so the visibility gating is exercised exactly as it ships. */
function Harness() {
  const view = useAgentChipView();
  if (view === null) return null;
  return (
    <AgentChip
      view={view}
      onToggle={() => undefined}
      chipRef={() => undefined}
      tabIndex={0}
      onKeyDown={() => undefined}
      onFocus={() => undefined}
    />
  );
}

function renderChip() {
  const runtime = createTestLocalizationRuntime();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

let streamingSessionId: string;

/** A live session with an ACTIVE run (a started turn opens one) — the state that
 *  surfaces the chip. */
beforeAll(async () => {
  const authoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
  const agent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
  const issued = await authoring.issueActorToken({
    actor: { id: `human:agent-chip-${run}`, kind: "human" },
  });
  const token = issued.raw_token;
  const scope = await liveScope();
  const created = await agent.createSession(
    { scope, title: `Chip live ${run}` },
    { actorToken: token, idempotencyKey: newIdempotencyKey(`chip-session-${run}`) },
  );
  if (created.kind !== "settled") throw new Error("session did not settle");
  streamingSessionId = created.session_id;
  await agent.startTurn(
    streamingSessionId,
    { prompt: "Draft an intro." },
    { actorToken: token, idempotencyKey: newIdempotencyKey(`chip-turn-${run}`) },
  );
});

describe("AgentChip visibility gating", () => {
  it("renders nothing when no session is current", () => {
    useAgentPanel.setState({ open: false, currentSessionId: null });
    renderChip();
    expect(document.querySelector("[data-agent-chip]")).toBeNull();
  });

  it("shows 'Agent working' while a run streams with the panel collapsed", async () => {
    useAgentPanel.setState({ open: false, currentSessionId: streamingSessionId });
    renderChip();
    await waitFor(
      () => expect(document.querySelector("[data-agent-chip]")).not.toBeNull(),
      { timeout: 10_000 },
    );
    expect(screen.getByText("Agent working")).toBeTruthy();
  });

  it("renders nothing while the panel is open, even with a streaming run", async () => {
    useAgentPanel.setState({ open: true, currentSessionId: streamingSessionId });
    renderChip();
    // Give the session query time to resolve; the chip must still stay hidden
    // because the panel (its expanded form) is already open.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(document.querySelector("[data-agent-chip]")).toBeNull();
  });
});

describe("AgentChip presentation", () => {
  it("renders the working label + run state and fires the shared toggle on click", () => {
    const runtime = createTestLocalizationRuntime();
    let toggleCount = 0;
    const onToggle = () => {
      toggleCount += 1;
    };
    render(
      <I18nextProvider i18n={runtime}>
        <AgentChip
          view={{
            runStatus: "active",
            workingLabel: "Agent working",
            stateLabel: "Running",
            accessibleName: "Agent working, Running",
          }}
          onToggle={onToggle}
          chipRef={() => undefined}
          tabIndex={0}
          onKeyDown={() => undefined}
          onFocus={() => undefined}
        />
      </I18nextProvider>,
    );
    const chip = screen.getByRole("button", { name: "Agent working, Running" });
    expect(chip.getAttribute("data-run-status")).toBe("active");
    expect(screen.getByText("Running")).toBeTruthy();
    fireEvent.click(chip);
    expect(toggleCount).toBe(1);
  });
});
