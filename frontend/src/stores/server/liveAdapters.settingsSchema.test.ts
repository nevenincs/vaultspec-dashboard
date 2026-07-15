// Settings SCHEMA surface against the REAL engine (dashboard-settings
// W02.P05.S14). The live `vaultspec serve` GET /settings/schema envelope is fed
// through the SAME tolerant adapter the app uses and must reconcile onto the
// internal schema shape; the engine's typed PUT validation (the `error_kind` on
// a rejected write) is exercised against the live route. No mock, no captured
// shadow sample — the registry under test is whatever the engine actually
// ships. The adapter's pure-function behaviour (decoding a value_type it will
// meet later, tolerating a malformed body) and the effective-value selector are
// pinned with explicit test vectors — inputs to a pure function, not a faked
// engine.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { THEMES } from "../../platform/theme/themeController";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { EngineError } from "./engine";
import type { SettingDef, SettingsSchema, SettingsState } from "./engine";
import {
  adaptSettingsSchema,
  SETTING_DEFAULT_MAX_CHARS,
  SETTING_ENUM_MAX_MEMBERS,
  SETTING_NUMERIC_ABS_MAX,
  SETTING_ORDER_MAX,
  SETTING_SCHEMA_MAX_GROUPS,
  SETTING_SCHEMA_MAX_ITEMS,
  SETTING_VALUE_LIMIT_MAX,
} from "./liveAdapters";
import {
  CONSUMED_SETTING_KEYS,
  resolveEffective,
  resolveEffectiveSetting,
  resolveLanguagePreference,
  resolveSettings,
  settingDefByKey,
} from "./settingsSelectors";

let schema: SettingsSchema;
let scope: string;
// TIH-004 (write hygiene): the validation describe below performs a valid scoped
// `default_granularity` write against the shared engine; snapshot its pre-suite
// value and restore it at teardown so a later suite never inherits this write.
let settingsSnapshot: SettingsState;

beforeAll(async () => {
  const client = createLiveClient();
  schema = await client.settingsSchema();
  scope = await liveScope();
  settingsSnapshot = await client.settings();
});

afterAll(async () => {
  await createLiveClient()
    .putSettings({
      scope,
      key: CONSUMED_SETTING_KEYS.defaultGranularity,
      value:
        settingsSnapshot.scoped[scope]?.[CONSUMED_SETTING_KEYS.defaultGranularity] ??
        "feature",
    })
    .catch(() => undefined);
});

