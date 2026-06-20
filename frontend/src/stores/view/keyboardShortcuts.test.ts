import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setIsMacForTesting } from "../../platform/keymap/chord";
import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
  KEYBOARD_SHORTCUTS_TOGGLE_LABEL,
  closeKeyboardShortcuts,
  deriveKeyboardShortcutGroups,
  normalizeKeyboardShortcutsOpen,
  openKeyboardShortcuts,
  setKeyboardShortcutsOpen,
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

  it("normalizes explicit open-state writes at the shortcut-legend seam", () => {
    expect(normalizeKeyboardShortcutsOpen(true)).toBe(true);
    expect(normalizeKeyboardShortcutsOpen(false)).toBe(false);
    expect(normalizeKeyboardShortcutsOpen("true")).toBeNull();
    expect(normalizeKeyboardShortcutsOpen(1)).toBeNull();

    setKeyboardShortcutsOpen(true);
    expect(useKeyboardShortcutsStore.getState().open).toBe(true);

    setKeyboardShortcutsOpen("false");
    expect(useKeyboardShortcutsStore.getState().open).toBe(true);

    setKeyboardShortcutsOpen(false);
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

  it("declares the shortcut legend toggle as a bindable keymap command", () => {
    expect(KEYBOARD_SHORTCUTS_TOGGLE_BINDING).toMatchObject({
      defaultChord: "?",
      label: KEYBOARD_SHORTCUTS_TOGGLE_LABEL,
      group: "General",
      context: "global",
    });
  });
});
