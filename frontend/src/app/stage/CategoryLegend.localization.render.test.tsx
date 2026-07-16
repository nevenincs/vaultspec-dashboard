// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

import { en, sourceLocale } from "../../locales/en";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
  rtlTestLocale,
  rtlTestResources,
} from "../../localization/testing";
import {
  engineClient,
  type DashboardState,
  type DashboardStatePatch,
} from "../../stores/server/engine";
import { dashboardStateSessionIdentity, engineKeys } from "../../stores/server/queries";
import { testQueryClient } from "../../stores/server/queries/testFixtures";
import {
  patchGraphControlsAppearanceParams,
  resetGraphControlsChrome,
} from "../../stores/view/graphControlsChrome";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { ENGINE_WAIT } from "../../testing/timing";
import { CategoryLegend, CodeModuleLegendRows } from "./CategoryLegend";

describe("rendered CategoryLegend localization", () => {
  const client = testQueryClient();
  let scope: string;
  let originalState: DashboardState;

  async function setDashboardState(
    patch: DashboardStatePatch,
  ): Promise<DashboardState> {
    return engineClient.patchDashboardState({ scope, ...patch });
  }

  beforeAll(async () => {
    engineClient.useTransport(liveTransport);
    scope = await liveScope();
    originalState = await engineClient.dashboardState(scope);
  });

  beforeEach(async () => {
    engineClient.useTransport(liveTransport);
    useViewStore.getState().setScope(scope);
    resetGraphControlsChrome();
    await setDashboardState({ corpus: "vault", filters: {} });
  });

  afterEach(async () => {
    cleanup();
    await waitFor(() => expect(client.isFetching()).toBe(0), ENGINE_WAIT);
    client.clear();
    resetGraphControlsChrome();
    engineClient.useTransport(liveTransport);
    useViewStore.getState().setScope(null);
  });

  afterAll(async () => {
    const { tiers: _tiers, ...restoredState } = originalState;
    engineClient.useTransport(liveTransport);
    await engineClient.patchDashboardState(restoredState);
  });

  it("switches document filter actions in place with truthful localized state", async () => {
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <CategoryLegend />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    const toolbar = await screen.findByRole(
      "toolbar",
      { name: en.graph.legend.accessibility.documentTypeFilters },
      ENGINE_WAIT,
    );
    const toggle = screen.getByRole("button", {
      name: en.graph.legend.actions.hideDocumentTypeLabels,
    });
    const research = toolbar.querySelector<HTMLElement>(
      '[data-category-legend-item="research"]',
    );
    const decision = toolbar.querySelector<HTMLElement>(
      '[data-category-legend-item="adr"]',
    );
    expect(research?.textContent).toBe(en.documents.documentTypes.research);
    expect(decision?.title).toBe(
      en.graph.legend.actions.addDocumentTypeFilter.replace(
        "{{documentType}}",
        en.documents.documentTypes.adr,
      ),
    );
    fireEvent.click(decision!);
    await waitFor(() => expect(decision?.getAttribute("aria-pressed")).toBe("true"));
    expect(decision?.title).toBe(
      en.graph.legend.actions.removeDocumentTypeFilter.replace(
        "{{documentType}}",
        en.documents.documentTypes.adr,
      ),
    );

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("toolbar", {
        name: ltrTestResources.graph.legend.accessibility.documentTypeFilters,
      }),
    ).toBe(toolbar);
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.graph.legend.actions.hideDocumentTypeLabels,
      }),
    ).toBe(toggle);
    expect(toolbar.querySelector('[data-category-legend-item="research"]')).toBe(
      research,
    );
    expect(toolbar.querySelector('[data-category-legend-item="adr"]')).toBe(decision);
    expect(research?.textContent).toBe(
      ltrTestResources.documents.documentTypes.research,
    );
    expect(decision?.title).toBe(
      ltrTestResources.graph.legend.actions.removeDocumentTypeFilter.replace(
        "{{documentType}}",
        ltrTestResources.documents.documentTypes.adr,
      ),
    );
    fireEvent.click(decision!);
    await waitFor(() => expect(decision?.getAttribute("aria-pressed")).toBe("false"));
    expect(decision?.title).toBe(
      ltrTestResources.graph.legend.actions.addDocumentTypeFilter.replace(
        "{{documentType}}",
        ltrTestResources.documents.documentTypes.adr,
      ),
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("toolbar", {
        name: rtlTestResources.graph.legend.accessibility.documentTypeFilters,
      }),
    ).toBe(toolbar);
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.graph.legend.actions.hideDocumentTypeLabels,
      }),
    ).toBe(toggle);
    expect(toolbar.querySelector('[data-category-legend-item="research"]')).toBe(
      research,
    );
    expect(toolbar.querySelector('[data-category-legend-item="adr"]')).toBe(decision);
    expect(research?.textContent).toBe(
      rtlTestResources.documents.documentTypes.research,
    );
    expect(decision?.title).toBe(
      rtlTestResources.graph.legend.actions.addDocumentTypeFilter.replace(
        "{{documentType}}",
        rtlTestResources.documents.documentTypes.adr,
      ),
    );
    fireEvent.click(decision!);
    await waitFor(() => expect(decision?.getAttribute("aria-pressed")).toBe("true"));
    expect(decision?.title).toBe(
      rtlTestResources.graph.legend.actions.removeDocumentTypeFilter.replace(
        "{{documentType}}",
        rtlTestResources.documents.documentTypes.adr,
      ),
    );
    expect(document.body.textContent).not.toMatch(
      /graph:legend|PRIVATE_STRUCTURAL_DIAGNOSTIC|—/u,
    );
  });

  it("switches live module and recency legends in place across locales", async () => {
    const codeState = await setDashboardState({
      corpus: "code",
      filters: {},
      graph_granularity: "document",
    });
    expect(codeState.corpus).toBe("code");
    const session = await engineClient.session();
    const liveCodeSlice = await engineClient.graphQuery({
      scope: codeState.scope,
      corpus: "code",
      granularity: codeState.graph_granularity,
    });
    const fixtureCodeNode = liveCodeSlice.nodes.find(
      (node) => node.id === "code:src/workspace.ts",
    );
    expect(fixtureCodeNode?.module).toBe("src");
    expect(typeof fixtureCodeNode?.module_hue).toBe("number");
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState(scope, dashboardStateSessionIdentity(session)),
      codeState,
    );
    const runtime = createTestLocalizationRuntime();
    render(
      <I18nextProvider i18n={runtime}>
        <QueryClientProvider client={client}>
          <CategoryLegend />
        </QueryClientProvider>
      </I18nextProvider>,
    );

    const moduleGroup = await screen.findByRole(
      "group",
      { name: en.graph.legend.accessibility.moduleColors },
      ENGINE_WAIT,
    );
    const moduleToggle = screen.getByRole("button", {
      name: en.graph.legend.actions.hideModuleLabels,
    });
    const moduleRows = Array.from(
      moduleGroup.querySelectorAll<HTMLElement>("[data-category-legend-item]"),
    );
    const moduleNames = moduleRows.map((row) => row.textContent ?? "");
    const moduleKeys = moduleRows.map((row) => row.dataset.categoryLegendItem);
    expect(moduleRows.length).toBeGreaterThan(0);
    expect(moduleNames.every((name) => name.length > 0)).toBe(true);
    expect(moduleRows.map((row) => row.title)).toEqual(moduleNames);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("group", {
        name: ltrTestResources.graph.legend.accessibility.moduleColors,
      }),
    ).toBe(moduleGroup);
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.graph.legend.actions.hideModuleLabels,
      }),
    ).toBe(moduleToggle);
    expect(
      Array.from(moduleGroup.querySelectorAll("[data-category-legend-item]")),
    ).toEqual(moduleRows);
    expect(moduleRows.map((row) => row.textContent ?? "")).toEqual(moduleNames);
    expect(moduleRows.map((row) => row.dataset.categoryLegendItem)).toEqual(moduleKeys);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("group", {
        name: rtlTestResources.graph.legend.accessibility.moduleColors,
      }),
    ).toBe(moduleGroup);
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.graph.legend.actions.hideModuleLabels,
      }),
    ).toBe(moduleToggle);
    expect(moduleRows.map((row) => row.textContent ?? "")).toEqual(moduleNames);

    fireEvent.click(moduleToggle);
    expect(moduleToggle.getAttribute("aria-label")).toBe(
      rtlTestResources.graph.legend.actions.showModuleLabels,
    );
    await act(async () => runtime.changeLanguage(sourceLocale));
    expect(
      screen.getByRole("button", { name: en.graph.legend.actions.showModuleLabels }),
    ).toBe(moduleToggle);
    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("button", {
        name: ltrTestResources.graph.legend.actions.showModuleLabels,
      }),
    ).toBe(moduleToggle);
    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("button", {
        name: rtlTestResources.graph.legend.actions.showModuleLabels,
      }),
    ).toBe(moduleToggle);
    expect(moduleRows.every((row) => row.textContent === "")).toBe(true);
    expect(moduleRows.map((row) => row.title)).toEqual(moduleNames);
    expect(moduleRows.map((row) => row.dataset.categoryLegendItem)).toEqual(moduleKeys);

    await act(async () => {
      runtime.changeLanguage(sourceLocale);
      patchGraphControlsAppearanceParams({ nodeColorMode: "recency" });
    });
    const recencyGroup = await screen.findByRole("group", {
      name: en.graph.legend.accessibility.recencyScale,
    });
    const older = within(recencyGroup).getByText(en.graph.legend.labels.older);
    const recent = within(recencyGroup).getByText(en.graph.legend.labels.recent);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(
      screen.getByRole("group", {
        name: ltrTestResources.graph.legend.accessibility.recencyScale,
      }),
    ).toBe(recencyGroup);
    expect(
      within(recencyGroup).getByText(ltrTestResources.graph.legend.labels.older),
    ).toBe(older);
    expect(
      within(recencyGroup).getByText(ltrTestResources.graph.legend.labels.recent),
    ).toBe(recent);

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(
      screen.getByRole("group", {
        name: rtlTestResources.graph.legend.accessibility.recencyScale,
      }),
    ).toBe(recencyGroup);
    expect(
      within(recencyGroup).getByText(rtlTestResources.graph.legend.labels.older),
    ).toBe(older);
    expect(
      within(recencyGroup).getByText(rtlTestResources.graph.legend.labels.recent),
    ).toBe(recent);
  });

  it("keeps hostile module names raw across locale changes", async () => {
    const runtime = createTestLocalizationRuntime();
    const hostileModule = "graph:legend.actions.clearDocumentTypeFilters";
    render(
      <I18nextProvider i18n={runtime}>
        <CodeModuleLegendRows
          codeModules={[{ module: hostileModule, moduleHue: 0 }]}
          compact={false}
        />
      </I18nextProvider>,
    );

    const row = document.querySelector<HTMLElement>("[data-category-legend-item]");
    expect(row?.textContent).toBe(hostileModule);
    expect(row?.title).toBe(hostileModule);
    expect(row?.textContent).not.toBe(en.graph.legend.actions.clearDocumentTypeFilters);

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(document.querySelector("[data-category-legend-item]")).toBe(row);
    expect(row?.textContent).toBe(hostileModule);
    expect(row?.textContent).not.toBe(
      ltrTestResources.graph.legend.actions.clearDocumentTypeFilters,
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(document.querySelector("[data-category-legend-item]")).toBe(row);
    expect(row?.textContent).toBe(hostileModule);
    expect(row?.title).toBe(hostileModule);
    expect(row?.textContent).not.toBe(
      rtlTestResources.graph.legend.actions.clearDocumentTypeFilters,
    );
  });
});
