// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { resolveMessageResult } from "../platform/localization/fallback";
import { getKeybinding, resetKeybindings } from "../platform/keymap/registry";
import { resetResolvers } from "../platform/actions/registry";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  ltrTestResources,
} from "../localization/testing";
import { engineKeys } from "../stores/server/queries";
import type { MapResponse, SessionState } from "../stores/server/engine";
import { closeContextMenu, openContextMenu } from "../stores/view/contextMenu";
import {
  RELOAD_REFRESH_DATA_ACTION_ID,
  RELOAD_REFRESH_DATA_LABEL,
  deriveReloadKeybindings,
  refreshDataAction,
  useReloadKeybindings,
} from "../stores/view/reloadKeybindings";
import { resetCommandProviders } from "../stores/view/commandRegistry";
import type { PaletteCommand } from "../stores/view/commandPaletteCommands";
import { reloadCommandProvider } from "../stores/view/commandProviders/reloadCommandProvider";
import { useCommandPaletteStore } from "../stores/view/commandPalette";
import { useKeyboardShortcutsStore } from "../stores/view/keyboardShortcuts";
import { resetKeyActions } from "../stores/view/keymapDispatcher";
import { ContextMenuHost } from "./menu/ContextMenuHost";
import { KeyboardShortcuts } from "./menu/KeyboardShortcuts";
import { CommandPalette } from "./palette/CommandPalette";
import { globalTailActions } from "./menus/globalTail";
import "./menus/registerAll";
import "./menus/registerAllCommands";

const FRENCH_REFRESH_DATA = "Actualiser les données";

const EMPTY_MAP: MapResponse = { repositories: [], tiers: {} };
const EMPTY_SESSION: SessionState = {
  workspace: "",
  active_scope: "",
  active_workspace: null,
  scope_context: { folder: null, feature_tags: [] },
  recents: [],
  tiers: {},
};

function CrossPlaneHarness() {
  useReloadKeybindings();
  return (
    <>
      <ContextMenuHost />
      <CommandPalette />
      <KeyboardShortcuts />
    </>
  );
}

function expectFrenchRefreshRow(row: HTMLElement): void {
  expect(within(row).getByText(FRENCH_REFRESH_DATA)).toBeTruthy();
  expect(row.textContent).toContain(FRENCH_REFRESH_DATA);
  expect(row.textContent).not.toContain("Refresh data");
  expect(row.textContent).not.toContain(RELOAD_REFRESH_DATA_ACTION_ID);
}

afterEach(() => {
  cleanup();
  closeContextMenu();
  useCommandPaletteStore.getState().reset();
  useKeyboardShortcutsStore.getState().reset();
  resetKeyActions();
  resetKeybindings();
  resetCommandProviders();
  resetResolvers();
});

describe("reload refresh-data cross-plane parity", () => {
  it("keeps one localized identity across menu, palette, and shortcut legend", async () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
        mutations: { retry: false },
      },
    });
    client.setQueryData(engineKeys.map(), EMPTY_MAP);
    client.setQueryData(engineKeys.session(), EMPTY_SESSION);
    const runtime = createTestLocalizationRuntime(ltrTestLocale);

    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={runtime}>
          <CrossPlaneHarness />
        </I18nextProvider>
      </QueryClientProvider>,
    );

    const action = refreshDataAction();
    const providerAction = reloadCommandProvider()[0] as PaletteCommand;
    const tailAction = globalTailActions()[0]!;
    const sourceBinding = deriveReloadKeybindings()[0]!;
    const registeredBinding = getKeybinding(RELOAD_REFRESH_DATA_ACTION_ID);
    const sourceProducers = [
      action,
      providerAction,
      tailAction,
      sourceBinding,
    ] as const;

    for (const producer of sourceProducers) {
      expect(producer?.id).toBe(RELOAD_REFRESH_DATA_ACTION_ID);
      expect(producer?.label).toBe(RELOAD_REFRESH_DATA_LABEL);
      expect(resolveMessageResult(runtime, producer?.label)).toEqual({
        message: FRENCH_REFRESH_DATA,
        usedFallback: false,
      });
    }
    expect(registeredBinding).toMatchObject({
      id: RELOAD_REFRESH_DATA_ACTION_ID,
      label: RELOAD_REFRESH_DATA_LABEL,
    });
    expect(resolveMessageResult(runtime, registeredBinding?.label)).toEqual({
      message: FRENCH_REFRESH_DATA,
      usedFallback: false,
    });
    expect(RELOAD_REFRESH_DATA_LABEL).toEqual({
      key: "common:actions.refreshData",
    });
    expect(registeredBinding).toMatchObject({
      defaultChord: "Mod+Shift+R",
      context: "global",
      group: { key: "common:shortcutGroups.general" },
    });
    expect(tailAction.section).toBe("global");
    expect(providerAction.family).toBe("reload");

    act(() => openContextMenu({ kind: "node", id: "n1" }, { x: 32, y: 32 }));
    const menuRow = await screen.findByRole("menuitem", {
      name: new RegExp(FRENCH_REFRESH_DATA, "u"),
    });
    expectFrenchRefreshRow(menuRow);
    expect(menuRow.id).toContain(`item-${RELOAD_REFRESH_DATA_ACTION_ID}`);

    act(() => closeContextMenu());
    act(() => useCommandPaletteStore.getState().openPalette());
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: FRENCH_REFRESH_DATA },
    });
    const paletteRow = screen.getByRole("option", {
      name: new RegExp(FRENCH_REFRESH_DATA, "u"),
    });
    expectFrenchRefreshRow(paletteRow);
    expect(paletteRow.id).toContain(encodeURIComponent(RELOAD_REFRESH_DATA_ACTION_ID));
    expect(screen.getByRole("combobox").getAttribute("aria-activedescendant")).toBe(
      paletteRow.id,
    );

    act(() => useCommandPaletteStore.getState().closePalette());
    act(() => useKeyboardShortcutsStore.getState().openDialog());
    const shortcutRow = screen.getByText(FRENCH_REFRESH_DATA).closest("li");
    expect(shortcutRow).not.toBeNull();
    expectFrenchRefreshRow(shortcutRow!);
    const shortcutKeycaps = [...shortcutRow!.querySelectorAll("kbd")].map(
      (keycap) => keycap.textContent,
    );
    expect(shortcutKeycaps).toContain(ltrTestResources.common.keycaps.shift);
    expect(shortcutKeycaps).toContain("R");

    client.clear();
  });
});