describe("settings schema (live engine GET /settings/schema)", () => {
  it("reconciles the live envelope onto the internal schema shape", () => {
    // The registry ships at least these declared settings; assert each is
    // present with the type/control the chrome renders. Robust to the engine
    // adding more settings (we check membership, not an exact list).
    const byKey = new Map(schema.settings.map((s) => [s.key, s]));

    const theme = byKey.get(CONSUMED_SETTING_KEYS.theme);
    expect(theme).toBeDefined();
    expect(theme!.value_type).toEqual({
      type: "enum",
      members: ["system", "light", "dark", "high-contrast"],
    });
    expect(theme!.control).toBe("segmented");
    expect(theme!.scope_eligible).toBe(false);
    expect(theme!.display).toEqual({
      id: "appearance.theme",
      group: "appearance",
      enum_members: [
        { value: "system", id: "theme.system" },
        { value: "light", id: "theme.light" },
        { value: "dark", id: "theme.dark" },
        { value: "high-contrast", id: "theme.highContrast" },
      ],
    });

    const language = byKey.get(CONSUMED_SETTING_KEYS.language);
    expect(language).toBeDefined();
    expect(language!.value_type).toEqual({
      type: "enum",
      members: ["system", "en"],
    });
    expect(language!.display.id).toBe("appearance.language");

    const granularity = byKey.get("default_granularity");
    expect(granularity).toBeDefined();
    expect(granularity!.value_type).toEqual({
      type: "enum",
      members: ["feature", "document"],
    });
    expect(granularity!.scope_eligible).toBe(true);

    const reduceMotion = byKey.get(CONSUMED_SETTING_KEYS.reduceMotion);
    expect(reduceMotion).toBeDefined();
    expect(reduceMotion!.value_type).toEqual({ type: "bool" });
    expect(reduceMotion!.control).toBe("switch");

    // Groups are engine-declared and include the two known groups.
    expect(schema.groups).toEqual(["appearance", "graph", "keybindings"]);
    // The tiers block rides through but is never read by chrome.
    expect(schema.tiers).toBeTypeOf("object");
  });

  it("decodes the declared integer slider contract", () => {
    const decoded = adaptSettingsSchema({
      settings: [
        {
          key: "confidence_floor",
          value_type: { type: "integer", min: 0, max: 100 },
          default: "0",
          scope_eligible: false,
          control: "slider",
          label: "Confidence floor",
          description: "Hide inferred edges below this certainty.",
          group: "Graph",
          order: 3,
          step: 1,
          unit: "%",
        },
      ],
      groups: ["Graph"],
      tiers: {},
    });
    const s = decoded.settings[0];
    expect(s.value_type).toEqual({ type: "integer", min: 0, max: 100 });
    expect(s.control).toBe("slider");
    expect(s.step).toBe(1);
    expect(s.unit).toBe("%");
  });

  it("maps known legacy metadata without retaining its English copy", () => {
    const decoded = adaptSettingsSchema({
      settings: [
        {
          key: "theme",
          value_type: {
            type: "enum",
            members: ["system", "light", "dark", "high-contrast"],
          },
          default: "system",
          scope_eligible: false,
          control: "segmented",
          label: "Theme",
          description: "The dashboard color theme.",
          group: "Appearance",
          order: 1,
        },
        {
          key: "   ",
          value_type: { type: "string" },
        },
      ],
      groups: ["Appearance", "Appearance", "", 7, "Graph"],
      tiers: {},
    });

    expect(decoded.groups).toEqual(["appearance", "graph"]);
    expect(decoded.settings).toHaveLength(1);
    expect(decoded.settings[0]).toEqual(
      expect.objectContaining({
        key: "theme",
        value_type: {
          type: "enum",
          members: ["system", "light", "dark", "high-contrast"],
        },
        control: "segmented",
        display: {
          id: "appearance.theme",
          group: "appearance",
          enum_members: [
            { value: "system", id: "theme.system" },
            { value: "light", id: "theme.light" },
            { value: "dark", id: "theme.dark" },
            { value: "high-contrast", id: "theme.highContrast" },
          ],
        },
        unit: undefined,
      }),
    );
    expect(decoded.settings[0]).not.toHaveProperty("label");
    expect(decoded.settings[0]).not.toHaveProperty("description");
    expect(decoded.settings[0]).not.toHaveProperty("placeholder");
  });

  it("fails closed for unknown or inexact semantic metadata", () => {
    const validTheme = {
      key: "theme",
      value_type: {
        type: "enum",
        members: ["system", "light", "dark", "high-contrast"],
      },
      default: "system",
      scope_eligible: false,
      control: "segmented",
      order: 1,
    };
    const decoded = adaptSettingsSchema({
      settings: [
        {
          ...validTheme,
          key: " theme ",
          display: {
            id: "appearance.theme",
            group: "appearance",
            enum_members: [],
          },
        },
        {
          ...validTheme,
          display: {
            id: " appearance.theme ",
            group: "appearance",
            enum_members: [],
          },
        },
        {
          ...validTheme,
          display: {
            id: "appearance.theme",
            group: "appearance",
            enum_members: [
              { value: "system", id: "theme.system" },
              { value: "light", id: "theme.light" },
              { value: "dark", id: "theme.dark" },
            ],
          },
        },
        {
          key: "future_setting",
          value_type: { type: "bool" },
          display: { id: "future.setting", group: "appearance" },
        },
      ],
      groups: [" appearance ", "appearance", "unknown"],
    });
    expect(decoded.settings).toEqual([]);
    expect(decoded.groups).toEqual(["appearance"]);
  });

  it("rejects mismatched controls and value types for every declared setting", () => {
    const hostile = schema.settings.flatMap((def) => [
      {
        ...def,
        control: def.control === "text" ? "switch" : "text",
      },
      {
        ...def,
        value_type:
          def.value_type.type === "bool"
            ? { type: "string", max_len: 200 }
            : { type: "bool" },
      },
    ]);

    const decoded = adaptSettingsSchema({
      settings: hostile,
      groups: schema.groups,
      tiers: {},
    });

    expect(decoded.settings).toEqual([]);

    const theme = schema.settings.find((def) => def.key === "theme")!;
    const graphControls = schema.settings.find((def) => def.key === "graph_controls")!;
    const sectionFolds = schema.settings.find(
      (def) => def.key === "right_rail_section_folds",
    )!;
    const mixed = adaptSettingsSchema({
      settings: [
        theme,
        { ...graphControls, control: "text" },
        {
          ...sectionFolds,
          value_type: { type: "string", max_len: 200 },
        },
      ],
      groups: schema.groups,
      tiers: {},
    });
    const dialogKeys = resolveSettings(mixed, undefined, scope).flatMap((group) =>
      group.settings.map((setting) => setting.def.key),
    );
    expect(dialogKeys).toEqual(["theme"]);
  });

  it("rejects missing or malformed scope eligibility for a global setting", () => {
    const theme = schema.settings.find((def) => def.key === "theme")!;
    const missingScope: Partial<SettingDef> = { ...theme };
    delete missingScope.scope_eligible;

    const decoded = adaptSettingsSchema({
      settings: [
        missingScope,
        { ...theme, scope_eligible: "false" },
        { ...theme, scope_eligible: null },
      ],
      groups: schema.groups,
      tiers: {},
    });

    expect(decoded.settings).toEqual([]);
  });

  it("caps raw schema arrays before looking for acceptable entries", () => {
    const theme = schema.settings.find((def) => def.key === "theme");
    expect(theme).toBeDefined();

    const settings: Array<SettingDef | null> = Array.from(
      { length: SETTING_SCHEMA_MAX_ITEMS },
      () => null,
    );
    settings.push(theme!);
    const groups = Array.from({ length: SETTING_SCHEMA_MAX_GROUPS }, () => "unknown");
    groups.push("appearance");

    const decoded = adaptSettingsSchema({ settings, groups, tiers: {} });
    expect(decoded.settings).toEqual([]);
    expect(decoded.groups).toEqual([]);

    const tooManyMembers = Array.from(
      { length: SETTING_ENUM_MAX_MEMBERS + 1 },
      (_, index) => `member-${index}`,
    );
    const enumDecoded = adaptSettingsSchema({
      settings: [
        {
          ...theme!,
          value_type: { type: "enum", members: tooManyMembers },
        },
      ],
      groups: ["appearance"],
    });
    expect(enumDecoded.settings).toEqual([]);
  });

  it("rejects retained metadata outside scalar resource bounds", () => {
    const byKey = new Map(schema.settings.map((def) => [def.key, def]));
    const theme = byKey.get("theme")!;
    const confidence = byKey.get("confidence_floor")!;
    const label = byKey.get("label_filter")!;
    const graphControls = byKey.get("graph_controls")!;

    const decoded = adaptSettingsSchema({
      settings: [
        { ...theme, default: "x".repeat(SETTING_DEFAULT_MAX_CHARS + 1) },
        { ...theme, order: SETTING_ORDER_MAX + 1 },
        {
          ...confidence,
          value_type: {
            type: "integer",
            min: -SETTING_NUMERIC_ABS_MAX - 1,
            max: 100,
          },
        },
        { ...confidence, step: SETTING_NUMERIC_ABS_MAX + 1 },
        { ...confidence, unit: "x".repeat(65) },
        {
          ...label,
          value_type: { type: "string", max_len: SETTING_VALUE_LIMIT_MAX + 1 },
        },
        {
          ...graphControls,
          value_type: {
            type: "graph_controls",
            max_entries: SETTING_VALUE_LIMIT_MAX + 1,
          },
        },
      ],
      groups: schema.groups,
    });

    expect(decoded.settings).toEqual([]);
  });

  it("tolerates a sparse / malformed body without throwing (tolerant adapter)", () => {
    expect(adaptSettingsSchema(undefined)).toEqual({
      settings: [],
      groups: [],
      tiers: {},
    });
    expect(adaptSettingsSchema({})).toEqual({ settings: [], groups: [], tiers: {} });
    const degraded = adaptSettingsSchema({
      settings: [
        { key: "x", control: "dial", value_type: { type: "weird" } },
        { not_a_key: true },
      ],
      groups: ["G"],
    });
    expect(degraded.settings).toEqual([]);
    expect(degraded.groups).toEqual([]);
  });
});

