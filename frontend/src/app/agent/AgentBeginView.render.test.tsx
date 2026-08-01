// @vitest-environment happy-dom
//
// The begin idiom's rendered surface (plan P06.S24; research G1/G2/G4/G11). Online
// against the real `vaultspec serve` the global setup spawns, like the sibling
// AgentPanel suite — never a mocked wire.
//
// What matters here is what the user actually gets on a cold open: a question that
// names their workspace, the composer sitting under it as the first thing to type
// into, starters that step aside the moment there is history to offer instead — and,
// when the served agent tier says the plane is down, none of that invitation at all.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { en } from "../../locales/en";
import { createTestLocalizationRuntime } from "../../localization/testing";
import { liveScope } from "../../testing/liveClient";
import { a2aKeys } from "../../stores/server/agent/a2aTeam";
import { useAgentPanel } from "../../stores/view/agentPanel";
import { useComposerDraft } from "./composerDraft";
import { AgentBeginView } from "./AgentBeginView";

const AGENT_DOWN_REASON = "The agent orchestration service is not running.";

/** Render the begin view against the live engine, with ONE cached read seeded: the
 *  presets response the Team-selector state derives the agent tier's verdict from.
 *  Nothing about the transport is faked — but whether a2a happens to be up on the
 *  machine running this suite is not the subject here, and the posture must be
 *  pinned for the assertions to mean anything in either direction. */
function renderBegin(seeds: string[] = [], options: { agentDown?: boolean } = {}) {
  const runtime = createTestLocalizationRuntime();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(
    a2aKeys.presets(),
    options.agentDown === true
      ? {
          presets: [],
          tiers: { agent: { available: false, reason: AGENT_DOWN_REASON } },
        }
      : { presets: [] },
  );
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <AgentBeginView onSeed={(seed) => seeds.push(seed)} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  useAgentPanel.setState({ currentSessionId: null, pendingChangesOpen: false });
  useComposerDraft.setState({ seed: null });
});
afterEach(cleanup);

describe("AgentBeginView", () => {
  it("asks a question that names the bound workspace", async () => {
    const scope = await liveScope();
    renderBegin();
    // G2: the headline is personalized from REAL context — once the served scope
    // resolves it carries a workspace name, with the full path as its title so the
    // short name is never ambiguous. Before it resolves the unbound wording shows,
    // which is why this waits for the binding rather than asserting on first paint.
    const headline = await waitFor(
      () => {
        const el = document.querySelector("[data-agent-begin-headline]");
        expect(el?.getAttribute("title")).toBe(scope);
        return el!;
      },
      { timeout: 15_000 },
    );
    expect(headline.textContent ?? "").toMatch(/\S/u);
  });

  it("puts the composer in the begin state, not a dashboard in front of it", () => {
    renderBegin();
    // G1: the empty state IS the composer — the same component the continue posture
    // bottom-docks, mounted here under the headline.
    expect(document.querySelector("[data-agent-composer-slot]")).not.toBeNull();
    expect(document.querySelector("[data-agent-composer]")).not.toBeNull();
  });

  it("offers starter verbs that seed the draft rather than running anything", async () => {
    const seeds: string[] = [];
    renderBegin(seeds);
    const starters = await waitFor(() => {
      const el = document.querySelector("[data-agent-begin-starters]");
      expect(el).not.toBeNull();
      return el!;
    });
    const buttons = starters.querySelectorAll("[data-agent-starter]");
    expect(buttons.length).toBeGreaterThan(0);

    act(() => {
      fireEvent.click(buttons[0]!);
    });
    // A starter is a scaffold: it hands the composer an opening and stops. It must
    // not have started a run or bound a session.
    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toMatch(/\S/u);
    expect(useAgentPanel.getState().currentSessionId).toBeNull();
  });

  it("never shows starters and recents at once", async () => {
    renderBegin();
    await waitFor(() => {
      const starters = document.querySelector("[data-agent-begin-starters]");
      const recents = document.querySelector("[data-agent-begin-recents]");
      // G4/G11: exactly one of the two is present. Which one depends on whether the
      // live engine has session history, so the invariant — never both, never
      // neither — is what is asserted, not which branch this environment lands in.
      expect(Boolean(starters) !== Boolean(recents)).toBe(true);
    });
  });

  it("invites normally while the served agent tier is healthy", async () => {
    renderBegin();
    await waitFor(() => {
      expect(
        document.querySelector('[data-agent-begin-posture="invite"]'),
      ).not.toBeNull();
    });
    // The healthy direction of the same rule: the invitation is present and the
    // degraded block is not, so the unavailable posture cannot be a state the panel
    // simply falls into.
    expect(document.querySelector("[data-agent-begin-headline]")).not.toBeNull();
    expect(document.querySelector('[data-state-block="degraded"]')).toBeNull();
  });

  it("does not invite a prompt the degraded agent plane could not start", async () => {
    renderBegin([], { agentDown: true });
    const block = await waitFor(() => {
      const el = document.querySelector('[data-state-block="degraded"]');
      expect(el).not.toBeNull();
      return el!;
    });
    // The honest posture speaks the PARKED transcript-unavailable sentence — the
    // catalogue's own wording, not a second one invented for this surface.
    expect(block.textContent).toContain(en.common.agent.transcript.unavailable);
    // Nothing that asks the user to start something survives: no headline question,
    // no starter verbs, no recents offering conversations to reopen.
    expect(
      document.querySelector('[data-agent-begin-posture="unavailable"]'),
    ).not.toBeNull();
    expect(document.querySelector("[data-agent-begin-headline]")).toBeNull();
    expect(document.querySelector("[data-agent-begin-starters]")).toBeNull();
    expect(document.querySelector("[data-agent-begin-recents]")).toBeNull();
    // G10: the status never BLOCKS. The composer stays mounted and carries its own
    // disabled-with-reason controls rather than vanishing.
    expect(document.querySelector("[data-agent-composer-slot]")).not.toBeNull();
    expect(document.querySelector("[data-agent-composer]")).not.toBeNull();
  });
});
