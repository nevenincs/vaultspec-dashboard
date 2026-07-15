import { describe, expect, it } from "vitest";

import type { SettingDef, SettingsSchema, SettingsState } from "./engine";
import {
  defaultSettingsEditTarget,
  effectiveSettingsEditTarget,
  isSettingsEditTarget,
  normalizeSettingsEditTarget,
  parseGraphControlOverrides,
  parseKeybindingOverrides,
  resolveEffective,
  resolveGraphControlOverrides,
  resolveKeybindingOverrides,
  resolveLanguagePreference,
  resolveReduceMotionSetting,
  settingCanTargetScope,
  settingsControlIsDefaulted,
  settingsControlValue,
  settingsProvenanceNote,
} from "./settingsSelectors";

const def: SettingDef = {
  key: "default_granularity",
  value_type: { type: "enum", members: ["feature", "document"] },
  default: "feature",
  scope_eligible: true,
  control: "segmented",
  display: {
    id: "graph.defaultGranularity",
    group: "graph",
    enum_members: [
      { value: "feature", id: "granularity.feature" },
      { value: "document", id: "granularity.document" },
    ],
  },
  order: 1,
};

const reduceMotionDef: SettingDef = {
  key: "reduce_motion",
  value_type: { type: "bool" },
  default: "false",
  scope_eligible: false,
  control: "switch",
  display: {
    id: "appearance.reduceMotion",
    group: "appearance",
    enum_members: [],
  },
  order: 2,
};

function settings(
  global: Record<string, string> = {},
  scoped: Record<string, Record<string, string>> = {},
): SettingsState {
  return { global, scoped, tiers: {} };
}

describe("settings row derivations", () => {
  it("normalizes settings edit targets beside the target type", () => {
    expect(isSettingsEditTarget("global")).toBe(true);
    expect(isSettingsEditTarget("scope")).toBe(true);
    expect(isSettingsEditTarget(" scope ")).toBe(true);
    expect(isSettingsEditTarget("workspace")).toBe(false);
    expect(isSettingsEditTarget(null)).toBe(false);
    expect(normalizeSettingsEditTarget(" scope ")).toBe("scope");
    expect(normalizeSettingsEditTarget("   ")).toBeNull();
  });

  it("derives global/default row facts from schema and settings state", () => {
    const eff = resolveEffective(def, settings(), "scope-a");

    expect(settingCanTargetScope(eff, "scope-a")).toBe(true);
    expect(defaultSettingsEditTarget(eff)).toBe("global");
    expect(effectiveSettingsEditTarget(eff, "scope-a", "global")).toBe("global");
    expect(settingsControlValue(eff, "global")).toBe("feature");
    expect(settingsControlIsDefaulted(eff, "global")).toBe(true);
    expect(settingsProvenanceNote(eff, "global")).toBe("Using the default.");
  });

  it("shows inherited effective value when editing a missing scope override", () => {
    const eff = resolveEffective(
      def,
      settings({ default_granularity: "document" }),
      "scope-a",
    );

    expect(settingsControlValue(eff, "scope")).toBe("document");
    expect(settingsProvenanceNote(eff, "scope")).toBe(
      "Editing this scope (currently inheriting global).",
    );
  });

  it("defaults to scope editing when a scope override exists", () => {
    const eff = resolveEffective(
      def,
      settings(
        { default_granularity: "feature" },
        { "scope-a": { default_granularity: "document" } },
      ),
      "scope-a",
    );

    expect(defaultSettingsEditTarget(eff)).toBe("scope");
    expect(settingsControlValue(eff, "scope")).toBe("document");
    expect(settingsControlIsDefaulted(eff, "scope")).toBe(false);
    expect(settingsProvenanceNote(eff, "scope")).toBe("Overridden for this scope.");
    expect(settingsProvenanceNote(eff, "global")).toBe(
      "This scope overrides the global value.",
    );
  });

  it("forces global target when no active scope can own an override", () => {
    const eff = resolveEffective(def, settings(), null);

    expect(settingCanTargetScope(eff, null)).toBe(false);
    expect(effectiveSettingsEditTarget(eff, null, "scope")).toBe("global");
  });
});

describe("app-consumed settings", () => {
  it("resolves reduce motion through the schema-declared setting", () => {
    expect(
      resolveReduceMotionSetting(
        { settings: [reduceMotionDef], groups: ["appearance"], tiers: {} },
        settings({ reduce_motion: "true" }),
      ),
    ).toBe(true);
  });

  it("falls back to not reducing motion when the setting is unavailable", () => {
    expect(resolveReduceMotionSetting(undefined, undefined)).toBe(false);
    expect(
      resolveReduceMotionSetting(
        { settings: [reduceMotionDef], groups: ["appearance"], tiers: {} },
        settings(),
      ),
    ).toBe(false);
  });
});

