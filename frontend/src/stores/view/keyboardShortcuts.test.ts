import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setIsMacForTesting } from "../../platform/keymap/chord";
import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import {
  closeKeyboardShortcuts,
  deriveKeyboardShortcutGroups,
  openKeyboardShortcuts,
  shouldToggleKeyboardShortcuts,
  toggleKeyboardShortcuts,
  useKeyboardShortcutsStore,
} from "./keyboardShortcuts";

describe("keyboard shortcuts store", () => {
  beforeEach(() => useKeyboardShortcutsStore.getState().reset());
  afterEach(() => {
    resetKeybindings();
    setIsMacForTesting(null);
  });

  it("opens, closes, and toggles the lifted shortcut legend", () => {
    expect(useKeyboardShortcutsStore.getState().open).toBe(false);

    useKeyboardShortcutsStore.getState().openDialog();
    expect(useKeyboardShortcutsStore.getState().open).toBe(true);

    useKeyboardShortcutsStore.getState().closeDialog();
    expect(useKeyboardShortcutsStore.getState().open).toBe(false);

    useKeyboardShortcutsStore.getState().toggleDialog();
    expect(useKeyboardShortcutsStore.getState().open).toBe(true);
  });

  it("exposes named shortcut-legend helpers for app-layer consumers", () => {
    openKeyboardShortcuts();
    expect(useKeyboardShortcutsStore.getState().open).toBe(true);

    toggleKeyboardShortcuts();
    expect(useKeyboardShortcutsStore.getState().open).toBe(false);

    toggleKeyboardShortcuts();
    closeKeyboardShortcuts();
    expect(useKeyboardShortcutsStore.getState().open).toBe(false);
  });

  it("derives the legend from the live registry, not a static list", () => {
    setIsMacForTesting(false); // Mod -> "Ctrl"
    resetKeybindings();
    // An empty registry yields a sparse (empty) legend — honest until enrollment.
    expect(deriveKeyboardShortcutGroups([], {})).toEqual([]);

    registerKeybindings([
      {
        id: "command.palette",
        defaultChord: "Mod+K",
        label: "Open the command palette",
        group: "General",
        context: "global",
      },
      {
        id: "graph.next",
        defaultChord: "ArrowRight",
        label: "Next neighbour",
        group: "Graph",
        context: "canvas",
      },
    ]);

    const groups = deriveKeyboardShortcutGroups(undefined, {});
    expect(groups.map((g) => g.name).sort()).toEqual(["General", "Graph"]);
    const general = groups.find((g) => g.name === "General");
    expect(general?.shortcuts).toContainEqual({
      label: "Open the command palette",
      keys: ["Ctrl", "K"],
    });
  });

  it("reflects an effective override in the derived legend keycaps", () => {
    setIsMacForTesting(false);
    resetKeybindings();
    registerKeybindings([
      {
        id: "command.palette",
        defaultChord: "Mod+K",
        label: "Open the command palette",
        group: "General",
        context: "global",
      },
    ]);
    const groups = deriveKeyboardShortcutGroups(undefined, {
      "command.palette": "Mod+P",
    });
    expect(groups[0]?.shortcuts[0]).toEqual({
      label: "Open the command palette",
      keys: ["Ctrl", "P"],
    });
  });

  it("derives the global shortcut toggle intent without modifiers", () => {
    expect(
      shouldToggleKeyboardShortcuts({
        key: "?",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: null,
      }),
    ).toBe(true);
    expect(
      shouldToggleKeyboardShortcuts({
        key: "?",
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        target: null,
      }),
    ).toBe(false);
    expect(
      shouldToggleKeyboardShortcuts({
        key: "/",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: null,
      }),
    ).toBe(false);
  });
});
