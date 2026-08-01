// @vitest-environment happy-dom
//
// The begin idiom's rendered surface (plan P06.S24; research G1/G2/G4/G11). Online
// against the real `vaultspec serve` the global setup spawns, like the sibling
// AgentPanel suite — never a mocked wire.
//
// What matters here is what the user actually gets on a cold open: a question that
// names their workspace, the composer sitting under it as the first thing to type
// into, and starters that step aside the moment there is history to offer instead.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { liveScope } from "../../testing/liveClient";
import { useAgentPanel } from "../../stores/view/agentPanel";
import { useComposerDraft } from "./composerDraft";
import { AgentBeginView } from "./AgentBeginView";

function renderBegin(seeds: string[] = []) {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AgentBeginView onSeed={(seed) => seeds.push(seed)} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  useAgentPanel.setState({ currentSessionId: null, panelView: "transcript" });
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
});
