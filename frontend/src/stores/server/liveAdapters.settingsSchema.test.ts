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

import { beforeAll, describe, expect, it } from "vitest";

import { THEMES } from "../../platform/theme/themeController";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { EngineError } from "./engine";
import type { SettingsSchema, SettingsState } from "./engine";
import { adaptSettingsSchema } from "./liveAdapters";
import {
  CONSUMED_SETTING_KEYS,
  resolveEffective,
  resolveEffectiveSetting,
  resolveSettings,
  settingDefByKey,
} from "./settingsSelectors";

let schema: SettingsSchema;
let scope: string;

beforeAll(async () => {
  schema = await createLiveClient().settingsSchema();
  scope = await liveScope();
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
    expect(schema.groups).toEqual(expect.arrayContaining(["Appearance", "Graph"]));
    // The tiers block rides through but is never read by chrome.
    expect(schema.tiers).toBeTypeOf("object");
  });

  it("decodes the integer/slider value_type (adapter coverage for future settings)", () => {
    // A pure-function vector: the adapter must decode integer + slider + step/unit
    // when such a setting lands, independent of today's registry.
    const decoded = adaptSettingsSchema({
      settings: [
        {
          key: "synthetic_scale",
          value_type: { type: "integer", min: 50, max: 200 },
          default: "100",
          scope_eligible: true,
          control: "slider",
          label: "Scale",
          description: "",
          group: "Graph",
          order: 9,
          step: 10,
          unit: "%",
        },
      ],
      groups: ["Graph"],
      tiers: {},
    });
    const s = decoded.settings[0];
    expect(s.value_type).toEqual({ type: "integer", min: 50, max: 200 });
    expect(s.control).toBe("slider");
    expect(s.step).toBe(10);
    expect(s.unit).toBe("%");
  });

  it("normalizes schema metadata at the adapter boundary", () => {
    const decoded = adaptSettingsSchema({
      settings: [
        {
          key: "  theme  ",
          value_type: {
            type: "enum",
            members: [" system ", "system", "", " dark ", 42],
          },
          default: "system",
          scope_eligible: false,
          control: " segmented ",
          label: " Theme ",
          description: " Color mode ",
          group: " Appearance ",
          order: 1,
          unit: " px ",
          placeholder: " Choose ",
        },
        {
          key: "   ",
          value_type: { type: "string" },
        },
      ],
      groups: [" Appearance ", "Appearance", "", 7, " Graph "],
      tiers: {},
    });

    expect(decoded.groups).toEqual(["Appearance", "Graph"]);
    expect(decoded.settings).toHaveLength(1);
    expect(decoded.settings[0]).toEqual(
      expect.objectContaining({
        key: "theme",
        value_type: { type: "enum", members: ["system", "dark"] },
        control: "segmented",
        label: "Theme",
        description: "Color mode",
        group: "Appearance",
        unit: "px",
        placeholder: "Choose",
      }),
    );
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
    expect(degraded.settings).toHaveLength(1);
    expect(degraded.settings[0].control).toBe("text");
    expect(degraded.settings[0].value_type).toEqual({ type: "string", max_len: 4096 });
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
    expect(groups.map((g) => g.name)).toEqual(
      expect.arrayContaining(["Appearance", "Graph"]),
    );
    const appearance = groups.find((g) => g.name === "Appearance")!;
    expect(appearance.settings.map((s) => s.def.key).slice(0, 2)).toEqual([
      CONSUMED_SETTING_KEYS.theme,
      CONSUMED_SETTING_KEYS.reduceMotion,
    ]);
  });
});
