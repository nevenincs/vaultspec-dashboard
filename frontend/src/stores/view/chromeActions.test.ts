// Shared app-chrome builders (background-context-menus): the escape-hatch set, the
// reset-layout time-travel gate, localized state-aware labels, the Advanced-console
// deep link, and registry-derived accelerators.

import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import {
  RESET_LAYOUT_ACTION_ID,
  SETTINGS_ACTION_ID,
  ADVANCED_SETTINGS_ACTION_ID,
  chromeEscapeHatchActions,
  openAdvancedSettingsAction,
  agentPendingChangesAction,
  openCommandPaletteAction,
  showKeyboardShortcutsAction,
  toggleFollowModeAction,
  toggleGraphAction,
} from "./chromeActions";
import { COMMAND_PALETTE_KEYBINDING } from "./commandPalette";
import { collapseAdvancedConsoles, useAdvancedConsole } from "./advancedConsole";
import { closeSettingsDialog, useSettingsDialog } from "./settingsDialog";
import { useAgentPanel } from "./agentPanel";
import { KEYBOARD_SHORTCUTS_TOGGLE_BINDING } from "./keyboardShortcuts";
import { setFollowMode } from "./selection";
import { getShellCenterSlot, setShellCenterSlot } from "./shellLayout";

afterEach(() => {
  resetKeybindings();
  collapseAdvancedConsoles();
  closeSettingsDialog();
  useAgentPanel.setState({ panelView: "transcript" });
  setFollowMode(true);
  setShellCenterSlot("graph");
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
    setShellCenterSlot("none");
    expect(toggleGraphAction().label).toEqual({ key: "common:actions.showGraph" });
    setShellCenterSlot("graph");
    expect(toggleGraphAction().label).toEqual({ key: "common:actions.hideGraph" });
    // The agent panel holding the slot means the graph is NOT shown, so the graph
    // verb offers to show it — the label reads the slot, not a stale boolean.
    setShellCenterSlot("agent");
    expect(toggleGraphAction().label).toEqual({ key: "common:actions.showGraph" });

    setFollowMode(false);
    expect(toggleFollowModeAction().label).toEqual({
      key: "common:actions.enableFollowMode",
    });
    setFollowMode(true);
    expect(toggleFollowModeAction().label).toEqual({
      key: "common:actions.disableFollowMode",
    });
  });

  it("collapses the four retired panel toggles into ONE Advanced destination", () => {
    // advanced-service-console ADR D2/D7: one command, one destination — the
    // per-panel show/hide vocabulary retired with the modal host.
    const open = openAdvancedSettingsAction();
    expect(open.id).toBe(ADVANCED_SETTINGS_ACTION_ID);
    expect(open.label).toEqual({ key: "common:actions.openAdvancedSettings" });

    open.run?.();
    // It opens Settings AND expands the primary console — the one-click access
    // path the record specifies, not a bare dialog open.
    expect(useSettingsDialog.getState().open).toBe(true);
    expect(useAdvancedConsole.getState().expanded).toBe("index");
  });

  it("routes the pending chip to the Agent pending view on the agent plane", () => {
    const pending = agentPendingChangesAction();
    // The retired Approvals modal's id and vocabulary are GONE: the verb is enrolled
    // where it acts, and its label lives under common:agent.*.
    expect(pending.id).toBe("agent:pending-changes");
    expect(pending.label).toEqual({ key: "common:agent.pending.show" });

    setShellCenterSlot("graph");
    pending.run?.();
    // It gives the center slot to the Agent panel, never opens a modal panel.
    expect(getShellCenterSlot()).toBe("agent");
    expect(useAgentPanel.getState().panelView).toBe("pending");
  });

  it("resolves every chrome descriptor through the real localization runtime", () => {
    const runtime = createTestLocalizationRuntime();
    const actions = [
      ...chromeEscapeHatchActions(),
      openAdvancedSettingsAction(),
      agentPendingChangesAction(),
    ];

    setShellCenterSlot("none");
    actions.push(toggleGraphAction());
    setShellCenterSlot("graph");
    actions.push(toggleGraphAction());
    setFollowMode(false);
    actions.push(toggleFollowModeAction());
    setFollowMode(true);
    actions.push(toggleFollowModeAction());

    for (const action of actions) {
      expect(resolveMessageResult(runtime, action.label).usedFallback).toBe(false);
    }
    expect(actions).toHaveLength(4 + 2 + 4);
  });
});

describe("registry-derived accelerators", () => {
  it("derives the chord once the binding is registered, omits it otherwise", () => {
    expect(openCommandPaletteAction().accelerator).toBeUndefined();
    const dispose = registerKeybindings([
      COMMAND_PALETTE_KEYBINDING,
      KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
    ]);
    expect(openCommandPaletteAction().accelerator?.at(-1)).toEqual({
      kind: "literal",
      value: "K",
    });
    expect(showKeyboardShortcutsAction().accelerator).toEqual([
      { kind: "literal", value: "?" },
    ]);
    dispose();
    expect(openCommandPaletteAction().accelerator).toBeUndefined();
  });
});
