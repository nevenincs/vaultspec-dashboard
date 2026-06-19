// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { getKeybinding, resetKeybindings } from "../../platform/keymap/registry";
import { resetKeyActions, resolveKeyAction } from "../../stores/view/keymapDispatcher";
import { RIGHT_RAIL_TABS } from "../../stores/view/shellLayout";

// The shell panel intent is the stores-owned dashboard-state write seam; mocked
// so the tab-switch closures are observable without a query client.
const setRightTab = vi.fn((_tab: string) => Promise.resolve(null));
vi.mock("../../stores/server/queries", () => ({
  useActiveScope: () => "scope-a",
}));
vi.mock("../../stores/server/panelStateIntent", () => ({
  useShellPanelIntent: () => ({
    setLeftCollapsed: vi.fn(() => Promise.resolve(null)),
    setRightCollapsed: vi.fn(() => Promise.resolve(null)),
    setRightTab,
  }),
}));

import {
  RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID,
  RIGHT_RAIL_KEYMAP_CONTEXT,
  rightRailTabActionId,
  useRightRailKeybindings,
} from "./rightRailActions";

beforeEach(() => {
  setRightTab.mockClear();
});

afterEach(() => {
  resetKeybindings();
  resetKeyActions();
  document.body.innerHTML = "";
});

describe("useRightRailKeybindings", () => {
  it("registers one Mod+1/2/3 tab binding per activity tab in the right-rail context", () => {
    renderHook(() => useRightRailKeybindings());

    RIGHT_RAIL_TABS.forEach((tab, index) => {
      expect(getKeybinding(rightRailTabActionId(tab.id))).toMatchObject({
        defaultChord: `Mod+${index + 1}`,
        context: "right-rail",
        group: "Right rail",
      });
    });
  });

  it("registers the global focus-search binding", () => {
    renderHook(() => useRightRailKeybindings());
    expect(getKeybinding(RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID)).toMatchObject({
      defaultChord: "Mod+Shift+S",
      context: "global",
    });
  });

  it("disposes the bindings and action resolvers on unmount", () => {
    const firstTabId = rightRailTabActionId(RIGHT_RAIL_TABS[0]!.id);
    const { unmount } = renderHook(() => useRightRailKeybindings());
    expect(getKeybinding(firstTabId)).toBeDefined();
    unmount();
    expect(getKeybinding(firstTabId)).toBeUndefined();
    expect(resolveKeyAction(firstTabId)).toBeNull();
  });

  it("each tab action routes to setRightTab for its tab id", () => {
    renderHook(() => useRightRailKeybindings());
    for (const tab of RIGHT_RAIL_TABS) {
      resolveKeyAction(rightRailTabActionId(tab.id))!.run!();
    }
    expect(setRightTab.mock.calls.map((call) => call[0])).toEqual(
      RIGHT_RAIL_TABS.map((tab) => tab.id),
    );
  });

  it("focus-search switches to the search tab", () => {
    renderHook(() => useRightRailKeybindings());
    resolveKeyAction(RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID)!.run!();
    expect(setRightTab).toHaveBeenCalledWith("search");
  });

  it("exposes the rail's keymap-context attribute value", () => {
    expect(RIGHT_RAIL_KEYMAP_CONTEXT).toBe("right-rail");
  });
});
