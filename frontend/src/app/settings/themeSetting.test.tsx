// @vitest-environment happy-dom
//
// Theme migrated into the settings model (dashboard-settings W05): the app-layer
// bridge persists a theme change to the engine AND applies it through the
// framework-free controller (instant, no FOUC), and reconciles the authoritative
// server value onto the controller on load. Exercised against the real stores
// client transport (mockEngine) — no doubles.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { MockEngine } from "../../testing/mockEngine";
import { useThemeSetting } from "./themeSetting";

function Harness() {
  const { preference, setPreference } = useThemeSetting();
  return createElement(
    "div",
    null,
    createElement("span", { "data-testid": "pref" }, preference),
    createElement("button", { onClick: () => setPreference("dark") }, "dark"),
    createElement("button", { onClick: () => setPreference("light") }, "light"),
  );
}

function renderHarness() {
  return render(
    createElement(QueryClientProvider, { client: queryClient }, createElement(Harness)),
  );
}

describe("theme migrated into the settings model (W05)", () => {
  beforeEach(() => {
    engineClient.useTransport(new MockEngine().fetchImpl);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    document.documentElement.removeAttribute("data-theme");
    localStorage.clear();
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("applies a theme change through the controller AND persists it to the engine", async () => {
    renderHarness();
    fireEvent.click(screen.getByText("dark"));
    // The controller applied data-theme immediately (no-FOUC optimistic path).
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    // The change persisted to the engine settings model (server is authoritative).
    await waitFor(async () => {
      const fresh = await engineClient.settings();
      expect(fresh.global.theme).toBe("dark");
    });
  });

  it("reconciles the authoritative server theme onto the controller on load", async () => {
    // Seed the server with a theme via the SAME mock transport, then mount.
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    await engineClient.putSettings({ key: "theme", value: "light" });
    renderHarness();
    // The reconcile effect applies the server value to the controller.
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
    expect(screen.getByTestId("pref").textContent).toBe("light");
  });

  it("does not revert to the stale server theme when changing from a pre-existing one", async () => {
    // Seed the server with "dark", mount (reconciles to dark), then change to
    // "light": the reconcile must NOT flash back to the stale "dark" while the
    // write is in flight (review MEDIUM: theme-reconcile revert). The settled
    // state is "light".
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    await engineClient.putSettings({ key: "theme", value: "dark" });
    renderHarness();
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
    fireEvent.click(screen.getByText("light"));
    // Settles on light; never gets stuck on dark.
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("light");
    });
    // Give any stray reconcile a chance to (wrongly) revert; it must stay light.
    await new Promise((r) => setTimeout(r, 50));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByTestId("pref").textContent).toBe("light");
  });
});
