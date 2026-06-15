// Mock-versus-live PARITY proof for the settings SCHEMA surface
// (dashboard-settings W02.P05.S14). A sample CAPTURED from the live
// `vaultspec serve` GET /settings/schema route (the exact `{data, tiers}` shape
// conformance.rs asserts engine-side) is fed through the SAME tolerant adapter
// the app uses, and must reconcile onto the internal schema shape. Then the
// MockEngine is driven through that same client path and must serve a
// byte-equivalent schema — the mock-mirrors-live-wire-shape deliverable. Typed
// validation parity (the error_kind on a rejected PUT) and the effective-value
// selector are pinned too.

import { describe, expect, it } from "vitest";

import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
import { EngineClient, EngineError } from "./engine";
import type { SettingsSchema, SettingsState } from "./engine";
import { adaptSettingsSchema, unwrapEnvelope } from "./liveAdapters";
import { resolveEffective, resolveSettings } from "./settingsSelectors";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: false, reason: "rag service down" },
};

// Captured verbatim from `vaultspec serve` GET /settings/schema — the exact
// `{data: {settings, groups}, tiers}` envelope, snake_case throughout, with the
// `value_type` tagged union. (Trimmed to representative entries of each kind.)
const liveSchemaEnvelope = {
  data: {
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
        description:
          "Color theme for the dashboard. System follows your OS appearance.",
        group: "Appearance",
        order: 1,
      },
      {
        key: "reduce_motion",
        value_type: { type: "bool" },
        default: "false",
        scope_eligible: false,
        control: "switch",
        label: "Reduce motion",
        description: "Minimize animations and transitions across the dashboard.",
        group: "Appearance",
        order: 2,
      },
      {
        key: "node_label_scale",
        value_type: { type: "integer", min: 50, max: 200 },
        default: "100",
        scope_eligible: true,
        control: "slider",
        label: "Label size",
        description: "Relative size of node labels in the graph, as a percentage.",
        group: "Graph",
        order: 2,
        step: 10,
        unit: "%",
      },
    ],
    groups: ["Appearance", "Graph"],
  },
  tiers: TIERS,
};

