// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { en } from "../../locales/en";
import { createTestLocalizationRuntime } from "../../localization/testing";
import {
  engineClient,
  type DashboardState,
  type DashboardStatePatch,
  type FetchLike,
} from "../../stores/server/engine";
import { testQueryClient } from "../../stores/server/queries/testFixtures";
import { deriveCodeModuleLegend } from "../../stores/view/codeModuleLegend";
import { resetGraphControlsChrome } from "../../stores/view/graphControlsChrome";
import { useViewStore } from "../../stores/view/viewStore";
import { liveDegradedScope, liveTransport } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { CategoryLegend, CodeModuleLegendRows } from "./CategoryLegend";

function item(token: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-category-legend-item="${token}"]`,
  );
  if (!element) throw new Error(`Legend item unavailable: ${token}`);
  return element;
}

function toggle(): HTMLElement {
  const element = document.querySelector<HTMLElement>("[data-category-legend-toggle]");
  if (!element) throw new Error("Legend toggle unavailable");
  return element;
}

function renderLegend(client: ReturnType<typeof testQueryClient>) {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <CategoryLegend />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

describe("CategoryLegend behavior", () => {
  const client = testQueryClient();
  let scope: string;
  let originalState: DashboardState;
  let dashboardPatchCount = 0;
  const observedLiveTransport: FetchLike = (input, init) => {
    if (
      (init?.method ?? "GET").toUpperCase() === "PATCH" &&
      input.includes("/dashboard-state")
    ) {
      dashboardPatchCount += 1;
    }
    return liveTransport(input, init);
  };

  async function setDashboardState(patch: DashboardStatePatch): Promise<void> {
    await engineClient.patchDashboardState({ scope, ...patch });
    dashboardPatchCount = 0;
  }

  beforeAll(async () => {
    engineClient.useTransport(liveTransport);
    scope = await liveDegradedScope();
    originalState = await engineClient.dashboardState(scope);
  });

  beforeEach(async () => {
    engineClient.useTransport(observedLiveTransport);
    useViewStore.getState().setScope(scope);
    resetGraphControlsChrome();
    await setDashboardState({ corpus: "vault", filters: {} });
  });

  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(client.isFetching()).toBe(0), ENGINE_WAIT);
    client.clear();
    resetGraphControlsChrome();
    useViewStore.getState().setScope(null);
    engineClient.useTransport(liveTransport);
  });

  afterAll(async () => {
    const { tiers: _tiers, ...restoredState } = originalState;
    engineClient.useTransport(liveTransport);
    await engineClient.patchDashboardState(restoredState);
  });

  it("renders and compacts the document type toolbar without changing tokens", async () => {
    renderLegend(client);
    await screen.findByRole(
      "toolbar",
      { name: en.graph.legend.accessibility.documentTypeFilters },
      ENGINE_WAIT,
    );

    expect(
      document.querySelector("[data-category-legend-mode='expanded']"),
    ).toBeTruthy();
    expect(item("adr").querySelector("[data-category-legend-mark]")).toBeTruthy();
    expect(item("adr").textContent).toBe(en.documents.documentTypes.adr);
    expect(item("adr").className).toContain("opacity-100");
    expect(item("research").className).toContain("opacity-100");
    expect(document.querySelector('[data-category-legend-item="feature"]')).toBeNull();
    expect(toggle().textContent).toBe("");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle());
    expect(
      document.querySelector("[data-category-legend-mode='compact']"),
    ).toBeTruthy();
    expect(item("adr").querySelector("[data-category-legend-mark]")).toBeTruthy();
    expect(item("adr").textContent).toBe("");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle());
    expect(
      document.querySelector("[data-category-legend-mode='expanded']"),
    ).toBeTruthy();
    expect(item("adr").textContent).toBe(en.documents.documentTypes.adr);
    expect(dashboardPatchCount).toBe(0);
  });

  it("writes, presents, and clears real document type filters", async () => {
    const vocabulary = await engineClient.filters(scope);
    const preservedStatus = vocabulary.statuses?.[0];
    expect(preservedStatus).toBeTruthy();
    await setDashboardState({
      corpus: "vault",
      filters: { statuses: [preservedStatus!] },
    });
    const initialState = await engineClient.dashboardState(scope);
    expect(initialState.filters.statuses).toEqual([preservedStatus]);
    renderLegend(client);
    await screen.findByRole(
      "toolbar",
      { name: en.graph.legend.accessibility.documentTypeFilters },
      ENGINE_WAIT,
    );
    await waitFor(() => expect(client.isFetching()).toBe(0), ENGINE_WAIT);

    expect(item("adr").title).toBe(
      en.graph.legend.actions.addDocumentTypeFilter.replace(
        "{{documentType}}",
        en.documents.documentTypes.adr,
      ),
    );
    fireEvent.click(item("adr"));
    await waitFor(() => expect(item("adr").getAttribute("aria-pressed")).toBe("true"));
    expect(item("adr").title).toBe(
      en.graph.legend.actions.removeDocumentTypeFilter.replace(
        "{{documentType}}",
        en.documents.documentTypes.adr,
      ),
    );
    expect(item("adr").className).toContain("rounded-fg-pill");
    expect(item("adr").className).toContain("bg-accent-subtle");
    expect(item("plan").className).toContain("opacity-40");
    expect(item("plan").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(item("plan"));
    await waitFor(() => expect(item("plan").getAttribute("aria-pressed")).toBe("true"));
    expect(dashboardPatchCount).toBe(2);

    const reset = document.querySelector<HTMLElement>("[data-category-legend-reset]");
    expect(reset).toBeTruthy();
    fireEvent.click(reset!);
    await waitFor(() =>
      expect(document.querySelector("[data-category-legend-reset]")).toBeNull(),
    );
    expect(dashboardPatchCount).toBe(3);
    expect(item("adr").className).toContain("opacity-100");
    expect(item("research").className).toContain("opacity-100");
    const servedState = await engineClient.dashboardState(scope);
    expect(servedState.filters.doc_types).toBeUndefined();
    expect(servedState.filters.statuses).toEqual([preservedStatus]);
  });

  it("renders served code modules as non-interactive rows", async () => {
    const liveCodeSlice = await engineClient.graphQuery({
      scope,
      corpus: "code",
      granularity: "document",
    });
    const codeModules = deriveCodeModuleLegend(liveCodeSlice.nodes);
    expect(codeModules.length).toBeGreaterThan(0);
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <CodeModuleLegendRows codeModules={codeModules} compact={false} />
      </I18nextProvider>,
    );
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>("[data-category-legend-item]"),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.title === row.textContent)).toBe(true);
    expect(rows.every((row) => row.querySelector("[data-module-swatch]"))).toBe(true);

    fireEvent.click(rows[0]!);
    expect(dashboardPatchCount).toBe(0);
  });
});
