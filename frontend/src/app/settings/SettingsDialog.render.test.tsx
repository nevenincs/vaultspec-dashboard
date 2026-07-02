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
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { engineClient } from "../../stores/server/engine";
import type { SettingsState } from "../../stores/server/engine";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useViewStore } from "../../stores/view/viewStore";
import { useSettingsDialog } from "../../stores/view/settingsDialog";
import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import { SettingsDialog } from "./SettingsDialog";
import { ENGINE_WAIT } from "../../testing/timing";

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
  // TIH-004 (write hygiene): this suite writes non-default values to the shared
  // engine settings store (label_filter global, default_granularity scoped);
  // snapshot them before the suite and restore at teardown so a later suite
  // never inherits this suite's writes.
  let settingsSnapshot: SettingsState;
  beforeAll(async () => {
    scope = await liveScope();
    settingsSnapshot = await engineClient.settings();
  });
  afterAll(async () => {
    for (const key of ["theme", "label_filter"]) {
      const defaults: Record<string, string> = {
        theme: "system",
        label_filter: "",
      };
      await engineClient
        .putSettings({ key, value: settingsSnapshot.global[key] ?? defaults[key] })
        .catch(() => undefined);
    }
    await engineClient
      .putSettings({
        scope,
        key: "default_granularity",
        value: settingsSnapshot.scoped[scope]?.["default_granularity"] ?? "feature",
      })
      .catch(() => undefined);
  });
  beforeEach(() => {
    useViewStore.getState().setScope(scope);
    useSettingsDialog.getState().openDialog();
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
    engineClient.useTransport(liveTransport);
    useSettingsDialog.getState().closeDialog();
    useViewStore.getState().setScope(null);
  });

  it("renders the engine-declared groups and a control per setting", async () => {
    renderDialog();
    // Groups in declared order.
    expect(await screen.findByText("Appearance", undefined, ENGINE_WAIT)).toBeTruthy();
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
    expect(screen.getByRole("radio", { name: "Dark" })).toBeTruthy();
  });

  it("reflects the effective value and persists a change through the wire", async () => {
    // Seed the authoritative value (the engine store is shared + persistent, so
    // assert against an explicit value, not an assumed-unset default).
    await engineClient.putSettings({ key: "theme", value: "system" });
    renderDialog();
    const systemRadio = await screen.findByRole(
      "radio",
      { name: "System" },
      ENGINE_WAIT,
    );
    await waitFor(
      () => expect(systemRadio.getAttribute("aria-checked")).toBe("true"),
      ENGINE_WAIT,
    );
    // Choose "dark" — write-through + invalidate re-reads the persisted value.
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
      ).toBe("true");
    }, ENGINE_WAIT);
  });

  it("offers the per-scope override target for a scope-eligible setting only", async () => {
    renderDialog();
    await screen.findByText("Default granularity", undefined, ENGINE_WAIT);
    // Scope-eligible settings (e.g. default_granularity, timeline_date_criterion)
    // expose the [Global | This scope] target; global-only ones (theme, reduce_motion)
    // do not. Derive the expected count from the served schema so adding another
    // scope-eligible setting can't silently drift this assertion.
    const schema = await createLiveClient().settingsSchema();
    const scopeEligibleCount = schema.settings.filter((s) => s.scope_eligible).length;
    const applyToGroups = screen.getAllByRole("radiogroup", { name: "apply to" });
    expect(applyToGroups.length).toBe(scopeEligibleCount);
  });

  it("uses the restored active scope when no explicit view-store scope is picked", async () => {
    await createLiveClient().putSession({ active_scope: scope });
    useViewStore.getState().setScope(null);
    queryClient.clear();
    renderDialog();
    await screen.findByText("Default granularity", undefined, ENGINE_WAIT);
    const schema = await createLiveClient().settingsSchema();
    const scopeEligibleCount = schema.settings.filter((s) => s.scope_eligible).length;
    expect(screen.getAllByRole("radiogroup", { name: "apply to" })).toHaveLength(
      scopeEligibleCount,
    );
  });

  it("persists a scope override when the target is 'This scope'", async () => {
    renderDialog();
    await screen.findByText("Default granularity", undefined, ENGINE_WAIT);
    // Switch the first scope-eligible row's target to 'This scope', then pick a value.
    const thisScope = screen.getAllByRole("radio", { name: "This scope" })[0];
    fireEvent.click(thisScope);
    fireEvent.click(screen.getByRole("radio", { name: "Document" }));
    await waitFor(() => {
      expect(
        screen.getByRole("radio", { name: "Document" }).getAttribute("aria-checked"),
      ).toBe("true");
    }, ENGINE_WAIT);
  });

  it("cancels a pending continuous setting write when the dialog closes", async () => {
    const settingWrites: string[] = [];
    engineClient.useTransport((input, init) => {
      const path = input.replace(/^\/api/, "");
      if (path === "/settings" && init?.method === "PUT") {
        settingWrites.push(String(init.body ?? ""));
      }
      return liveTransport(input, init);
    });

    renderDialog();
    const labelFilter = await screen.findByRole(
      "textbox",
      { name: "Label filter" },
      ENGINE_WAIT,
    );
    fireEvent.change(labelFilter, { target: { value: "transient label draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(settingWrites.some((body) => JSON.parse(body).key === "label_filter")).toBe(
      false,
    );
  });

  it("canonical setting changes cancel a pending continuous draft write", async () => {
    const settingWrites: string[] = [];
    await engineClient.putSettings({ key: "label_filter", value: "" });
    engineClient.useTransport((input, init) => {
      const path = input.replace(/^\/api/, "");
      if (path === "/settings" && init?.method === "PUT") {
        settingWrites.push(String(init.body ?? ""));
      }
      return liveTransport(input, init);
    });

    renderDialog();
    const labelFilter = (await screen.findByRole(
      "textbox",
      {
        name: "Label filter",
      },
      ENGINE_WAIT,
    )) as HTMLInputElement;
    fireEvent.change(labelFilter, { target: { value: "stale settings draft" } });

    const canonical = await engineClient.putSettings({
      key: "label_filter",
      value: "canonical settings text",
    });
    queryClient.setQueryData(engineKeys.settings(), canonical);

    await waitFor(
      () => expect(labelFilter.value).toBe("canonical settings text"),
      ENGINE_WAIT,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(settingWrites.map((body) => JSON.parse(body))).toContainEqual(
      expect.objectContaining({
        key: "label_filter",
        value: "canonical settings text",
      }),
    );
    expect(settingWrites.map((body) => JSON.parse(body))).not.toContainEqual(
      expect.objectContaining({
        key: "label_filter",
        value: "stale settings draft",
      }),
    );
  });

  it("re-baselines the scope edit target when the active scope changes", async () => {
    const sourceScope = scope;
    const targetScope = `${scope}:settings-target-${Date.now()}`;
    await engineClient.putSettings({
      scope: sourceScope,
      key: "default_granularity",
      value: "document",
    });
    useViewStore.getState().setScope(sourceScope);

    renderDialog();
    await screen.findByText("Default granularity", undefined, ENGINE_WAIT);
    // default_granularity is the first scope-eligible row (declared before
    // timeline_date_criterion), so target its [Global | This scope] radios by index.
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("radio", { name: "This scope" })[0]
          .getAttribute("aria-checked"),
      ).toBe("true");
    }, ENGINE_WAIT);

    act(() => useViewStore.getState().setScope(targetScope));

    await waitFor(() => {
      expect(
        screen
          .getAllByRole("radio", { name: "Global" })[0]
          .getAttribute("aria-checked"),
      ).toBe("true");
    }, ENGINE_WAIT);
  });
});
