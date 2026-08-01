// @vitest-environment happy-dom
//
// S45 — the autonomy control presents as a PILL in the composer's row 2.
//
// The defect this replaces was invisible to every unit test: the control was
// individually correct and individually green, and only overlapped the row's
// right-hand cluster once rendered at panel width. So these assertions are about
// the SHAPE the row receives — one compact trigger, its two options behind it —
// rather than about the toggle's behaviour, which is unchanged and still tested
// where `AutonomyControl` itself lives.

import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { authoringKeys } from "../../stores/server/authoring";
import { useViewStore } from "../../stores/view/viewStore";
import { AgentAutonomyControl, autonomyModeMessageKey } from "./AgentAutonomyControl";

const SCOPE = "Y:/scope";

let client: QueryClient;

function seed(mode: string): void {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  useViewStore.setState({ scope: SCOPE } as never);
  // The served scope-level mode is the pre-proposal fallback `useReviewStationView`
  // reads, so an EMPTY queue still yields an observable mode.
  client.setQueryData(authoringKeys.operationMode(), mode);
  client.setQueryData(authoringKeys.proposals(), {
    items: [],
    applied_under_policy: { items: [] },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  client?.clear();
});

function renderControl() {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <AgentAutonomyControl />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("autonomyModeMessageKey", () => {
  it("names the two modes the toggle offers", () => {
    expect(autonomyModeMessageKey("manual")).toBe("common:agent.autonomy.reviewEach");
    expect(autonomyModeMessageKey("autonomous")).toBe(
      "common:agent.autonomy.applyAutomatically",
    );
  });

  it("refuses to name a mode it cannot offer", () => {
    // `assisted` is a served mode with no segment. Mapping it onto one of the two
    // we can name would have the pill claim a posture the worktree is not in.
    expect(autonomyModeMessageKey("assisted")).toBeNull();
  });
});

describe("the autonomy pill", () => {
  it("renders ONE compact trigger, not a labelled block", async () => {
    seed("manual");
    renderControl();
    await waitFor(() => {
      expect(document.querySelector("[data-agent-autonomy-trigger]")).not.toBeNull();
    });
    // The whole point of S45: the two options are not standing in the row. Exactly
    // one interactive control is present until the pill is opened.
    expect(document.querySelectorAll("[data-agent-autonomy] button")).toHaveLength(1);
    expect(document.querySelector("[data-autonomy-control]")).toBeNull();
  });

  it("names the served mode on the pill", async () => {
    seed("manual");
    renderControl();
    await waitFor(() => {
      const trigger = document.querySelector("[data-agent-autonomy] button");
      expect(trigger?.textContent).toContain("Review each change");
    });
    expect(
      document.querySelector("[data-agent-autonomy]")?.getAttribute("data-autonomy-mode"),
    ).toBe("manual");
  });

  it("puts the two-option control behind the pill", async () => {
    seed("autonomous");
    renderControl();
    await waitFor(() => {
      expect(document.querySelector("[data-agent-autonomy] button")).not.toBeNull();
    });
    fireEvent.click(document.querySelector("[data-agent-autonomy] button") as HTMLElement);
    await waitFor(() => {
      expect(document.querySelector("[data-agent-autonomy-menu]")).not.toBeNull();
    });
    // The SAME control the review station hosts, unchanged — so its refusal
    // feedback and busy lockout still come from one place.
    const expanded = document.querySelector("[data-autonomy-control]");
    expect(expanded).not.toBeNull();
    expect(expanded?.getAttribute("data-mode")).toBe("autonomous");
  });

  it("renders nothing at all when no mode is observable", () => {
    // Unchanged from before S45: an unobservable mode yields no control rather
    // than a fabricated selection.
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    useViewStore.setState({ scope: SCOPE } as never);
    renderControl();
    expect(document.querySelector("[data-agent-autonomy]")).toBeNull();
  });
});
