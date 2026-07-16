// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
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

import { createLiveClient, liveScope } from "../../testing/liveClient";
import { dashboardDocumentStateResetPatch } from "../../stores/server/dashboardState";
import { queryClient } from "../../stores/server/queryClient";
import {
  resetGraphControlsChrome,
  useGraphControlsChromeStore,
} from "../../stores/view/graphControlsChrome";
import { useViewStore } from "../../stores/view/viewStore";
import { GraphNavControls, GraphSettingsPanel } from "./GraphControls";
import { ENGINE_WAIT } from "../../testing/timing";
import { sourceLocale } from "../../locales/en";
import { localization } from "../../platform/localization/runtime";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";

let scope: string;

beforeAll(async () => {
  scope = await liveScope();
});

beforeEach(async () => {
  await localization.changeLanguage(sourceLocale);
  useViewStore.getState().setScope(scope);
  await createLiveClient().patchDashboardState(dashboardDocumentStateResetPatch(scope));
});

afterEach(async () => {
  cleanup();
  resetGraphControlsChrome();
  queryClient.clear();
  await createLiveClient()
    .patchDashboardState(dashboardDocumentStateResetPatch(scope))
    .catch(() => undefined);
});

afterAll(() => {
  useViewStore.getState().setScope(null);
});

function renderGraphControls() {
  return render(
    createElement(
      I18nextProvider,
      { i18n: localization },
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          "div",
          null,
          createElement(GraphNavControls),
          createElement(GraphSettingsPanel),
        ),
      ),
    ),
  );
}

function renderLocalizedGraphControls(
  runtime: ReturnType<typeof createTestLocalizationRuntime>,
) {
  return render(
    createElement(
      I18nextProvider,
      { i18n: runtime },
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          "div",
          null,
          createElement(GraphNavControls),
          createElement(GraphSettingsPanel),
        ),
      ),
    ),
  );
}

function openSettings() {
  fireEvent.click(screen.getByRole("button", { name: "Graph controls" }));
}

describe("GraphNavControls - Navigate (camera commands)", () => {
  it("runs navigation controls and persists the autoframe intent", () => {
    renderGraphControls();

    expect(useGraphControlsChromeStore.getState().autoframeEnabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Fit graph to view" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep graph in view" }));

    expect(useGraphControlsChromeStore.getState().autoframeEnabled).toBe(false);
  });
});

describe("Graph controls localization", () => {
  it("updates the mounted controls from English to French and Arabic", async () => {
    const runtime = createTestLocalizationRuntime();
    renderLocalizedGraphControls(runtime);

    const zoomButton = screen.getByRole("button", { name: "Zoom in" });
    const settingsButton = screen.getByRole("button", { name: "Graph controls" });
    fireEvent.click(settingsButton);
    const freezeSwitch = screen.getByRole("switch", { name: "Keep layout fixed" });

    for (const token of ["charge", "linkStrength", "nodeSalienceScale"]) {
      expect(document.body.textContent).not.toContain(token);
    }

    await act(async () => runtime.changeLanguage(ltrTestLocale));
    expect(screen.getByRole("button", { name: "Agrandir" })).toBe(zoomButton);
    expect(screen.getByRole("button", { name: "Commandes du graphe" })).toBe(
      settingsButton,
    );
    expect(screen.getByRole("switch", { name: "Garder la disposition fixe" })).toBe(
      freezeSwitch,
    );

    await act(async () => runtime.changeLanguage(rtlTestLocale));
    expect(screen.getByRole("button", { name: "تكبير" })).toBe(zoomButton);
    expect(screen.getByRole("button", { name: "عناصر تحكم الرسم البياني" })).toBe(
      settingsButton,
    );
    expect(screen.getByRole("switch", { name: "إبقاء التخطيط ثابتًا" })).toBe(
      freezeSwitch,
    );
  });
});

