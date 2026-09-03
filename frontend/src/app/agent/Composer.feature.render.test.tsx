// @vitest-environment happy-dom
//
// S44 — the standing feature chip, asserted at the level the OPERATOR sees it.
//
// The pure rules live in `agentFeature.test.ts`. This file exists because the defect
// that made S44 necessary was invisible to unit tests: every layer below the composer
// was green while the composer simply never put `feature_tag` on the wire, and the
// only witness was a live sibling refusing the run. So these assertions render the
// REAL Composer over SERVED preset shapes and check the rendered chip, the held start,
// and — the load-bearing one — the actual run-start request body.
//
// The wire is intercepted at `fetch`, so the assertion is about what would leave the
// browser, not about what an adapter was asked to build.

import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import {
  a2aKeys,
  type ProviderCatalogResult,
  type TeamPreset,
} from "../../stores/server/agent/a2aTeam";
import { engineKeys } from "../../stores/server/queries/internal";
import { useViewStore } from "../../stores/view/viewStore";
import { useAgentPanel } from "../../stores/view/agentPanel";
import { useAgentComposer } from "../../stores/view/agentComposer";
import { Composer } from "./Composer";

const SCOPE = "Y:/scope";
const DOC_STEM = "2026-08-01-agent-panel-plan";

/** A served preset, shaped as `presets-list` actually serves it. */
const servedPreset = (id: string, capability: string): TeamPreset => ({
  id,
  display_name: id,
  loadable: true,
  required_roles: [],
  is_mock: false,
  authoring_capability: capability,
});

const SERVED_CATALOG: ProviderCatalogResult = {
  providers: [
    {
      provider_id: "provider-issued-id",
      display_name: "Provider-issued display",
      execution_mode: "execution-lane-issued-id",
      health: {
        configured: "available",
        transport: "available",
        authentication: "authenticated",
        catalog: "available",
        admission: "admitted",
        selectable: true,
        reasons: [],
      },
      catalog: {
        state: {
          status: "available",
          revision: "catalog-revision-issued-id",
          checked_at: "2026-08-02T09:00:00Z",
          expires_at: "2099-08-02T09:00:00Z",
        },
        models: [
          {
            entry_id: "entry-issued-id",
            display_name: "Entry-issued display",
            capabilities: [],
          },
        ],
        native_controls: [],
      },
    },
  ],
};

const VAULT_TREE = {
  entries: [
    {
      path: ".vault/plan/2026-08-01-agent-panel-plan.md",
      title: "Agent panel plan",
      feature_tags: ["agent-panel"],
      doc_type: "plan",
    },
    {
      path: ".vault/research/2026-07-31-loose-research.md",
      title: "Loose research",
      feature_tags: [],
      doc_type: "research",
    },
  ],
  complete: true,
};

let client: QueryClient;
let fetchCalls: { url: string; body: unknown }[];

