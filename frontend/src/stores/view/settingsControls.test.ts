import { describe, expect, it } from "vitest";

import {
  type KeybindingDef,
  MAX_KEYBINDING_ID_LEN,
  legacyKeybindingPresentation,
} from "../../platform/keymap/registry";
import type { SettingDef } from "../server/engine";
import {
  deriveSettingsEnumControlView,
  deriveSettingsKeybindingControlView,
  deriveSettingsNumberControlView,
  deriveSettingsSwitchControlView,
  deriveSettingsTextControlView,
  clearKeybindingOverride,
  keybindingConflictIds,
  keybindingConflictPresentations,
  nextKeybindingOverrides,
  normalizeSettingsKeybindingId,
  resetSettingsKeybindingRecorder,
  serializeKeybindingOverrides,
  settingsNumberControlCommitValue,
  settingsEnumKeyboardTarget,
  settingsKeybindingChordFromEvent,
  toggleSettingsKeybindingRecording,
  useSettingsKeybindingRecorderStore,
} from "./settingsControls";

const integerDef: SettingDef = {
  key: "confidence_floor",
  value_type: { type: "integer", min: 0, max: 100 },
  default: "25",
  scope_eligible: true,
  control: "slider",
  display: { id: "graph.confidenceFloor", group: "graph", enum_members: [] },
  order: 1,
  step: 5,
  unit: "%",
};

const enumDef: SettingDef = {
  key: "theme",
  value_type: { type: "enum", members: ["system", "light", "dark"] },
  default: "system",
  scope_eligible: false,
  control: "segmented",
  display: {
    id: "appearance.theme",
    group: "appearance",
    enum_members: [
      { value: "system", id: "theme.system" },
      { value: "light", id: "theme.light" },
      { value: "dark", id: "theme.dark" },
    ],
  },
  order: 1,
};

const textDef: SettingDef = {
  key: "label_filter",
  value_type: { type: "string", max_len: 120 },
  default: "",
  scope_eligible: false,
  control: "text",
  display: { id: "graph.labelFilter", group: "graph", enum_members: [] },
  order: 3,
};

const enumLabels = new Map([
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
]);

const keybindingDefs = [
  {
    id: "command.palette",
    defaultChord: "Ctrl+K",
    label: { key: "common:actions.openCommandPalette" },
    group: { key: "common:shortcutDialog.title" },
    context: "global",
  },
  {
    id: "help.legend",
    defaultChord: "?",
    label: { key: "common:actions.showKeyboardShortcuts" },
    group: { key: "common:shortcutDialog.title" },
    context: "global",
  },
] as const;