describe("adaptSettingsSchema (live schema sample)", () => {
  it("unwraps the envelope and reconciles onto the internal schema shape", () => {
    const schema = adaptSettingsSchema(unwrapEnvelope(liveSchemaEnvelope));
    expect(schema.groups).toEqual(["Appearance", "Graph"]);
    expect(schema.settings.map((s) => s.key)).toEqual([
      "theme",
      "reduce_motion",
      "node_label_scale",
    ]);
    const theme = schema.settings.find((s) => s.key === "theme")!;
    expect(theme.value_type).toEqual({
      type: "enum",
      members: ["system", "light", "dark", "high-contrast"],
    });
    expect(theme.control).toBe("segmented");
    expect(theme.scope_eligible).toBe(false);
    const slider = schema.settings.find((s) => s.key === "node_label_scale")!;
    expect(slider.value_type).toEqual({ type: "integer", min: 50, max: 200 });
    expect(slider.step).toBe(10);
    expect(slider.unit).toBe("%");
    expect(slider.scope_eligible).toBe(true);
    // The tiers block rides through but is never read by chrome (degradation truth).
    expect(schema.tiers).toEqual(TIERS);
  });

  it("tolerates a sparse / malformed body without throwing (tolerant adapter)", () => {
    expect(adaptSettingsSchema(undefined)).toEqual({
      settings: [],
      groups: [],
      tiers: {},
    });
    expect(adaptSettingsSchema({})).toEqual({ settings: [], groups: [], tiers: {} });
    // An unknown control kind degrades to `text`; a malformed value_type degrades
    // to a permissive string; a def missing its key is dropped.
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

// --- mock parity through the real client path -----------------------------------

function clientOn(mock: MockEngine): EngineClient {
  const client = new EngineClient({ baseUrl: "" });
  client.useTransport(mock.fetchImpl);
  return client;
}

describe("MockEngine settings schema parity", () => {
  it("serves /settings/schema through the client adapter equal to the live shape", async () => {
    const client = clientOn(new MockEngine());
    const fromMock = await client.settingsSchema();
    const fromLive = adaptSettingsSchema(unwrapEnvelope(liveSchemaEnvelope));
    // The mock declares the full registry (a superset of the trimmed live sample);
    // every setting the live sample carries must be present and identical in the mock.
    for (const liveDef of fromLive.settings) {
      const mockDef = fromMock.settings.find((s) => s.key === liveDef.key);
      expect(mockDef).toEqual(liveDef);
    }
    expect(fromMock.groups).toEqual(["Appearance", "Graph"]);
  });

  it("validates PUT /settings with the same typed error kinds as live", async () => {
    const client = clientOn(new MockEngine());

    // unknown key
    await expect(client.putSettings({ key: "nope", value: "x" })).rejects.toMatchObject(
      {
        status: 400,
      },
    );
    const unknown = await client
      .putSettings({ key: "nope", value: "x" })
      .catch((e: unknown) => e as EngineError);
    expect((unknown as EngineError).errorKind).toBe("unknown_key");

    // out-of-enum value
    const badEnum = await client
      .putSettings({ key: "theme", value: "chartreuse" })
      .catch((e: unknown) => e as EngineError);
    expect((badEnum as EngineError).errorKind).toBe("invalid_value");

    // scope on a global-only setting
    const badScope = await client
      .putSettings({ scope: MOCK_SCOPE, key: "theme", value: "dark" })
      .catch((e: unknown) => e as EngineError);
    expect((badScope as EngineError).errorKind).toBe("scope_not_allowed");

    // integer is canonicalized; a valid scoped write round-trips under its scope
    const ok = await client.putSettings({
      scope: MOCK_SCOPE,
      key: "node_label_scale",
      value: "120",
    });
    expect(ok.scoped[MOCK_SCOPE]?.node_label_scale).toBe("120");
  });
});

// --- effective-value selector ---------------------------------------------------

describe("settings effective-value resolution", () => {
  const schema: SettingsSchema = adaptSettingsSchema(
    unwrapEnvelope(liveSchemaEnvelope),
  );
  const themeDef = schema.settings.find((s) => s.key === "theme")!;
  const sliderDef = schema.settings.find((s) => s.key === "node_label_scale")!;

  it("falls back to the schema default when nothing is persisted", () => {
    const eff = resolveEffective(themeDef, undefined, MOCK_SCOPE);
    expect(eff.value).toBe("system");
    expect(eff.provenance).toBe("default");
  });

  it("prefers the global value over the default", () => {
    const settings: SettingsState = {
      global: { theme: "dark" },
      scoped: {},
      tiers: {},
    };
    const eff = resolveEffective(themeDef, settings, MOCK_SCOPE);
    expect(eff.value).toBe("dark");
    expect(eff.provenance).toBe("global");
  });

  it("prefers a scope override over global for a scope-eligible setting", () => {
    const settings: SettingsState = {
      global: { node_label_scale: "100" },
      scoped: { [MOCK_SCOPE]: { node_label_scale: "150" } },
      tiers: {},
    };
    const eff = resolveEffective(sliderDef, settings, MOCK_SCOPE);
    expect(eff.value).toBe("150");
    expect(eff.provenance).toBe("scope");
    expect(eff.globalValue).toBe("100");
  });

  it("ignores a scope override for a global-only setting", () => {
    const settings: SettingsState = {
      global: { theme: "dark" },
      scoped: { [MOCK_SCOPE]: { theme: "light" } },
      tiers: {},
    };
    // theme is not scope_eligible, so the scoped row is not consulted.
    const eff = resolveEffective(themeDef, settings, MOCK_SCOPE);
    expect(eff.value).toBe("dark");
    expect(eff.provenance).toBe("global");
  });

  it("groups and orders settings per the engine-declared schema", () => {
    const groups = resolveSettings(schema, undefined, MOCK_SCOPE);
    expect(groups.map((g) => g.name)).toEqual(["Appearance", "Graph"]);
    expect(groups[0].settings.map((s) => s.def.key)).toEqual([
      "theme",
      "reduce_motion",
    ]);
  });
});
