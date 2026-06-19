// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { getKeybinding, resetKeybindings } from "../../platform/keymap/registry";
import { resetKeyActions, resolveKeyAction } from "../../stores/view/keymapDispatcher";

// The browser-mode store is real (a tiny zustand store with no wire); the
// canonical text-filter draft and the active scope are mocked so the action run
// closures can be observed without a query client.
const clear = vi.fn();
vi.mock("../../stores/server/queries", () => ({
  useActiveScope: () => "scope-a",
}));
vi.mock("../../stores/view/dashboardTextFilter", () => ({
  useDashboardTextFilterDraft: () => ({ value: "", setValue: vi.fn(), clear }),
}));

import { useBrowserModeStore } from "../../stores/view/browserMode";
import {
  LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
  LEFT_RAIL_CYCLE_MODE_ACTION_ID,
  LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
  LEFT_RAIL_KEYMAP_CONTEXT,
  useLeftRailKeybindings,
} from "./leftRailActions";

beforeEach(() => {
  clear.mockClear();
  useBrowserModeStore.setState({ mode: "vault" });
});

afterEach(() => {
  resetKeybindings();
  resetKeyActions();
  document.body.innerHTML = "";
});

describe("useLeftRailKeybindings", () => {
  it("registers the three left-rail bindings with their ids, chords, and contexts", () => {
    renderHook(() => useLeftRailKeybindings());

    expect(getKeybinding(LEFT_RAIL_CYCLE_MODE_ACTION_ID)).toMatchObject({
      defaultChord: "Mod+B",
      context: "left-rail",
      group: "Left rail",
    });
    expect(getKeybinding(LEFT_RAIL_FOCUS_FILTER_ACTION_ID)).toMatchObject({
      defaultChord: "Mod+Shift+F",
      context: "global",
    });
    expect(getKeybinding(LEFT_RAIL_CLEAR_FILTER_ACTION_ID)).toMatchObject({
      defaultChord: "Mod+Shift+X",
      context: "global",
    });
  });

  it("disposes the bindings and action resolvers on unmount", () => {
    const { unmount } = renderHook(() => useLeftRailKeybindings());
    expect(getKeybinding(LEFT_RAIL_CYCLE_MODE_ACTION_ID)).toBeDefined();
    unmount();
    expect(getKeybinding(LEFT_RAIL_CYCLE_MODE_ACTION_ID)).toBeUndefined();
    expect(resolveKeyAction(LEFT_RAIL_CYCLE_MODE_ACTION_ID)).toBeNull();
  });

  it("cycle-mode advances vault → code → vault through the browser-mode store", () => {
    renderHook(() => useLeftRailKeybindings());
    const cycle = () => resolveKeyAction(LEFT_RAIL_CYCLE_MODE_ACTION_ID)!.run!();

    expect(useBrowserModeStore.getState().mode).toBe("vault");
    cycle();
    expect(useBrowserModeStore.getState().mode).toBe("code");
    cycle();
    expect(useBrowserModeStore.getState().mode).toBe("vault");
  });

  it("clear-filter invokes the canonical text-filter clear intent", () => {
    renderHook(() => useLeftRailKeybindings());
    resolveKeyAction(LEFT_RAIL_CLEAR_FILTER_ACTION_ID)!.run!();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("focus-filter focuses the rendered rail filter input", () => {
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-rail-filter", "");
    const input = document.createElement("input");
    input.setAttribute("data-kit-search-input", "");
    wrapper.appendChild(input);
    document.body.appendChild(wrapper);

    renderHook(() => useLeftRailKeybindings());
    resolveKeyAction(LEFT_RAIL_FOCUS_FILTER_ACTION_ID)!.run!();
    expect(document.activeElement).toBe(input);
  });

  it("exposes the rail's keymap-context attribute value", () => {
    expect(LEFT_RAIL_KEYMAP_CONTEXT).toBe("left-rail");
  });
});