describe("GraphSettingsPanel - non-occluding overlay (collapsed by default)", () => {
  it("does not render the panel body until the trigger is opened", () => {
    renderGraphControls();
    expect(screen.queryByRole("switch", { name: "Keep layout fixed" })).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Graph controls" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    openSettings();
    expect(screen.getByRole("switch", { name: "Keep layout fixed" })).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Graph controls" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("closes the panel on a second trigger click (toggle)", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("switch", { name: "Keep layout fixed" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Graph controls" }));
    expect(screen.queryByRole("switch", { name: "Keep layout fixed" })).toBeNull();
  });

  it("closes the panel on Escape", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("switch", { name: "Keep layout fixed" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("switch", { name: "Keep layout fixed" })).toBeNull();
  });
});

describe("GraphSettingsPanel - layout tuning (set-force-params)", () => {
  it("a Spacing slider change emits set-force-params with the mapped d3 charge", () => {
    renderGraphControls();
    openSettings();
    const slider = screen.getByRole("slider", { name: "Spacing" });
    fireEvent.change(slider, { target: { value: "200" } });
    expect(useGraphControlsChromeStore.getState().tuneParams.repulsion).toBe(200);
  });

  it("Link length / Grouping map straight through to the field params", () => {
    renderGraphControls();
    openSettings();
    fireEvent.change(screen.getByRole("slider", { name: "Link length" }), {
      target: { value: "120" },
    });
    fireEvent.change(screen.getByRole("slider", { name: "Grouping" }), {
      target: { value: "1.5" },
    });
    expect(useGraphControlsChromeStore.getState().tuneParams).toMatchObject({
      linkDistance: 120,
      linkSpring: 1.5,
    });
  });
});

describe("GraphSettingsPanel - appearance (set-appearance-params)", () => {
  it("an Item size slider change emits set-appearance-params", () => {
    renderGraphControls();
    openSettings();
    fireEvent.change(screen.getByRole("slider", { name: "Item size" }), {
      target: { value: "1.5" },
    });
    expect(
      useGraphControlsChromeStore.getState().appearanceParams.nodeSizeScale,
    ).toBeCloseTo(1.5);
  });

  it("the link-colour toggle emits set-appearance-params with the chosen mode", () => {
    renderGraphControls();
    openSettings();
    fireEvent.click(screen.getByRole("radio", { name: "Solid" }));
    expect(useGraphControlsChromeStore.getState().appearanceParams.edgeColorMode).toBe(
      "solid",
    );
  });
});

describe("GraphSettingsPanel - Show (node-level / granularity switch)", () => {
  it("renders the Features / Documents node-level toggle in the established vocabulary", () => {
    renderGraphControls();
    openSettings();
    expect(screen.getByRole("radio", { name: "Features" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Documents" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Status" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Design" })).toBeNull();
  });

  it("switching to Features writes graph_granularity and the active segment reflects the served state", async () => {
    renderGraphControls();
    openSettings();
    await waitFor(
      () =>
        expect(
          screen.getByRole("radio", { name: "Documents" }).getAttribute("aria-checked"),
        ).toBe("true"),
      ENGINE_WAIT,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Features" }));
    await waitFor(
      () =>
        expect(
          screen.getByRole("radio", { name: "Features" }).getAttribute("aria-checked"),
        ).toBe("true"),
      ENGINE_WAIT,
    );
    const state = await createLiveClient().dashboardState(scope);
    expect(state?.graph_granularity).toBe("feature");
  });
});

describe("GraphSettingsPanel - Freeze toggle", () => {
  it("unfreezes the scene when the active scope changes", async () => {
    renderGraphControls();
    openSettings();

    fireEvent.click(screen.getByRole("switch", { name: "Keep layout fixed" }));
    expect(useGraphControlsChromeStore.getState().frozen).toBe(true);

    act(() => useViewStore.getState().setScope(null));

    await waitFor(() => {
      expect(useGraphControlsChromeStore.getState().frozen).toBe(false);
    }, ENGINE_WAIT);
  });
});
