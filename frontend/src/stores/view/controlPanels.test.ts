// The shared control-panel open state (activity-rail-realignment ADR D3) and its
// helpers. The store drives the rail-footer chips, the command palette, and the
// keymap; this pins the modal single-open transitions and the boundary normalizer.

import { afterEach, describe, expect, it } from "vitest";

import {
  CONTROL_PANEL_IDS,
  closeControlPanel,
  normalizeControlPanelId,
  openControlPanel,
  toggleControlPanel,
  useControlPanels,
} from "./controlPanels";

afterEach(() => useControlPanels.getState().closePanel());

describe("useControlPanels store", () => {
  it("starts with every panel closed", () => {
    expect(useControlPanels.getState().open).toBeNull();
  });

  it("opens one panel and closes it", () => {
    openControlPanel("approvals");
    expect(useControlPanels.getState().open).toBe("approvals");
    closeControlPanel();
    expect(useControlPanels.getState().open).toBeNull();
  });

  it("is modal: opening a second panel replaces the first", () => {
    openControlPanel("search-service");
    expect(useControlPanels.getState().open).toBe("search-service");
    openControlPanel("backend-health");
    expect(useControlPanels.getState().open).toBe("backend-health");
  });

  it("toggles a panel open then closed", () => {
    toggleControlPanel("vault-health");
    expect(useControlPanels.getState().open).toBe("vault-health");
    toggleControlPanel("vault-health");
    expect(useControlPanels.getState().open).toBeNull();
  });

  it("toggling a different panel while one is open switches to it", () => {
    toggleControlPanel("approvals");
    expect(useControlPanels.getState().open).toBe("approvals");
    toggleControlPanel("search-service");
    expect(useControlPanels.getState().open).toBe("search-service");
  });

  it("ignores an unknown id on open and toggle", () => {
    openControlPanel("nope");
    expect(useControlPanels.getState().open).toBeNull();
    openControlPanel("approvals");
    toggleControlPanel("nope");
    expect(useControlPanels.getState().open).toBe("approvals");
  });
});

describe("normalizeControlPanelId", () => {
  it("accepts every known panel id", () => {
    for (const id of CONTROL_PANEL_IDS) {
      expect(normalizeControlPanelId(id)).toBe(id);
    }
  });

  it("rejects unknown, empty, and non-string input", () => {
    expect(normalizeControlPanelId("settings")).toBeNull();
    expect(normalizeControlPanelId("")).toBeNull();
    expect(normalizeControlPanelId(null)).toBeNull();
    expect(normalizeControlPanelId(undefined)).toBeNull();
    expect(normalizeControlPanelId(3)).toBeNull();
    expect(normalizeControlPanelId({ id: "approvals" })).toBeNull();
  });
});