// --- typed validation against the live PUT /settings route ----------------------

describe("settings validation (live engine typed error_kind)", () => {
  it("rejects an unknown key with error_kind unknown_key", async () => {
    const err = await createLiveClient()
      .putSettings({ key: "not_a_real_setting_xyz", value: "x" })
      .then(() => null)
      .catch((e: unknown) => e as EngineError);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).status).toBe(400);
    expect((err as EngineError).errorKind).toBe("unknown_key");
  });

  it("rejects an out-of-enum value with error_kind invalid_value", async () => {
    const err = await createLiveClient()
      .putSettings({ key: "theme", value: "chartreuse" })
      .then(() => null)
      .catch((e: unknown) => e as EngineError);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).errorKind).toBe("invalid_value");
  });

  it("rejects a scope on a global-only setting with error_kind scope_not_allowed", async () => {
    const err = await createLiveClient()
      .putSettings({ scope, key: "theme", value: "dark" })
      .then(() => null)
      .catch((e: unknown) => e as EngineError);
    expect(err).toBeInstanceOf(EngineError);
    expect((err as EngineError).errorKind).toBe("scope_not_allowed");
  });

  it("a valid scoped write round-trips under its scope", async () => {
    const ok = await createLiveClient().putSettings({
      scope,
      key: "default_granularity",
      value: "document",
    });
    expect(ok.scoped[scope]?.default_granularity).toBe("document");
  });
});