describe("settings control view projections", () => {
  it("projects enum segment rows and keyboard targets from one seam", () => {
    const view = deriveSettingsEnumControlView(enumDef, "light", enumLabels);

    expect(view).toEqual({
      rootClassName:
        "flex shrink-0 flex-wrap gap-fg-0-5 rounded-fg-xs border border-rule bg-paper-sunken p-fg-0-5",
      options: [
        expect.objectContaining({
          value: "system",
          active: false,
          tabIndex: -1,
          className: expect.stringContaining("text-ink-faint"),
        }),
        expect.objectContaining({
          value: "light",
          active: true,
          tabIndex: 0,
          className: expect.stringContaining("bg-paper-raised"),
        }),
        expect.objectContaining({
          value: "dark",
          active: false,
          tabIndex: -1,
          className: expect.stringContaining("hover:text-ink-muted"),
        }),
      ],
    });
    expect(settingsEnumKeyboardTarget(view.options, 1, "ArrowRight")).toBe("dark");
    expect(settingsEnumKeyboardTarget(view.options, 1, "ArrowLeft")).toBe("system");
    expect(settingsEnumKeyboardTarget(view.options, 1, "Enter")).toBeNull();
  });

  it("falls back to a declared enum member when persisted state is malformed", () => {
    const view = deriveSettingsEnumControlView(enumDef, "solarized", enumLabels);

    expect(
      view.options.map((option) => [option.value, option.active, option.tabIndex]),
    ).toEqual([
      ["system", true, 0],
      ["light", false, -1],
      ["dark", false, -1],
    ]);

    const fallbackToFirst = deriveSettingsEnumControlView(
      { ...enumDef, default: "missing" },
      "solarized",
      enumLabels,
    );
    expect(fallbackToFirst.options[0]).toMatchObject({
      value: "system",
      active: true,
      tabIndex: 0,
    });
  });

  it("renders no enum options when localized labels are incomplete", () => {
    const hostile = {
      ...enumDef,
      value_type: {
        type: "enum" as const,
        members: ["system", "high-contrast"],
      },
      display: {
        ...enumDef.display,
        enum_members: [
          { value: "system", id: "theme.system" as const },
          { value: "high-contrast", id: "theme.highContrast" as const },
        ],
      },
    };
    expect(
      deriveSettingsEnumControlView(hostile, "system", new Map([["system", "System"]]))
        .options,
    ).toEqual([]);
    expect(deriveSettingsEnumControlView(hostile, "system").options).toEqual([]);
  });

  it("projects switch state and next wire value from one seam", () => {
    expect(deriveSettingsSwitchControlView("true")).toEqual({
      checked: true,
      nextValue: "false",
      buttonClassName:
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-fg-pill border transition-colors duration-ui-fast focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 border-accent bg-accent",
      knobClassName:
        "inline-block size-3.5 rounded-full bg-paper shadow-fg-raised transition-transform duration-ui-fast translate-x-4",
    });
    expect(deriveSettingsSwitchControlView("false")).toEqual(
      expect.objectContaining({ checked: false, nextValue: "true" }),
    );
  });

  it("projects integer slider bounds, readout, and fallback decoding", () => {
    expect(deriveSettingsNumberControlView(integerDef, "70")).toEqual({
      min: 0,
      max: 100,
      step: 5,
      current: 70,
      readout: "70%",
      ariaValueText: "70%",
    });
    expect(deriveSettingsNumberControlView(integerDef, "not-a-number")).toEqual(
      expect.objectContaining({ current: 25, readout: "25%" }),
    );
    expect(deriveSettingsNumberControlView(integerDef, "-10")).toEqual(
      expect.objectContaining({ current: 0, readout: "0%" }),
    );
    expect(deriveSettingsNumberControlView(integerDef, "1000")).toEqual(
      expect.objectContaining({ current: 100, readout: "100%" }),
    );
  });

  it("normalizes slider commit values before they leave the control seam", () => {
    expect(settingsNumberControlCommitValue(integerDef, "70")).toBe("70");
    expect(settingsNumberControlCommitValue(integerDef, "1000")).toBe("100");
    expect(settingsNumberControlCommitValue(integerDef, "-10")).toBe("0");
    expect(settingsNumberControlCommitValue(integerDef, 42.8)).toBe("42");
    expect(settingsNumberControlCommitValue(integerDef, "not-a-number")).toBeNull();
    expect(settingsNumberControlCommitValue(integerDef, Number.NaN)).toBeNull();
    expect(settingsNumberControlCommitValue(integerDef, null)).toBeNull();
  });

  it("projects text input constraints and chrome from the setting schema", () => {
    expect(deriveSettingsTextControlView(textDef)).toEqual({
      maxLength: 120,
      className:
        "w-48 rounded-fg-xs border border-rule bg-paper-sunken px-fg-2 py-fg-1 text-body text-ink outline-none transition-colors duration-ui-fast focus-within:border-rule-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50 placeholder:text-ink-faint",
    });
    expect(
      deriveSettingsTextControlView({
        ...textDef,
        value_type: { type: "bool" },
      }),
    ).toEqual(expect.objectContaining({ maxLength: undefined }));
  });

  it("carries typed keybinding presentations with stable semantic identities", () => {
    const view = deriveSettingsKeybindingControlView('{"help.legend":"Ctrl+P"}', [
      ...keybindingDefs,
      {
        id: "legacy.group",
        defaultChord: "Ctrl+L",
        label: legacyKeybindingPresentation("Legacy action"),
        group: legacyKeybindingPresentation("message:common:shortcutDialog.title"),
        context: "global",
      },
    ]);

    expect(view.empty).toBe(false);
    expect(view.groups.map((group) => group.id)).toEqual([
      "message:common:shortcutDialog.title",
      "legacy:message:common:shortcutDialog.title",
    ]);
    expect(view.groups[0]).toEqual({
      id: "message:common:shortcutDialog.title",
      label: { key: "common:shortcutDialog.title" },
      rows: [
        {
          id: "command.palette",
          label: { key: "common:actions.openCommandPalette" },
          chord: "Ctrl+K",
          keycaps: [{ key: "common:keycaps.control" }, { kind: "literal", value: "K" }],
          overridden: false,
        },
        {
          id: "help.legend",
          label: { key: "common:actions.showKeyboardShortcuts" },
          chord: "Ctrl+P",
          keycaps: [{ key: "common:keycaps.control" }, { kind: "literal", value: "P" }],
          overridden: true,
        },
      ],
    });
    expect(view.groups[1]?.rows.map((row) => row.id)).toEqual(["legacy.group"]);
  });

  it("fails closed to the empty view when every presentation is malformed", () => {
    const malformedDefs = [
      {
        id: "unsafe.action",
        defaultChord: "Ctrl+U",
        label: { key: "missing:action" },
        group: { key: "common:shortcutDialog.title" },
        context: "global",
      },
    ] as unknown as readonly KeybindingDef[];

    expect(deriveSettingsKeybindingControlView("{}", malformedDefs)).toEqual({
      overrides: {},
      groups: [],
      empty: true,
    });
    expect(
      keybindingConflictPresentations({}, "command.palette", "Ctrl+U", [
        keybindingDefs[0],
        ...malformedDefs,
      ]),
    ).toEqual([]);
  });

  it("stores the active keybinding recorder row behind one seam", () => {
    resetSettingsKeybindingRecorder();

    expect(normalizeSettingsKeybindingId(" command.palette ")).toBe("command.palette");
    expect(normalizeSettingsKeybindingId("   ")).toBeNull();
    expect(normalizeSettingsKeybindingId(null)).toBeNull();
    expect(
      normalizeSettingsKeybindingId("x".repeat(MAX_KEYBINDING_ID_LEN + 1)),
    ).toBeNull();

    toggleSettingsKeybindingRecording(" command.palette ");
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBe(
      "command.palette",
    );

    toggleSettingsKeybindingRecording("command.palette");
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBeNull();

    toggleSettingsKeybindingRecording("   ");
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBeNull();

    toggleSettingsKeybindingRecording("x".repeat(MAX_KEYBINDING_ID_LEN + 1));
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBeNull();

    toggleSettingsKeybindingRecording("help.legend");
    resetSettingsKeybindingRecorder();
    expect(useSettingsKeybindingRecorderStore.getState().recordingId).toBeNull();
  });

  it("normalizes keybinding override ids before sparse-map mutation", () => {
    expect(
      nextKeybindingOverrides({}, " command.palette ", "Ctrl+P", keybindingDefs),
    ).toEqual({
      "command.palette": "Ctrl+P",
    });
    expect(
      nextKeybindingOverrides(
        { "command.palette": "Ctrl+P" },
        " command.palette ",
        "Ctrl+K",
        keybindingDefs,
      ),
    ).toEqual({});
    expect(nextKeybindingOverrides({}, "   ", "Ctrl+P", keybindingDefs)).toEqual({});
    expect(
      nextKeybindingOverrides(
        {},
        "x".repeat(MAX_KEYBINDING_ID_LEN + 1),
        "Ctrl+P",
        keybindingDefs,
      ),
    ).toEqual({});
    expect(
      nextKeybindingOverrides(
        { " help.legend ": " F2 ", stale: "" },
        " command.palette ",
        "Ctrl+P",
        keybindingDefs,
      ),
    ).toEqual({
      "help.legend": "F2",
      "command.palette": "Ctrl+P",
    });
    expect(
      clearKeybindingOverride(
        { " command.palette ": " Ctrl+P ", stale: "" },
        " command.palette ",
      ),
    ).toEqual({});
    expect(
      keybindingConflictIds(
        { " help.legend ": " F2 " },
        " command.palette ",
        "F2",
        keybindingDefs,
      ),
    ).toEqual(["help.legend"]);
    expect(
      keybindingConflictPresentations(
        { " help.legend ": " F2 " },
        " command.palette ",
        "F2",
        keybindingDefs,
      ),
    ).toEqual([
      {
        id: "help.legend",
        label: { key: "common:actions.showKeyboardShortcuts" },
      },
    ]);
    expect(
      keybindingConflictPresentations({}, " command.palette ", "Ctrl+P", [
        ...keybindingDefs,
        {
          id: "custom.open",
          defaultChord: "Ctrl+P",
          label: legacyKeybindingPresentation("Custom open"),
          group: legacyKeybindingPresentation("General"),
          context: "global",
        },
      ]),
    ).toEqual([
      {
        id: "custom.open",
        label: legacyKeybindingPresentation("Custom open"),
      },
    ]);
  });

  it("serializes keybinding overrides through the platform override normalizer", () => {
    expect(
      serializeKeybindingOverrides({ " command.palette ": " Ctrl+P ", stale: "" }),
    ).toBe('{"command.palette":"Ctrl+P"}');
  });

  it("derives recorder chord strings from key events at the settings seam", () => {
    expect(
      settingsKeybindingChordFromEvent({
        key: "p",
        metaKey: true,
        ctrlKey: false,
        altKey: false,
        shiftKey: true,
      }),
    ).toBe("Mod+Shift+P");

    expect(
      settingsKeybindingChordFromEvent({
        key: "Control",
        metaKey: false,
        ctrlKey: true,
        altKey: false,
        shiftKey: false,
      }),
    ).toBeNull();
  });
});
