// @vitest-environment happy-dom
//
// The schema-driven settings dialog (dashboard-settings W04.P08), rendered
// against the REAL engine settings store (the app client is bound to the live
// transport in liveSetup) through the shared QueryClientProvider — no component
// doubles. Asserts the dialog's own contract: it renders the engine-declared
// groups and a control per declared setting, reflects the effective value,
// persists a change through the wire (write-through + invalidate), and exposes
// the per-scope override target for a scope-eligible setting.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { engineClient } from "../../stores/server/engine";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { liveScope } from "../../testing/liveClient";
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

describe("SettingsDialog (schema-driven, live engine)", () => {
  let scope: string;
  beforeAll(async () => {
    scope = await liveScope();
  });
  beforeEach(() => {
    useViewStore.getState().setScope(scope);
    useSettingsDialog.getState().openDialog();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    useSettingsDialog.getState().closeDialog();
    useViewStore.getState().setScope(null);
  });

  it("renders the engine-declared groups and a control per setting", async () => {
    renderDialog();
    // Groups in declared order.
    expect(await screen.findByText("Appearance")).toBeTruthy();
    expect(screen.getByText("Graph")).toBeTruthy();
    // A labelled control per declared setting.
    expect(screen.getByText("Theme")).toBeTruthy();
    expect(screen.getByText("Reduce motion")).toBeTruthy();
    expect(screen.getByText("Default granularity")).toBeTruthy();
    // The Graph section's two new rows (Figma 17:1702): a percent slider and a
    // stem text field, rendered through the schema-driven NumberControl/TextControl.
    expect(screen.getByText("Confidence floor")).toBeTruthy();
    expect(screen.getByText("Label filter")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Confidence floor" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Label filter" })).toBeTruthy();
    // Theme renders as the segmented (radiogroup) control with its members.
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "dark" })).toBeTruthy();
  });

  it("reflects the effective value and persists a change through the wire", async () => {
    // Seed the authoritative value (the engine store is shared + persistent, so
    // assert against an explicit value, not an assumed-unset default).
    await engineClient.putSettings({ key: "theme", value: "system" });
    renderDialog();
    const systemRadio = await screen.findByRole("radio", { name: "system" });
    await waitFor(() => expect(systemRadio.getAttribute("aria-checked")).toBe("true"));
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
    await screen.findByText("Default granularity");
    // The scope-eligible setting (default_granularity) exposes the
    // [Global | This scope] target; global-only ones (theme, reduce_motion) do not.
    const applyToGroups = screen.getAllByRole("radiogroup", { name: "apply to" });
    expect(applyToGroups.length).toBe(1);
  });

  it("persists a scope override when the target is 'This scope'", async () => {
    renderDialog();
    await screen.findByText("Default granularity");
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
