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
    groups: ["appearance"],
    settings: [
      {
        key: "theme",
        value_type: { type: "enum", members: ["system", "dark"] },
        default: "system",
        scope_eligible: false,
        control: "segmented",
        display: {
          id: "appearance.theme",
          group: "appearance",
          enum_members: [
            { value: "system", id: "theme.system" },
            { value: "dark", id: "theme.dark" },
          ],
        },
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
      title: { key: "common:finalWave.settings.title" },
      description: { key: "common:finalWave.settings.description" },
      loadingMessage: { key: "common:finalWave.settings.loading" },
      emptyMessage: { key: "common:finalWave.settings.empty" },
      cancelLabel: { key: "common:finalWave.settings.cancel" },
      doneLabel: { key: "common:finalWave.settings.done" },
    });
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]).toMatchObject({ id: "appearance" });
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
      loadingMessage: { key: "common:finalWave.settings.loading" },
      emptyMessage: { key: "common:finalWave.settings.empty" },
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
      loadingMessage: { key: "common:finalWave.settings.loading" },
      emptyMessage: { key: "common:finalWave.settings.empty" },
    });
  });
});

describe("deriveThemeSettingView (platform theme bridge)", () => {
  const schema: SettingsSchema = {
    groups: ["appearance"],
    settings: [
      {
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
    groups: ["appearance", "graph"],
    settings: [
      {
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
        order: 1,
      },
      {
        key: "default_granularity",
        value_type: { type: "enum", members: ["feature", "document"] },
        default: "document",
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
      },
      {
        key: "confidence_floor",
        value_type: { type: "integer", min: 0, max: 100 },
        default: "0",
        scope_eligible: false,
        control: "slider",
        display: { id: "graph.confidenceFloor", group: "graph", enum_members: [] },
        order: 2,
      },
      {
        key: "label_filter",
        value_type: { type: "string", max_len: 120 },
        default: "",
        scope_eligible: false,
        control: "text",
        display: { id: "graph.labelFilter", group: "graph", enum_members: [] },
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
      languagePreference: "en",
      languagePreferenceCacheable: false,
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
      languagePreference: null,
      languagePreferenceCacheable: false,
      graphDefaults: null,
    });
  });

  it("exposes settled language authority separately from fallback", () => {
    const languageSchema: SettingsSchema = {
      ...schema,
      settings: [
        ...schema.settings,
        {
          key: "language",
          value_type: { type: "enum", members: ["en"] },
          default: "en",
          scope_eligible: false,
          control: "segmented",
          display: {
            id: "appearance.language",
            group: "appearance",
            enum_members: [{ value: "en", id: "language.english" }],
          },
          order: 4,
        },
      ],
    };

    expect(
      deriveSettingsEffectsView(
        languageSchema,
        { global: { language: "en" }, scoped: {}, tiers: {} },
        null,
      ),
    ).toMatchObject({
      loading: false,
      languagePreference: "en",
      languagePreferenceCacheable: true,
    });
    expect(
      deriveSettingsEffectsView(
        languageSchema,
        { global: { language: "fr" }, scoped: {}, tiers: {} },
        null,
      ),
    ).toMatchObject({
      languagePreference: "en",
      languagePreferenceCacheable: false,
    });
  });
});