function seed(presets: TeamPreset[], activeDocId: string | null): void {
  // `staleTime: Infinity` so the SEEDED reads stand: `useVaultTree` sets no
  // staleTime of its own, so with the default it refetches on mount and the
  // intercepted fetch would replace the corpus with an empty one.
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  client.setQueryData(a2aKeys.presets(), { presets });
  client.setQueryData(a2aKeys.providerCatalog(SCOPE), SERVED_CATALOG);
  client.setQueryData(engineKeys.vaultTree(SCOPE), VAULT_TREE);
  useViewStore.setState({
    scope: SCOPE,
    // `OpenDoc` is keyed by `nodeId` (the dockview panel id), and `activeDocId` is
    // only honoured while it names an open tab.
    openDocs:
      activeDocId === null
        ? []
        : [{ nodeId: activeDocId, provisional: false, scope: SCOPE }],
    activeDocId,
  } as never);
  useAgentPanel.setState({
    currentSessionId: null,
    teamRunId: null,
    teamRunScope: null,
  });
  useAgentComposer.setState({ mentions: [], commentBatch: null });
}

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: unknown;
    try {
      body = init?.body === undefined ? null : JSON.parse(String(init.body));
    } catch {
      body = String(init?.body);
    }
    fetchCalls.push({ url, body });
    return new Response(
      JSON.stringify({ data: { envelope: { run_id: "run-1", status: "queued" } } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  client?.clear();
});

function renderComposer() {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <Composer />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

/** Open the Team menu and pick a preset by its served id. */
async function pickPreset(id: string): Promise<void> {
  const trigger = document.querySelector(
    "[data-composer-team-trigger] button",
  ) as HTMLButtonElement | null;
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger!);
  await waitFor(() => {
    expect(document.querySelector(`[data-team-preset="${id}"]`)).not.toBeNull();
  });
  fireEvent.click(document.querySelector(`[data-team-preset="${id}"]`) as HTMLElement);
}

async function pickCatalogEntry(): Promise<void> {
  const trigger = document.querySelector(
    "[data-composer-model-trigger] button",
  ) as HTMLButtonElement | null;
  expect(trigger).not.toBeNull();
  fireEvent.click(trigger!);
  await waitFor(() => {
    expect(
      document.querySelector('[data-model-entry-id="entry-issued-id"]'),
    ).not.toBeNull();
  });
  fireEvent.click(
    document.querySelector('[data-model-entry-id="entry-issued-id"]') as HTMLElement,
  );
}

function chip(): HTMLElement | null {
  return document.querySelector("[data-composer-feature]");
}

/** Enter on the input is the team start now (D11 — the Start button is deleted
 *  with the send arrow; no captured composer has either). */
function pressEnterToStart(): void {
  const el = document.querySelector("[data-composer-input]") as HTMLTextAreaElement;
  expect(el).not.toBeNull();
  fireEvent.keyDown(el, { key: "Enter" });
}

/** The selected preset's name on the team pill — the settle signal that team
 *  mode is armed (the former Start button's presence played this role). */
function teamPillNames(id: string): void {
  const trigger = document.querySelector(
    "[data-composer-team-trigger] button",
  ) as HTMLButtonElement;
  expect(trigger).not.toBeNull();
  expect(trigger.textContent ?? "").toContain(id);
}

describe("the standing feature chip", () => {
  it("shows no chip for a coding lane, which needs no feature", async () => {
    seed([servedPreset("vaultspec-doc-editor", "coding")], `doc:${DOC_STEM}`);
    renderComposer();
    await pickPreset("vaultspec-doc-editor");
    await waitFor(() => teamPillNames("vaultspec-doc-editor"));
    expect(chip()).toBeNull();
  });

  it("defaults the feature from the OPEN document and marks it as defaulted", async () => {
    seed(
      [servedPreset("vaultspec-adr-research", "document_authoring")],
      `doc:${DOC_STEM}`,
    );
    renderComposer();
    await pickPreset("vaultspec-adr-research");
    await waitFor(() => expect(chip()).not.toBeNull());
    await pickCatalogEntry();
    expect(chip()!.getAttribute("data-feature-tag")).toBe("agent-panel");
    expect(
      chip()!
        .querySelector("[data-composer-feature-trigger]")!
        .getAttribute("data-feature-source"),
    ).toBe("document");
  });

  it("still stands, unbound, when no document supplies a feature", async () => {
    // The chip is STANDING: a document-authoring lane always shows it, so the
    // missing binding is visible rather than implied by a disabled button.
    seed([servedPreset("vaultspec-adr-research", "document_authoring")], null);
    renderComposer();
    await pickPreset("vaultspec-adr-research");
    await waitFor(() => expect(chip()).not.toBeNull());
    expect(chip()!.getAttribute("data-feature-tag")).toBeNull();
    expect(
      chip()!
        .querySelector("[data-composer-feature-trigger]")!
        .getAttribute("data-feature-source"),
    ).toBe("none");
  });
});

describe("what actually reaches the wire", () => {
  it("puts the bound feature on run-start as feature_tag", async () => {
    seed(
      [servedPreset("vaultspec-adr-research", "document_authoring")],
      `doc:${DOC_STEM}`,
    );
    renderComposer();
    await pickPreset("vaultspec-adr-research");
    await waitFor(() => expect(chip()).not.toBeNull());
    await pickCatalogEntry();

    const input = document.querySelector(
      "[data-composer-input]",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Draft the decision record." } });
    pressEnterToStart();

    await waitFor(() => {
      expect(fetchCalls.some((call) => call.url.includes("run-start"))).toBe(true);
    });
    const runStart = fetchCalls.find((call) => call.url.includes("run-start"))!;
    // The exact field the sibling refuses the run without.
    expect((runStart.body as Record<string, unknown>).feature_tag).toBe("agent-panel");
    expect((runStart.body as Record<string, unknown>).selection).toEqual({
      schema_version: 1,
      provider_id: "provider-issued-id",
      execution_mode: "execution-lane-issued-id",
      catalog_revision: "catalog-revision-issued-id",
      entry_id: "entry-issued-id",
      controls: {},
    });
  });

  it("sends NO feature_tag for a coding lane", async () => {
    seed([servedPreset("vaultspec-doc-editor", "coding")], `doc:${DOC_STEM}`);
    renderComposer();
    await pickPreset("vaultspec-doc-editor");
    await pickCatalogEntry();

    const input = document.querySelector(
      "[data-composer-input]",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Tidy this document." } });
    pressEnterToStart();

    await waitFor(() => {
      expect(fetchCalls.some((call) => call.url.includes("run-start"))).toBe(true);
    });
    const runStart = fetchCalls.find((call) => call.url.includes("run-start"))!;
    expect("feature_tag" in (runStart.body as Record<string, unknown>)).toBe(false);
  });

  it("never starts a document-authoring run with no feature bound", async () => {
    seed([servedPreset("vaultspec-adr-research", "document_authoring")], null);
    renderComposer();
    await pickPreset("vaultspec-adr-research");
    await waitFor(() => expect(chip()).not.toBeNull());
    await pickCatalogEntry();

    const input = document.querySelector(
      "[data-composer-input]",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Draft the decision record." } });
    // The start is HELD: Enter is a no-op, and the composer says what is missing
    // rather than silently swallowing the keystroke.
    expect(document.querySelector("[data-composer-feature-hint]")).not.toBeNull();
    pressEnterToStart();
    expect(fetchCalls.some((call) => call.url.includes("run-start"))).toBe(false);
  });

  it("lets an explicit pick unblock the start and ride the wire", async () => {
    seed([servedPreset("vaultspec-adr-research", "document_authoring")], null);
    renderComposer();
    await pickPreset("vaultspec-adr-research");
    await waitFor(() => expect(chip()).not.toBeNull());
    await pickCatalogEntry();

    fireEvent.click(
      document.querySelector("[data-composer-feature-trigger]") as HTMLElement,
    );
    // Scoped to the feature menu: the composer's own textarea is also a combobox.
    const search = await waitFor(() => {
      const el = document.querySelector("[data-composer-feature-menu] input");
      expect(el).not.toBeNull();
      return el as HTMLInputElement;
    });
    fireEvent.change(search, { target: { value: "agent-panel" } });
    fireEvent.keyDown(search, { key: "Enter" });

    await waitFor(() => {
      expect(chip()!.getAttribute("data-feature-tag")).toBe("agent-panel");
    });
    const input = document.querySelector(
      "[data-composer-input]",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Draft the decision record." } });
    pressEnterToStart();

    await waitFor(() => {
      expect(fetchCalls.some((call) => call.url.includes("run-start"))).toBe(true);
    });
    const runStart = fetchCalls.find((call) => call.url.includes("run-start"))!;
    expect((runStart.body as Record<string, unknown>).feature_tag).toBe("agent-panel");
  });
});