describe("global language preference", () => {
  const languageDef: SettingDef = {
    key: "language",
    value_type: { type: "enum", members: ["system", "en"] },
    default: "system",
    scope_eligible: false,
    control: "segmented",
    display: {
      id: "appearance.language",
      group: "appearance",
      enum_members: [
        { value: "system", id: "language.system" },
        { value: "en", id: "language.english" },
      ],
    },
    order: 4,
  };
  const schema = {
    settings: [languageDef],
    groups: ["appearance"],
    tiers: {},
  } satisfies SettingsSchema;

  it("resolves exact global identity and ignores scoped rows", () => {
    expect(resolveLanguagePreference(schema, undefined)).toBeNull();
    expect(resolveLanguagePreference(schema, settings())).toBe("system");
    expect(resolveLanguagePreference(schema, settings({ language: "en" }))).toBe("en");
    expect(
      resolveLanguagePreference(
        schema,
        settings({ language: "en" }, { "scope-a": { language: "system" } }),
      ),
    ).toBe("en");
  });

  it("fails closed for unavailable, malformed, or unsupported identity", () => {
    expect(resolveLanguagePreference(undefined, undefined)).toBeNull();
    expect(resolveLanguagePreference(undefined, settings())).toBeNull();
    expect(resolveLanguagePreference(schema, settings({ language: "fr" }))).toBe("en");
    expect(resolveLanguagePreference(schema, settings({ language: " en " }))).toBe(
      "en",
    );
    expect(
      resolveLanguagePreference({ settings: [], groups: [], tiers: {} }, settings()),
    ).toBe("en");
    expect(
      resolveLanguagePreference(
        {
          settings: [{ ...languageDef, scope_eligible: true }],
          groups: ["appearance"],
          tiers: {},
        },
        settings({ language: "en" }),
      ),
    ).toBe("en");
  });
});

describe("keybinding override decode", () => {
  it("parses a well-formed sparse override map", () => {
    expect(
      parseKeybindingOverrides('{" command.palette ":" Mod+P ","help.legend":"F1"}'),
    ).toEqual({ "command.palette": "Mod+P", "help.legend": "F1" });
  });

  it("returns {} for corrupt JSON", () => {
    expect(parseKeybindingOverrides("{not json")).toEqual({});
    expect(parseKeybindingOverrides("")).toEqual({});
    expect(parseKeybindingOverrides(undefined)).toEqual({});
  });

  it("returns {} for a non-object payload (array or scalar)", () => {
    expect(parseKeybindingOverrides("[1,2,3]")).toEqual({});
    expect(parseKeybindingOverrides('"Mod+K"')).toEqual({});
    expect(parseKeybindingOverrides("42")).toEqual({});
    expect(parseKeybindingOverrides("null")).toEqual({});
  });

  it("drops non-string and empty entries defensively", () => {
    expect(
      parseKeybindingOverrides(
        '{"a":"Mod+A","b":42,"c":null,"d":"","e":{"x":1},"f":"Shift+F"}',
      ),
    ).toEqual({ a: "Mod+A", f: "Shift+F" });
  });

  it("drops an over-length chord value (M3 mirror of the engine byte cap)", () => {
    const huge = "x".repeat(65);
    expect(parseKeybindingOverrides(`{"a":"Mod+A","big":"${huge}"}`)).toEqual({
      a: "Mod+A",
    });
  });

  it("resolves the effective override map through the served schema", () => {
    const keybindingsDef: SettingDef = {
      key: "keybindings",
      value_type: { type: "keybindings", max_entries: 256 },
      default: "{}",
      scope_eligible: false,
      control: "keybinding",
      display: {
        id: "keybindings.shortcuts",
        group: "keybindings",
        enum_members: [],
      },
      order: 1,
    };
    const schema = {
      settings: [keybindingsDef],
      groups: ["keybindings"],
      tiers: {},
    } satisfies SettingsSchema;

    expect(
      resolveKeybindingOverrides(schema, settings({ keybindings: '{"x":"Mod+X"}' })),
    ).toEqual({ x: "Mod+X" });
    // Absent value -> the schema default "{}" -> empty map.
    expect(resolveKeybindingOverrides(schema, settings())).toEqual({});
    // No schema at all -> empty map (keymap falls back to defaults).
    expect(resolveKeybindingOverrides(undefined, undefined)).toEqual({});
  });
});

describe("graph_controls override resolution", () => {
  const graphControlsDef: SettingDef = {
    key: "graph_controls",
    value_type: { type: "string", max_len: 4096 },
    default: "{}",
    scope_eligible: false,
    control: "text",
    display: { id: "graph.controls", group: "graph", enum_members: [] },
    order: 1,
  };
  const schema = {
    settings: [graphControlsDef],
    groups: ["graph"],
    tiers: {},
  } satisfies SettingsSchema;

  it("parses a JSON object string into a normalized map; {} on corrupt/non-object", () => {
    expect(
      parseGraphControlOverrides('{"charge":-250,"edgeColorMode":"solid"}'),
    ).toEqual({ charge: -250, edgeColorMode: "solid" });
    expect(parseGraphControlOverrides("not json")).toEqual({});
    expect(parseGraphControlOverrides(undefined)).toEqual({});
    expect(parseGraphControlOverrides("[1,2]")).toEqual({});
  });

  it("resolves the global graph_controls setting through the schema (null-scope)", () => {
    expect(
      resolveGraphControlOverrides(
        schema,
        settings({ graph_controls: '{"charge":-250}' }),
      ),
    ).toEqual({ charge: -250 });
    // Absent value -> schema default "{}" -> empty map.
    expect(resolveGraphControlOverrides(schema, settings())).toEqual({});
    // No schema -> empty map (graph falls back to schema defaults).
    expect(resolveGraphControlOverrides(undefined, undefined)).toEqual({});
  });

  it("ignores a scoped value (global-only setting)", () => {
    // scope_eligible:false + null-scope resolution -> a scoped row is never consulted.
    expect(
      resolveGraphControlOverrides(
        schema,
        settings({}, { "scope-a": { graph_controls: '{"charge":-400}' } }),
      ),
    ).toEqual({});
  });
});
