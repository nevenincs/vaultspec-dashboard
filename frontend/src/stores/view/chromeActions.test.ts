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
  footerChipAction,
  openCommandPaletteAction,
  reviewInboxAction,
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
import { useAgentPanel } from "./agentPanel";
import { KEYBOARD_SHORTCUTS_TOGGLE_BINDING } from "./keyboardShortcuts";
import { setFollowMode } from "./selection";
import { setShellGraphVisible } from "./shellLayout";

afterEach(() => {
  resetKeybindings();
  closeControlPanel();
  useAgentPanel.setState({ open: false, panelView: "transcript" });
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

  it("projects the four modal panel labels and runs the real toggle", () => {
    // Review is no longer a modal panel (review-surface-flow ADR F1), so it is not
    // in the modal-panel action set. The agent-service panel (a2a-product-provisioning
    // W05.P12) is the fourth modal identity, appended in cluster order.
    expect(controlPanelActions(null).map((action) => action.label)).toEqual([
      { key: "common:controlPanels.actions.showSearch" },
      { key: "common:controlPanels.actions.showSystemStatus" },
      { key: "common:controlPanels.actions.showProjectHealth" },
      { key: "common:controlPanels.actions.showAgentService" },
    ]);

    const show = controlPanelToggleAction("search-service", null);
    show.run?.();
    expect(useControlPanels.getState().open).toBe("search-service");

    const hide = controlPanelToggleAction("search-service", "search-service");
    expect(hide.label).toEqual({
      key: "common:controlPanels.actions.hideSearch",
    });
    hide.run?.();
    expect(useControlPanels.getState().open).toBeNull();
  });

  it("routes the review chip to the Agent pending view under the preserved id", () => {
    const review = reviewInboxAction();
    // The action id is preserved from the retired Approvals modal so keymap/palette
    // enrollment carries over unchanged (one descriptor, one id).
    expect(review.id).toBe("panel:approvals");
    expect(review.label).toEqual({ key: "common:controlPanels.actions.showApprovals" });

    // footerChipAction dispatches the review chip to that descriptor and the panel
    // chips to their modal toggle.
    expect(footerChipAction("approvals", null).id).toBe("panel:approvals");
    expect(footerChipAction("search-service", null).id).toBe("panel:search-service");

    review.run?.();
    expect(useAgentPanel.getState().open).toBe(true);
    expect(useAgentPanel.getState().panelView).toBe("pending");
    // It opens the Agent panel, never a modal control panel.
    expect(useControlPanels.getState().open).toBeNull();
  });

  it("resolves every chrome descriptor through the real localization runtime", () => {
    const runtime = createTestLocalizationRuntime();
    const actions = [
      ...chromeEscapeHatchActions(),
      controlPanelToggleAction("search-service", null),
      controlPanelToggleAction("search-service", "search-service"),
      controlPanelToggleAction("backend-health", null),
      controlPanelToggleAction("backend-health", "backend-health"),
      controlPanelToggleAction("vault-health", null),
      controlPanelToggleAction("vault-health", "vault-health"),
      controlPanelToggleAction("agent-service", null),
      controlPanelToggleAction("agent-service", "agent-service"),
      reviewInboxAction(),
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
    expect(actions).toHaveLength(4 + CONTROL_PANEL_IDS.length * 2 + 1 + 4);
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
