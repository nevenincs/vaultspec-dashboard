// Shared app-chrome builders (background-context-menus): the escape-hatch set, the
// reset-layout time-travel gate, localized state-aware labels, control-panel snapshot
// projection, and registry-derived accelerators.

import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import {
  RESET_LAYOUT_ACTION_ID,
  SETTINGS_ACTION_ID,
  chromeEscapeHatchActions,
  controlPanelActions,
  controlPanelToggleAction,
  openCommandPaletteAction,
  showKeyboardShortcutsAction,
  toggleFollowModeAction,
  toggleGraphAction,
} from "./chromeActions";
import { COMMAND_PALETTE_KEYBINDING } from "./commandPalette";
import {
  CONTROL_PANEL_IDS,
  closeControlPanel,
  useControlPanels,
} from "./controlPanels";
import { KEYBOARD_SHORTCUTS_TOGGLE_BINDING } from "./keyboardShortcuts";
import { setFollowMode } from "./selection";
import { setShellGraphVisible } from "./shellLayout";

afterEach(() => {
  resetKeybindings();
  closeControlPanel();
  setFollowMode(true);
  setShellGraphVisible(true);
});

describe("chromeEscapeHatchActions", () => {
  it("is the four escape hatches in order", () => {
    expect(chromeEscapeHatchActions().map((a) => a.id)).toEqual([
      "app:command-palette",
      SETTINGS_ACTION_ID,
      "app:keyboard-shortcuts",
      RESET_LAYOUT_ACTION_ID,
    ]);
  });

  it("time-travel gates ONLY reset-layout (the lone mutation)", () => {
    const gated = chromeEscapeHatchActions().filter(
      (a) => a.disabledInTimeTravel === true,
    );
    expect(gated.map((a) => a.id)).toEqual([RESET_LAYOUT_ACTION_ID]);
  });

  it("uses canonical descriptors for every escape hatch", () => {
    expect(chromeEscapeHatchActions().map((action) => action.label)).toEqual([
      { key: "common:actions.openCommandPalette" },
      { key: "common:actions.openSettings" },
      { key: "common:actions.showKeyboardShortcuts" },
      { key: "common:actions.resetLayout" },
    ]);
  });
});

describe("state-aware chrome toggles", () => {
  it("projects graph and follow-mode labels from their current state", () => {
    setShellGraphVisible(false);
    expect(toggleGraphAction().label).toEqual({ key: "common:actions.showGraph" });
    setShellGraphVisible(true);
    expect(toggleGraphAction().label).toEqual({ key: "common:actions.hideGraph" });

    setFollowMode(false);
    expect(toggleFollowModeAction().label).toEqual({
      key: "common:actions.enableFollowMode",
    });
    setFollowMode(true);
    expect(toggleFollowModeAction().label).toEqual({
      key: "common:actions.disableFollowMode",
    });
  });

  it("projects panel labels from an explicit snapshot and runs the real toggle", () => {
    expect(controlPanelActions(null).map((action) => action.label)).toEqual([
      { key: "common:actions.showSearchStatus" },
      { key: "common:actions.showApprovals" },
      { key: "common:actions.showSystemStatus" },
      { key: "common:actions.showProjectHealth" },
    ]);

    const show = controlPanelToggleAction("approvals", null);
    show.run?.();
    expect(useControlPanels.getState().open).toBe("approvals");

    const hide = controlPanelToggleAction("approvals", "approvals");
    expect(hide.label).toEqual({ key: "common:actions.hideApprovals" });
    hide.run?.();
    expect(useControlPanels.getState().open).toBeNull();
  });

  it("resolves every chrome descriptor through the real localization runtime", () => {
    const runtime = createTestLocalizationRuntime();
    const actions = [
      ...chromeEscapeHatchActions(),
      controlPanelToggleAction("search-service", null),
      controlPanelToggleAction("search-service", "search-service"),
      controlPanelToggleAction("approvals", null),
      controlPanelToggleAction("approvals", "approvals"),
      controlPanelToggleAction("backend-health", null),
      controlPanelToggleAction("backend-health", "backend-health"),
      controlPanelToggleAction("vault-health", null),
      controlPanelToggleAction("vault-health", "vault-health"),
    ];

    setShellGraphVisible(false);
    actions.push(toggleGraphAction());
    setShellGraphVisible(true);
    actions.push(toggleGraphAction());
    setFollowMode(false);
    actions.push(toggleFollowModeAction());
    setFollowMode(true);
    actions.push(toggleFollowModeAction());

    for (const action of actions) {
      expect(resolveMessageResult(runtime, action.label).usedFallback).toBe(false);
    }
    expect(actions).toHaveLength(4 + CONTROL_PANEL_IDS.length * 2 + 4);
  });
});

describe("registry-derived accelerators", () => {
  it("derives the chord once the binding is registered, omits it otherwise", () => {
    expect(openCommandPaletteAction().accelerator).toBeUndefined();
    const dispose = registerKeybindings([
      COMMAND_PALETTE_KEYBINDING,
      KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
    ]);
    expect(openCommandPaletteAction().accelerator).toMatch(/K$/); // Ctrl+K / ⌘+K
    expect(showKeyboardShortcutsAction().accelerator).toBe("?");
    dispose();
    expect(openCommandPaletteAction().accelerator).toBeUndefined();
  });
});
