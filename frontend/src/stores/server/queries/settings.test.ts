// @vitest-environment happy-dom
// Split from queries.test.ts (module-decomposition mandate, 2026-07-12).

import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import { engineClient, type SettingsSchema, type SettingsState } from "../engine";
import {
  deriveSettingsDialogView,
  deriveSettingsEffectsView,
  deriveThemeSettingView,
} from "./index";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("deriveSettingsDialogView (schema-driven settings dialog)", () => {
  const schema: SettingsSchema = {
    groups: ["Appearance"],
    settings: [
      {
        key: "theme",
        value_type: { type: "enum", members: ["system", "dark"] },
        default: "system",
        scope_eligible: false,
        control: "segmented",
        label: "Theme",
        description: "Dashboard color mode",
        group: "Appearance",
        order: 1,
      },
    ],
    tiers: { structural: { available: true } },
  };
  const settings: SettingsState = {
    global: { theme: "dark" },
    scoped: {},
    tiers: { structural: { available: true } },
  };

  it("resolves effective schema groups and loading state in the stores layer", () => {
    const view = deriveSettingsDialogView(schema, settings, null, false);

    expect(view.loading).toBe(false);
    expect(view.schemaLoading).toBe(false);
    expect(view.settingsLoading).toBe(false);
    expect(view).toMatchObject({
      title: "Settings",
      description: "Preferences are saved to this workspace. Some apply per scope.",
      loadingMessage: "Loading settings…",
      emptyMessage: "No settings are available.",
      cancelLabel: "Cancel",
      doneLabel: "Done",
    });
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ name: "Appearance" });
    expect(view.groups[0]!.settings[0]).toMatchObject({
      value: "dark",
      provenance: "global",
    });
  });

  it("keeps the dialog empty while the schema is not served yet", () => {
    expect(deriveSettingsDialogView(undefined, undefined, null, true)).toMatchObject({
      loading: true,
      schemaLoading: true,
      settingsLoading: false,
      groups: [],
      loadingMessage: "Loading settings…",
      emptyMessage: "No settings are available.",
    });
  });

  it("keeps the dialog empty while persisted settings are still loading", () => {
    expect(
      deriveSettingsDialogView(schema, undefined, null, false, true),
    ).toMatchObject({
      loading: true,
      schemaLoading: false,
      settingsLoading: true,
      groups: [],
      loadingMessage: "Loading settings…",
      emptyMessage: "No settings are available.",
    });
  });
});

describe("deriveThemeSettingView (platform theme bridge)", () => {
  const schema: SettingsSchema = {
    groups: ["Appearance"],
    settings: [
      {
        key: "theme",
        value_type: { type: "enum", members: ["system", "light", "dark"] },
        default: "system",
        scope_eligible: false,
        control: "segmented",
        label: "Theme",
        description: "Dashboard color mode",
        group: "Appearance",
        order: 1,
      },
    ],
    tiers: {},
  };

  it("resolves the authoritative theme and allowed members in the stores layer", () => {
    expect(
      deriveThemeSettingView(schema, {
        global: { theme: "dark" },
        scoped: {},
        tiers: {},
      }),
    ).toEqual({
      loading: false,
      serverTheme: "dark",
      themeMembers: ["system", "light", "dark"],
    });
  });

  it("does not expose a schema-default theme while persisted settings are loading", () => {
    expect(deriveThemeSettingView(schema, undefined, false, true)).toEqual({
      loading: true,
      serverTheme: undefined,
      themeMembers: [],
    });
  });
});

describe("deriveSettingsEffectsView (settings side effects)", () => {
  const schema: SettingsSchema = {
    groups: ["Appearance", "Graph"],
    settings: [
      {
        key: "reduce_motion",
        value_type: { type: "bool" },
        default: "false",
        scope_eligible: false,
        control: "switch",
        label: "Reduce motion",
        description: "Reduce animated transitions",
        group: "Appearance",
        order: 1,
      },
      {
        key: "default_granularity",
        value_type: { type: "enum", members: ["feature", "document"] },
        default: "document",
        scope_eligible: true,
        control: "segmented",
        label: "Default granularity",
        description: "The graph detail level on load",
        group: "Graph",
        order: 1,
      },
      {
        key: "confidence_floor",
        value_type: { type: "integer", min: 0, max: 100 },
        default: "0",
        scope_eligible: false,
        control: "slider",
        label: "Confidence floor",
        description: "Minimum inferred edge confidence",
        group: "Graph",
        order: 2,
      },
      {
        key: "label_filter",
        value_type: { type: "string", max_len: 120 },
        default: "",
        scope_eligible: false,
        control: "text",
        label: "Label filter",
        description: "Initial graph text filter",
        group: "Graph",
        order: 3,
      },
    ],
    tiers: {},
  };

  it("resolves document effects and graph defaults in the stores layer", () => {
    expect(
      deriveSettingsEffectsView(
        schema,
        {
          global: {
            reduce_motion: "true",
            confidence_floor: "60",
            label_filter: "adr",
          },
          scoped: { "scope-a": { default_granularity: "feature" } },
          tiers: {},
        },
        "scope-a",
      ),
    ).toEqual({
      loading: false,
      reduceMotion: true,
      graphDefaults: {
        defaultGranularity: "feature",
        corpus: "vault",
        confidenceFloor: 60,
        labelFilter: "adr",
      },
    });
  });

  it("normalizes runtime settings scope before resolving scoped graph defaults", () => {
    const settings: SettingsState = {
      global: {
        default_granularity: "document",
        confidence_floor: "60",
        label_filter: "adr",
      },
      scoped: { "scope-a": { default_granularity: "feature" } },
      tiers: {},
    };

    expect(deriveSettingsEffectsView(schema, settings, " scope-a ")).toMatchObject({
      graphDefaults: {
        defaultGranularity: "feature",
        confidenceFloor: 60,
        labelFilter: "adr",
      },
    });
    expect(
      deriveSettingsEffectsView(schema, settings, { scope: "scope-a" }).graphDefaults,
    ).toMatchObject({
      defaultGranularity: "document",
      confidenceFloor: 60,
      labelFilter: "adr",
    });
  });

  it("keeps effects inert while persisted settings are still loading", () => {
    expect(
      deriveSettingsEffectsView(schema, undefined, "scope-a", false, true),
    ).toEqual({
      loading: true,
      reduceMotion: false,
      graphDefaults: null,
    });
  });
});
