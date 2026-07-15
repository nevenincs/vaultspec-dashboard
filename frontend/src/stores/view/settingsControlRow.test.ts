import { describe, expect, it } from "vitest";

import type { EffectiveSetting } from "../server/settingsSelectors";
import {
  deriveSettingsEditTargetToggleView,
  deriveSettingsRowStaticView,
  normalizeSettingsRowCommitValue,
  SETTINGS_EDIT_TARGET_OPTIONS,
} from "./settingsControlRow";

function setting(patch: Partial<EffectiveSetting> = {}): EffectiveSetting {
  return {
    def: {
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
    },
    value: "document",
    provenance: "scope",
    globalValue: "feature",
    scopeValue: "document",
    ...patch,
  };
}

describe("settings row controller read model", () => {
  it("declares the edit-target option domain once for settings rows", () => {
    expect(SETTINGS_EDIT_TARGET_OPTIONS).toEqual([
      { id: "global", label: "Global" },
      { id: "scope", label: "This scope" },
    ]);
  });

  it("projects scope-target controls and reset affordances from one seam", () => {
    expect(deriveSettingsRowStaticView(setting(), "scope-a", "scope")).toEqual(
      expect.objectContaining({
        fieldId: "setting-default_granularity",
        scopeable: true,
        effectiveTarget: "scope",
        controlValue: "document",
        continuous: false,
        isDefaulted: false,
        provenanceNote: "Overridden for this scope.",
        canMatchGlobal: true,
        canResetDefault: false,
        matchGlobalValue: "feature",
        defaultValue: "feature",
        resetAction: {
          kind: "match-global",
          label: "Match global",
          value: "feature",
        },
        rootClassName: "flex flex-col gap-fg-1",
        headerClassName: "flex items-start justify-between gap-fg-3",
        labelClassName: "min-w-0 flex-1",
        titleClassName: "block text-body text-ink",
        descriptionClassName: "mt-fg-0-5 block text-label text-ink-faint",
        controlStackClassName: "flex shrink-0 flex-col items-end gap-fg-1",
        footerClassName: "flex items-center justify-between gap-fg-2",
        provenanceClassName: "text-caption text-ink-faint",
        resetButtonClassName:
          "text-caption underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus text-accent-text",
        errorClassName: "text-caption text-diff-remove",
      }),
    );
  });

  it("forces global targeting when no active scope can receive the setting", () => {
    expect(
      deriveSettingsRowStaticView(
        setting({
          value: "feature",
          provenance: "global",
          scopeValue: undefined,
        }),
        null,
        "scope",
      ),
    ).toEqual(
      expect.objectContaining({
        scopeable: false,
        effectiveTarget: "global",
        controlValue: "feature",
        canMatchGlobal: false,
        canResetDefault: false,
        provenanceNote: "Using the global value.",
        resetAction: null,
      }),
    );
    expect(
      deriveSettingsRowStaticView(setting(), { scope: "scope-a" }, "scope"),
    ).toEqual(
      expect.objectContaining({
        scopeable: false,
        effectiveTarget: "global",
        controlValue: "feature",
        canMatchGlobal: false,
      }),
    );
  });

  it("marks continuous controls for draft/debounced write handling", () => {
    expect(
      deriveSettingsRowStaticView(
        setting({
          def: {
            ...setting().def,
            key: "label_filter",
            value_type: { type: "string", max_len: 200 },
            control: "text",
            default: "",
            display: { id: "graph.labelFilter", group: "graph", enum_members: [] },
          },
          value: "semantic",
          provenance: "global",
          globalValue: "semantic",
          scopeValue: undefined,
        }),
        "scope-a",
        "global",
      ),
    ).toEqual(
      expect.objectContaining({
        fieldId: "setting-label_filter",
        continuous: true,
        controlValue: "semantic",
        controlMaxLength: 200,
        canResetDefault: true,
        defaultValue: "",
        resetAction: {
          kind: "reset-default",
          label: "Reset to default",
          value: "",
        },
        resetButtonClassName:
          "text-caption underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus text-ink-faint hover:text-ink-muted",
      }),
    );
  });

  it("normalizes row commit values through the schema max length", () => {
    const view = deriveSettingsRowStaticView(
      setting({
        def: {
          ...setting().def,
          key: "label_filter",
          value_type: { type: "string", max_len: 4 },
          control: "text",
          default: "",
          display: { id: "graph.labelFilter", group: "graph", enum_members: [] },
        },
        value: "semantic",
        provenance: "global",
        globalValue: "semantic",
        scopeValue: undefined,
      }),
      "scope-a",
      "global",
    );

    expect(normalizeSettingsRowCommitValue("meaning", view)).toBe("mean");
    expect(normalizeSettingsRowCommitValue(42, view)).toBe("");
  });

  it("projects scope-target toggle rows and active classes from one seam", () => {
    expect(deriveSettingsEditTargetToggleView("scope")).toEqual({
      rootClassName: "flex gap-fg-0-5 text-caption",
      ariaLabel: "apply to",
      rows: [
        {
          id: "global",
          label: "Global",
          checked: false,
          className:
            "rounded-fg-xs px-fg-1 py-fg-0-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus text-ink-faint hover:text-ink-muted",
        },
        {
          id: "scope",
          label: "This scope",
          checked: true,
          className:
            "rounded-fg-xs px-fg-1 py-fg-0-5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus font-medium text-accent-text",
        },
      ],
    });
  });
});
