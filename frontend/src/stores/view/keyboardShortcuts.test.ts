import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type KeybindingDef,
  legacyKeybindingPresentation,
  registerKeybindings,
  resetKeybindings,
} from "../../platform/keymap/registry";
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

  it("normalizes malformed open-state reads before toggling", () => {
    useKeyboardShortcutsStore.setState({
      open: "true",
    } as unknown as Partial<ReturnType<typeof useKeyboardShortcutsStore.getState>>);

    toggleKeyboardShortcuts();

    expect(useKeyboardShortcutsStore.getState().open).toBe(true);
  });

  it("derives the legend from the live registry, not a static list", () => {
    resetKeybindings();
    // An empty registry yields a sparse (empty) legend — honest until enrollment.
    expect(deriveKeyboardShortcutGroups([], {})).toEqual([]);

    registerKeybindings([
      {
        id: "command.palette",
        defaultChord: "Mod+K",
        label: legacyKeybindingPresentation("Open the command palette"),
        group: legacyKeybindingPresentation("General"),
        context: "global",
      },
      {
        id: "graph.next",
        defaultChord: "ArrowRight",
        label: legacyKeybindingPresentation("Next neighbour"),
        group: legacyKeybindingPresentation("Graph"),
        context: "canvas",
      },
    ]);

    const groups = deriveKeyboardShortcutGroups(undefined, {}, false);
    expect(groups.map((group) => group.label)).toEqual(["General", "Graph"]);
    const general = groups.find((group) => group.label === "General");
    expect(general?.id).toBe("legacy:General");
    expect(general?.shortcuts).toContainEqual({
      id: "command.palette",
      label: "Open the command palette",
      keys: [{ key: "common:keycaps.control" }, { kind: "literal", value: "K" }],
    });
  });

  it("reflects an effective override in the derived legend keycaps", () => {
    resetKeybindings();
    registerKeybindings([
      {
        id: "command.palette",
        defaultChord: "Mod+K",
        label: legacyKeybindingPresentation("Open the command palette"),
        group: legacyKeybindingPresentation("General"),
        context: "global",
      },
    ]);
    const groups = deriveKeyboardShortcutGroups(
      undefined,
      { "command.palette": "Mod+P" },
      false,
    );
    expect(groups[0]?.shortcuts[0]).toEqual({
      id: "command.palette",
      label: "Open the command palette",
      keys: [{ key: "common:keycaps.control" }, { kind: "literal", value: "P" }],
    });
  });

  it("retains typed presentations and groups distinct descriptor objects by key", () => {
    const groups = deriveKeyboardShortcutGroups(
      [
        {
          id: "action.retry",
          defaultChord: "Mod+R",
          label: { key: "common:actions.retry" },
          group: { key: "common:actions.showKeyboardShortcuts" },
          context: "global",
        },
        {
          id: "action.close",
          defaultChord: "Escape",
          label: { key: "common:actions.close" },
          group: { key: "common:actions.showKeyboardShortcuts" },
          context: "global",
        },
        {
          id: "action.legacy",
          defaultChord: "L",
          label: legacyKeybindingPresentation("Legacy shortcut"),
          group: legacyKeybindingPresentation("common:actions.showKeyboardShortcuts"),
          context: "global",
        },
      ],
      {},
      false,
    );

    expect(groups).toEqual([
      {
        id: "message:common:actions.showKeyboardShortcuts",
        label: { key: "common:actions.showKeyboardShortcuts" },
        shortcuts: [
          {
            id: "action.retry",
            label: { key: "common:actions.retry" },
            keys: [{ key: "common:keycaps.control" }, { kind: "literal", value: "R" }],
          },
          {
            id: "action.close",
            label: { key: "common:actions.close" },
            keys: [{ key: "common:keycaps.escape" }],
          },
        ],
      },
      {
        id: "legacy:common:actions.showKeyboardShortcuts",
        label: "common:actions.showKeyboardShortcuts",
        shortcuts: [
          {
            id: "action.legacy",
            label: "Legacy shortcut",
            keys: [{ kind: "literal", value: "L" }],
          },
        ],
      },
    ]);
    expect(groups[0]?.shortcuts[0]?.label).not.toBe("action.retry");
  });

  it("omits injected rows with malformed label or group presentations", () => {
    const malformed = [
      {
        id: "bad.label",
        defaultChord: "A",
        label: { key: "common:missing" },
        group: legacyKeybindingPresentation("General"),
        context: "global",
      },
      {
        id: "bad.group",
        defaultChord: "B",
        label: { key: "common:actions.retry" },
        group: {
          key: "common:actions.showKeyboardShortcuts",
          values: { unsafe: "group" },
        },
        context: "global",
      },
    ] as unknown as readonly KeybindingDef[];

    expect(deriveKeyboardShortcutGroups(malformed, {})).toEqual([]);
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
