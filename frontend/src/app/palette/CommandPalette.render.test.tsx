// @vitest-environment happy-dom
//
// Command palette lifecycle state is store-owned: a store-level close/reset must
// clear the mounted query/cursor/armed state before the next open.

import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { appConfirmGuard } from "../../platform/dispatch/middleware";
import { resetKeybindings } from "../../platform/keymap/registry";
import type { DashboardTimelineMode, SessionState } from "../../stores/server/engine";
import {
  dashboardDocumentStateSeed,
  dashboardStateSessionIdentity,
} from "../../stores/server/dashboardState";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import { useCommandPaletteStore } from "../../stores/view/commandPalette";
import {
  resetKeyActions,
  useKeymapDispatcher,
} from "../../stores/view/keymapDispatcher";
import { useViewStore } from "../../stores/view/viewStore";
// Register every command provider so the live palette is populated (mirrors the app
// shell, which imports this aggregator once at load).
import "../menus/registerAllCommands";
import { CommandPalette } from "./CommandPalette";
import { ENGINE_WAIT } from "../../testing/timing";

function PaletteShortcutHarness() {
  useKeymapDispatcher();
  return <CommandPalette />;
}

function renderPalette() {
  return render(
    <QueryClientProvider client={queryClient}>
      <PaletteShortcutHarness />
    </QueryClientProvider>,
  );
}

function seedPaletteDashboardState(scope: string, timelineMode: DashboardTimelineMode) {
  const session: SessionState = {
    workspace: "palette-test-workspace",
    active_scope: scope,
    active_workspace: null,
    scope_context: { folder: null, feature_tags: [] },
    recents: [],
    tiers: {},
  };
  const state = dashboardDocumentStateSeed(scope, {
    timeline_mode: timelineMode,
  });
  queryClient.setQueryData(engineKeys.session(), session);
  queryClient.setQueryData(
    engineKeys.dashboardState(scope, dashboardStateSessionIdentity(session)),
    state,
  );
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  appConfirmGuard.reset();
  resetKeyActions();
  resetKeybindings();
  useCommandPaletteStore.getState().reset();
  useViewStore.getState().setScope(null);
});

describe("CommandPalette lifecycle", () => {
  it("clears mounted surface state when the store reset closes it", async () => {
    renderPalette();

    act(() => useCommandPaletteStore.getState().openPalette());
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "stale scope query" } });
    expect(input.value).toBe("stale scope query");
    expect(useCommandPaletteStore.getState().query).toBe("stale scope query");

    act(() => useCommandPaletteStore.getState().reset());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), ENGINE_WAIT);

    act(() => useCommandPaletteStore.getState().openPalette());
    const reopened = screen.getByRole("combobox") as HTMLInputElement;
    expect(reopened.value).toBe("");
    expect(useCommandPaletteStore.getState()).toMatchObject({
      query: "",
      cursor: 0,
      armedCommandId: null,
    });
  });

  it("reopens clean after the keyboard close path", () => {
    renderPalette();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "typed lens" } });
    expect(input.value).toBe("typed lens");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const reopened = screen.getByRole("combobox") as HTMLInputElement;
    expect(reopened.value).toBe("");
  });

  it("disarms an ops confirmation when dashboard time-travel removes ops commands", async () => {
    const scope = "palette-time-travel-scope";
    seedPaletteDashboardState(scope, { kind: "live" });
    useViewStore.getState().setScope(scope);
    renderPalette();

    act(() => useCommandPaletteStore.getState().openPalette());
    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ops vault check" } });
    fireEvent.click(
      await screen.findByRole("option", { name: "ops: vault check" }, ENGINE_WAIT),
    );
    expect(appConfirmGuard.isArmed("ops:run")).toBe(true);

    seedPaletteDashboardState(scope, { kind: "time-travel", at: 42 });

    await waitFor(() => {
      expect(appConfirmGuard.isArmed("ops:run")).toBe(false);
    }, ENGINE_WAIT);
    expect(screen.queryByRole("option", { name: "ops: vault check" })).toBeNull();
  });
});

describe("CommandPalette three planes", () => {
  it("renders the command plane by default and switches to search and document planes", () => {
    renderPalette();

    act(() => useCommandPaletteStore.getState().openPalette());
    expect(screen.getByRole("dialog", { name: "command palette" })).toBeTruthy();

    act(() => useCommandPaletteStore.getState().openSearch());
    expect(
      screen.getByRole("dialog", { name: "Search documents and code" }),
    ).toBeTruthy();

    act(() => useCommandPaletteStore.getState().openDocument());
    expect(screen.getByRole("dialog", { name: "Go to document by name" })).toBeTruthy();
    expect(screen.getByPlaceholderText("Go to document by name…")).toBeTruthy();
  });

  it("opens the document plane from its global shortcut and toggles closed", () => {
    renderPalette();

    fireEvent.keyDown(window, { key: "O", ctrlKey: true, shiftKey: true });
    expect(useCommandPaletteStore.getState().mode).toBe("document");
    expect(useCommandPaletteStore.getState().open).toBe(true);

    fireEvent.keyDown(window, { key: "O", ctrlKey: true, shiftKey: true });
    expect(useCommandPaletteStore.getState().open).toBe(false);
  });
});
