// @vitest-environment happy-dom
//
// Theme migrated into the settings model (dashboard-settings W05): the app-layer
// bridge persists a theme change to the engine AND applies it through the
// framework-free controller (instant, no FOUC), and reconciles the authoritative
// server value onto the controller on load. Exercised against the REAL engine
// settings store (the app client is bound to the live transport in liveSetup) —
// no doubles.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { CONSUMED_SETTING_KEYS } from "../../stores/server/settingsSelectors";
import {
  getThemeController,
  type ThemePreference,
} from "../../platform/theme/themeController";
import { useThemeSetting } from "./themeSetting";
import { ENGINE_WAIT } from "../../testing/timing";

function Harness() {
  const { preference, setPreference } = useThemeSetting();
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "pref" }, preference),
    createElement("button", { onClick: () => setPreference("dark") }, "dark"),
    createElement("button", { onClick: () => setPreference("light") }, "light"),
    createElement(
      "button",
      { onClick: () => setPreference("chartreuse" as ThemePreference) },
      "invalid",
    ),
  );
}

function renderHarness(client = queryClient) {
  return render(createElement(QueryClientProvider, { client }, createElement(Harness)));
}

function clickPreference(value: ThemePreference | "invalid") {
  fireEvent.click(screen.getByRole("button", { name: value }));
}

async function waitForThemeSchema() {
  await waitFor(() => {
    expect(queryClient.getQueryData(engineKeys.settingsSchema())).toBeDefined();
  }, ENGINE_WAIT);
}

describe("theme migrated into the settings model (W05)", () => {
  afterEach(() => {
    cleanup();
    queryClient.clear();
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
  });

  it("applies a theme change through the controller AND persists it to the engine", async () => {
    renderHarness();
    await waitForThemeSchema();
    clickPreference("dark");
    // The controller applied data-theme immediately (no-FOUC optimistic path).
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    }, ENGINE_WAIT);
    // The change persisted to the engine settings model (server is authoritative).
    await waitFor(async () => {
      const fresh = await engineClient.settings();
      expect(fresh.global.theme).toBe("dark");
    }, ENGINE_WAIT);
  });

  it("reconciles the authoritative server theme onto the controller on load", async () => {
    // Seed the server theme, then mount.
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.theme,
      value: "light",
    });
    renderHarness();
    // The reconcile effect applies the server value to the controller.
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    }, ENGINE_WAIT);
    await waitFor(() => {
      expect(screen.getByTestId("pref").textContent).toBe("light");
    }, ENGINE_WAIT);
  });

  it("does not reconcile or write theme while authoritative settings are pending", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        mutations: { retry: false },
      },
    });
    client.setQueryData(
      engineKeys.settingsSchema(),
      await engineClient.settingsSchema(),
    );
    client.setQueryDefaults(engineKeys.settings(), { enabled: false });
    getThemeController().setPreference("dark");

    renderHarness(client);

    await waitFor(() => {
      expect(screen.getByTestId("pref").textContent).toBe("dark");
    }, ENGINE_WAIT);
    expect(document.documentElement.dataset.theme).toBe("dark");

    clickPreference("light");
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByTestId("pref").textContent).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("vaultspec-theme")).toBe("dark");
  });

  it("rejects platform theme writes that are not authorized by the settings schema", async () => {
    await engineClient.putSettings({
      key: CONSUMED_SETTING_KEYS.theme,
      value: "system",
    });
    renderHarness();
    await waitForThemeSchema();
    await waitFor(() => {
      expect(screen.getByTestId("pref").textContent).toBe("system");
    }, ENGINE_WAIT);

    clickPreference("invalid");

    await new Promise((r) => setTimeout(r, 50));
    expect(document.documentElement.dataset.theme).not.toBe("chartreuse");
    expect(localStorage.getItem("vaultspec-theme")).not.toBe("chartreuse");
    const fresh = await engineClient.settings();
    expect(fresh.global.theme).toBe("system");
  });

  it("does not revert to the stale server theme when changing from a pre-existing one", async () => {
    // Seed the server with "dark", mount (reconciles to dark), then change to
    // "light": the reconcile must NOT flash back to the stale "dark" while the
    // write is in flight (review MEDIUM: theme-reconcile revert). The settled
    // state is "light".
    await engineClient.putSettings({ key: CONSUMED_SETTING_KEYS.theme, value: "dark" });
    renderHarness();
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    }, ENGINE_WAIT);
    await waitForThemeSchema();
    clickPreference("light");
    // Settles on light; never gets stuck on dark.
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    }, ENGINE_WAIT);
    // Give any stray reconcile a chance to (wrongly) revert; it must stay light.
    await new Promise((r) => setTimeout(r, 50));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByTestId("pref").textContent).toBe("light");
  });
});
