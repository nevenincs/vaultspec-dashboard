// @vitest-environment happy-dom
//
// The schema-driven settings dialog (dashboard-settings W04.P08), rendered
// against the REAL stores client transport (mockEngine) through the shared
// QueryClientProvider — no component doubles. Asserts the dialog's own contract:
// it renders the engine-declared groups and a control per declared setting,
// reflects the effective value, persists a change through the wire (write-through
// + invalidate), and exposes the per-scope override target for a scope-eligible
// setting.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
import { SettingsDialog } from "./SettingsDialog";
import { useSettingsDialog } from "./useSettingsDialog";

function renderDialog() {
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(SettingsDialog),
    ),
  );
}

describe("SettingsDialog (schema-driven, honest-against-mock)", () => {
  beforeEach(() => {
    useViewStore.getState().setScope(MOCK_SCOPE);
    engineClient.useTransport(new MockEngine().fetchImpl);
    useSettingsDialog.getState().openDialog();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useSettingsDialog.getState().closeDialog();
    useViewStore.getState().setScope(null);
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("renders the engine-declared groups and a control per setting", async () => {
    renderDialog();
    // Groups in declared order.
    expect(await screen.findByText("Appearance")).toBeTruthy();
    expect(screen.getByText("Graph")).toBeTruthy();
    // A labelled control per declared setting.
    expect(screen.getByText("Theme")).toBeTruthy();
    expect(screen.getByText("Reduce motion")).toBeTruthy();
    expect(screen.getByText("Default detail level")).toBeTruthy();
    // Theme renders as the segmented (radiogroup) control with its members.
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "dark" })).toBeTruthy();
  });

  it("reflects the default effective value and persists a change through the wire", async () => {
    renderDialog();
    // Theme defaults to "system" (no persisted value yet).
    const systemRadio = await screen.findByRole("radio", { name: "system" });
    expect(systemRadio.getAttribute("aria-checked")).toBe("true");
    // Choose "dark" — write-through + invalidate re-reads the persisted value.
    fireEvent.click(screen.getByRole("radio", { name: "dark" }));
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "dark" }).getAttribute("aria-checked"),
      ).toBe("true");
    });
  });

  it("offers the per-scope override target for a scope-eligible setting only", async () => {
    renderDialog();
    await screen.findByText("Default detail level");
    // The scope-eligible setting (default_granularity) exposes the
    // [Global | This scope] target; global-only ones (theme, reduce_motion) do not.
    const applyToGroups = screen.getAllByRole("radiogroup", { name: "apply to" });
    expect(applyToGroups.length).toBe(1);
  });

  it("persists a scope override when the target is 'This scope'", async () => {
    renderDialog();
    await screen.findByText("Default detail level");
    // Switch the first scope-eligible row's target to 'This scope', then pick a value.
    const thisScope = screen.getAllByRole("radio", { name: "This scope" })[0];
    fireEvent.click(thisScope);
    fireEvent.click(screen.getByRole("radio", { name: "document" }));
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "document" }).getAttribute("aria-checked"),
      ).toBe("true");
    });
  });
});
