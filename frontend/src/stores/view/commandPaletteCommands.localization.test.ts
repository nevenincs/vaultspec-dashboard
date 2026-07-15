import { describe, expect, it } from "vitest";

import type { ActionPresentation } from "../../platform/actions/action";
import { resolveActionPresentation } from "../../platform/actions/action";
import { resolveMessageResult } from "../../platform/localization/fallback";
import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import {
  buildEditorCommands,
  buildGraphCommands,
  buildSettingsCommands,
  buildTimelineCommands,
  buildWindowCommands,
  type WindowCommandSources,
} from "./commandPaletteCommands";

function windowSources(
  state: Pick<
    WindowCommandSources,
    | "leftRailVisible"
    | "leftCollapsed"
    | "rightCollapsed"
    | "timelineVisible"
    | "graphVisible"
  >,
): WindowCommandSources {
  return {
    ...state,
    toggleLeftRail: () => undefined,
    toggleLeftCollapsed: () => undefined,
    toggleRightRail: () => undefined,
    toggleTimeline: () => undefined,
    toggleGraph: () => undefined,
    setRightTab: () => undefined,
    resetLayout: () => undefined,
    showKeyboardShortcuts: () => undefined,
  };
}

function migratedPresentations(): readonly ActionPresentation[] {
  const shownWindow = buildWindowCommands(
    windowSources({
      leftRailVisible: true,
      leftCollapsed: false,
      rightCollapsed: false,
      timelineVisible: true,
      graphVisible: true,
    }),
  );
  const hiddenWindow = buildWindowCommands(
    windowSources({
      leftRailVisible: true,
      leftCollapsed: true,
      rightCollapsed: true,
      timelineVisible: false,
      graphVisible: true,
    }),
  );
  const windowIds = new Set([
    "window:left-rail",
    "window:left-collapse",
    "window:timeline",
    "window:reset-layout",
  ]);
  const editor = buildEditorCommands({
    closeDoc: () => undefined,
    closeAllDocs: () => undefined,
    reloadDoc: () => undefined,
    keepOpen: () => undefined,
    toggleDiff: () => undefined,
  }).slice(0, 4);

  return [
    ...shownWindow.filter(({ id }) => windowIds.has(id)).map(({ label }) => label),
    ...hiddenWindow
      .filter(({ id }) => id !== "window:reset-layout" && windowIds.has(id))
      .map(({ label }) => label),
    ...buildTimelineCommands({
      setRangeDays: () => undefined,
      clearDateRange: () => undefined,
    }).map(({ label }) => label),
    ...editor.map(({ label }) => label),
    ...buildGraphCommands({
      frozen: false,
      setFrozen: () => undefined,
      resetDefaults: () => undefined,
    }).map(({ label }) => label),
    buildGraphCommands({
      frozen: true,
      setFrozen: () => undefined,
      resetDefaults: () => undefined,
    }).find(({ id }) => id === "graph:toggle-freeze")!.label,
    ...buildSettingsCommands(() => undefined).map(({ label }) => label),
  ];
}

describe("localized command-palette builders", () => {
  it("resolves every migrated command through genuine English, French, and Arabic resources", () => {
    const presentations = migratedPresentations();
    const runtimes = [
      createTestLocalizationRuntime(),
      createTestLocalizationRuntime(ltrTestLocale),
      createTestLocalizationRuntime(rtlTestLocale),
    ] as const;

    for (const presentation of presentations) {
      const results = runtimes.map((runtime) =>
        resolveActionPresentation(presentation, (descriptor) =>
          resolveMessageResult(runtime, descriptor),
        ),
      );
      expect(results.every(({ usedFallback }) => usedFallback === false)).toBe(true);
      expect(new Set(results.map(({ message }) => message)).size).toBe(3);
    }
  });
});
