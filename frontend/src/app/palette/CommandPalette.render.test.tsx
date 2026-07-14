// @vitest-environment happy-dom
//
// Command palette lifecycle state is store-owned: a store-level close/reset must
// clear the mounted query/cursor/armed state before the next open.

import { QueryClientProvider } from "@tanstack/react-query";
import type { i18n } from "i18next";
import { I18nextProvider } from "react-i18next";
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
import {
  createActionConfirmationDescriptor,
  type MessageDescriptor,
} from "../../platform/localization/message";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { LocalizationProvider } from "../../platform/localization/LocalizationProvider";
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
import { CommandPalette, commandFamilyHeading } from "./CommandPalette";
import { ENGINE_WAIT } from "../../testing/timing";
import {
  registerCommandProvider,
  type CommandContext,
} from "../../stores/view/commandRegistry";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
} from "../../localization/testing";

function PaletteShortcutHarness() {
  useKeymapDispatcher();
  return <CommandPalette />;
}

function renderPalette(runtime?: i18n) {
  const palette = <PaletteShortcutHarness />;
  return render(
    <QueryClientProvider client={queryClient}>
      {runtime ? (
        <I18nextProvider i18n={runtime}>{palette}</I18nextProvider>
      ) : (
        <LocalizationProvider>{palette}</LocalizationProvider>
      )}
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

  it("keeps legacy confirmation on the inline two-activation path", async () => {
    const dispose = registerCommandProvider("test:legacy-confirmation", () => [
      {
        id: "test:archive-feature",
        label: { key: "features:destructiveActions.archive" },
        family: "app",
        confirm: true,
        run: () => undefined,
      },
    ]);

    try {
      renderPalette();
      act(() => useCommandPaletteStore.getState().openPalette());
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "archive feature" },
      });
      fireEvent.click(screen.getByRole("option", { name: "Archive feature" }));
      fireEvent.click(screen.getByRole("option", { name: "Confirm Archive feature?" }));

      expect(screen.getByRole("dialog", { name: "command palette" })).toBeTruthy();
      expect(appConfirmGuard.isArmed("ops:run")).toBe(false);
    } finally {
      dispose();
    }
  });

  it("uses the full typed confirmation dialog before running a command", async () => {
    let runs = 0;
    const confirmation = createActionConfirmationDescriptor({
      kind: "guarded",
      title: {
        key: "features:confirmations.repair.title",
        values: { feature: "feature" },
      },
      body: { key: "features:confirmations.repair.body" },
      confirmLabel: { key: "features:guardedActions.repair" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    expect(confirmation).not.toBeNull();
    const dispose = registerCommandProvider("test:typed-confirmation", () => [
      {
        id: "test:repair-feature",
        label: { key: "features:guardedActions.repair" },
        family: "app",
        confirmation,
        run: () => {
          runs += 1;
        },
      },
    ]);

    try {
      renderPalette();
      act(() => useCommandPaletteStore.getState().openPalette());
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "repair feature" },
      });
      fireEvent.click(screen.getByRole("option", { name: "Repair feature" }));
      expect(screen.getByRole("dialog", { name: "Repair feature?" })).toBeTruthy();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(runs).toBe(0);

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("dialog", { name: "Repair feature?" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "command palette" })).toBeTruthy();
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole("combobox"));
      });

      fireEvent.click(screen.getByRole("option", { name: "Repair feature" }));

      fireEvent.click(screen.getByRole("button", { name: "Repair feature" }));
      expect(runs).toBe(1);
      expect(screen.queryByRole("dialog", { name: "command palette" })).toBeNull();
    } finally {
      dispose();
    }
  });

  it("updates a localized command label without replacing its stable-id row", async () => {
    const runtime = createTestLocalizationRuntime();
    const dispose = registerCommandProvider("test:localized-label", () => [
      {
        id: "test:cancel",
        label: { key: "common:actions.cancel" },
        family: "app",
        run: () => undefined,
      },
    ]);

    try {
      renderPalette(runtime);
      act(() => useCommandPaletteStore.getState().openPalette());
      const sourceRow = screen.getByRole("option", { name: "Cancel" });

      await act(async () => runtime.changeLanguage(ltrTestLocale));
      const localizedRow = screen.getByRole("option", {
        name: ltrTestResources.common.actions.cancel,
      });

      expect(localizedRow).toBe(sourceRow);
    } finally {
      dispose();
    }
  });

  it("updates localized family headings without replacing their groups", async () => {
    const runtime = createTestLocalizationRuntime();
    renderPalette(runtime);
    act(() => useCommandPaletteStore.getState().openPalette());
    const sourceHeading = screen.getByText("General", { selector: "div" });

    await act(async () => runtime.changeLanguage(ltrTestLocale));

    expect(screen.getByText("Général", { selector: "div" })).toBe(sourceHeading);
  });

  it("omits an unresolved family heading without exposing its token or fallback", () => {
    const runtime = createTestLocalizationRuntime(ltrTestLocale);
    const missing = {
      key: "common:commandFamilies.missing",
    } as unknown as MessageDescriptor;
    const resolution = resolveMessageResult(runtime, missing);

    expect(resolution.usedFallback).toBe(true);
    expect(commandFamilyHeading(resolution)).toBeNull();
    expect(resolution.message).not.toContain("commandFamilies");
  });

  it("exposes disabled reasons and excludes disabled rows from interaction", () => {
    let runCount = 0;
    const dispose = registerCommandProvider("test:disabled-row", () => [
      {
        id: "test:disabled-retry",
        label: { key: "common:actions.retry" },
        family: "app",
        disabled: true,
        disabledReason: { key: "common:disabledReasons.currentVersionRequired" },
        run: () => {
          runCount += 1;
        },
      },
    ]);

    try {
      renderPalette();
      act(() => useCommandPaletteStore.getState().openPalette());
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "retry" },
      });
      const option = screen.getByRole("option", { name: "Retry" });
      const combobox = screen.getByRole("combobox");

      expect((option as HTMLButtonElement).disabled).toBe(true);
      expect(option.getAttribute("aria-disabled")).toBe("true");
      expect(option.getAttribute("title")).toBe(
        "Return to the current version to use this action.",
      );
      expect(option.getAttribute("aria-selected")).toBe("false");
      expect(combobox.hasAttribute("aria-activedescendant")).toBe(false);
      fireEvent.mouseEnter(option);
      fireEvent.click(option);
      expect(runCount).toBe(0);
      expect(combobox.hasAttribute("aria-activedescendant")).toBe(false);
    } finally {
      dispose();
    }
  });

  it("cancels removed typed confirmations and updates a current descriptor with the same id", async () => {
    const scope = "palette-typed-revalidation-scope";
    const repair = createActionConfirmationDescriptor({
      kind: "guarded",
      title: {
        key: "features:confirmations.repair.title",
        values: { feature: "feature" },
      },
      body: { key: "features:confirmations.repair.body" },
      confirmLabel: { key: "features:guardedActions.repair" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    const archive = createActionConfirmationDescriptor({
      kind: "destructive",
      title: {
        key: "features:confirmations.archive.title",
        values: { feature: "feature" },
      },
      body: { key: "features:confirmations.archive.body" },
      confirmLabel: { key: "features:destructiveActions.archive" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    expect(repair).not.toBeNull();
    expect(archive).not.toBeNull();
    const dispose = registerCommandProvider(
      "test:typed-revalidation",
      (ctx: CommandContext) => [
        ...(ctx.timeTravel
          ? []
          : [
              {
                id: "test:removed-confirmation",
                label: { key: "features:destructiveActions.archive" } as const,
                family: "app" as const,
                confirmation: archive,
                run: () => undefined,
              },
            ]),
        {
          id: "test:replaced-confirmation",
          label: { key: "features:guardedActions.repair" },
          family: "app",
          confirmation: ctx.timeTravel ? archive : repair,
          run: () => undefined,
        },
      ],
    );

    try {
      seedPaletteDashboardState(scope, { kind: "live" });
      useViewStore.getState().setScope(scope);
      renderPalette();
      act(() => useCommandPaletteStore.getState().openPalette());
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "archive feature" },
      });
      fireEvent.click(screen.getByRole("option", { name: "Archive feature" }));
      expect(screen.getByRole("dialog", { name: "Archive feature?" })).toBeTruthy();

      seedPaletteDashboardState(scope, { kind: "time-travel", at: 42 });
      await waitFor(() => {
        expect(screen.queryByRole("dialog", { name: "Archive feature?" })).toBeNull();
      }, ENGINE_WAIT);
      expect(screen.getByRole("dialog", { name: "command palette" })).toBeTruthy();

      seedPaletteDashboardState(scope, { kind: "live" });
      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "repair feature" },
      });
      fireEvent.click(
        await screen.findByRole("option", { name: "Repair feature" }, ENGINE_WAIT),
      );
      expect(screen.getByRole("dialog", { name: "Repair feature?" })).toBeTruthy();

      seedPaletteDashboardState(scope, { kind: "time-travel", at: 84 });
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Archive feature?" })).toBeTruthy();
      }, ENGINE_WAIT);
      expect(screen.queryByRole("dialog", { name: "Repair feature?" })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.getByRole("dialog", { name: "command palette" })).toBeTruthy();
    } finally {
      dispose();
    }
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