// --- effective-value selector (pure logic over the live-declared schema) --------

describe("settings effective-value resolution", () => {
  it("declares every app-consumed key in the live engine schema", () => {
    for (const key of Object.values(CONSUMED_SETTING_KEYS)) {
      expect(settingDefByKey(schema, key), key).toBeDefined();
    }
  });

  it("keeps the engine theme enum aligned with the platform theme preferences", () => {
    const theme = settingDefByKey(schema, CONSUMED_SETTING_KEYS.theme);
    expect(theme?.value_type).toEqual({
      type: "enum",
      members: ["system", ...THEMES],
    });
  });

  it("resolves the global raw language preference and rejects scoped history", () => {
    expect(resolveLanguagePreference(schema, undefined)).toBeNull();
    expect(
      resolveLanguagePreference(schema, { global: {}, scoped: {}, tiers: {} }),
    ).toBe("system");
    expect(
      resolveLanguagePreference(schema, {
        global: { language: "en" },
        scoped: { [scope]: { language: "system" } },
        tiers: {},
      }),
    ).toBe("en");
    expect(
      resolveLanguagePreference(schema, {
        global: { language: "fr" },
        scoped: {},
        tiers: {},
      }),
    ).toBe("en");
  });

  it("resolves app-consumed settings by key through the served schema", () => {
    const eff = resolveEffectiveSetting(
      schema,
      {
        global: { [CONSUMED_SETTING_KEYS.reduceMotion]: "true" },
        scoped: {},
        tiers: {},
      },
      scope,
      CONSUMED_SETTING_KEYS.reduceMotion,
    );
    expect(eff?.value).toBe("true");
    expect(eff?.def.key).toBe(CONSUMED_SETTING_KEYS.reduceMotion);
  });

  it("falls back to the schema default when nothing is persisted", () => {
    const themeDef = schema.settings.find(
      (s) => s.key === CONSUMED_SETTING_KEYS.theme,
    )!;
    const eff = resolveEffective(themeDef, undefined, scope);
    expect(eff.value).toBe(themeDef.default);
    expect(eff.provenance).toBe("default");
  });

  it("prefers the global value over the default", () => {
    const themeDef = schema.settings.find(
      (s) => s.key === CONSUMED_SETTING_KEYS.theme,
    )!;
    const settings: SettingsState = {
      global: { [CONSUMED_SETTING_KEYS.theme]: "dark" },
      scoped: {},
      tiers: {},
    };
    const eff = resolveEffective(themeDef, settings, scope);
    expect(eff.value).toBe("dark");
    expect(eff.provenance).toBe("global");
  });

  it("prefers a scope override over global for a scope-eligible setting", () => {
    const scopedDef = schema.settings.find((s) => s.key === "default_granularity")!;
    const settings: SettingsState = {
      global: { default_granularity: "feature" },
      scoped: { [scope]: { default_granularity: "document" } },
      tiers: {},
    };
    const eff = resolveEffective(scopedDef, settings, scope);
    expect(eff.value).toBe("document");
    expect(eff.provenance).toBe("scope");
    expect(eff.globalValue).toBe("feature");
  });

  it("ignores a scope override for a global-only setting", () => {
    const themeDef = schema.settings.find(
      (s) => s.key === CONSUMED_SETTING_KEYS.theme,
    )!;
    const settings: SettingsState = {
      global: { [CONSUMED_SETTING_KEYS.theme]: "dark" },
      scoped: { [scope]: { [CONSUMED_SETTING_KEYS.theme]: "light" } },
      tiers: {},
    };
    const eff = resolveEffective(themeDef, settings, scope);
    expect(eff.value).toBe("dark");
    expect(eff.provenance).toBe("global");
  });

  it("groups and orders settings per the engine-declared schema", () => {
    const groups = resolveSettings(schema, undefined, scope);
    // Appearance precedes Graph; theme + reduce_motion lead the Appearance group.
    expect(groups.map((g) => g.id)).toEqual(
      expect.arrayContaining(["appearance", "graph"]),
    );
    const appearance = groups.find((g) => g.id === "appearance")!;
    expect(appearance.settings.map((s) => s.def.key).slice(0, 2)).toEqual([
      CONSUMED_SETTING_KEYS.theme,
      CONSUMED_SETTING_KEYS.reduceMotion,
    ]);
  });
});
