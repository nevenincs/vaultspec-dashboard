// The shared settings-dialog open state (dashboard-settings W04.P09) and its two
// entry points. The store drives both the gear button and the command-palette
// "Settings" command; this pins the store transitions and proves the palette
// command opens the same dialog.

import { afterEach, describe, expect, it } from "vitest";

import { opsCommandProvider } from "../../stores/view/commandProviders/opsCommandProvider";
import type { CommandContext } from "../../stores/view/commandRegistry";
import {
  closeSettingsDialog,
  normalizeSettingsDialogOpen,
  openSettingsDialog,
  setSettingsDialogOpen,
  toggleSettingsDialog,
  useSettingsDialog,
} from "../../stores/view/settingsDialog";

const noop = () => undefined;
function commandContext(): CommandContext {
  return {
    scope: "all",
    timeTravel: false,
    keybindingOverrides: {},
    graphFrozen: false,
    shell: {
      leftRailVisible: true,
      leftCollapsed: false,
      rightCollapsed: false,
      timelineVisible: true,
    },
    intents: {
      collapseTree: noop,
      resetFilters: noop,
      clearFeatureFilter: noop,
      focusRightRailSearch: noop,
      setTheme: noop,
      runOp: noop,
      closeDocument: noop,
      setGraphFrozen: noop,
      jumpToLive: noop,
      fitTimelineToCorpus: noop,
      setTimelineRangeDays: noop,
      toggleLeftRail: noop,
      toggleLeftCollapsed: noop,
      toggleRightRail: noop,
      toggleTimeline: noop,
      setRightTab: noop,
      resetLayout: noop,
      showKeyboardShortcuts: noop,
    },
  };
}

afterEach(() => useSettingsDialog.getState().closeDialog());

describe("useSettingsDialog store", () => {
  it("opens, closes, and toggles", () => {
    expect(useSettingsDialog.getState().open).toBe(false);
    useSettingsDialog.getState().openDialog();
    expect(useSettingsDialog.getState().open).toBe(true);
    useSettingsDialog.getState().closeDialog();
    expect(useSettingsDialog.getState().open).toBe(false);
    useSettingsDialog.getState().toggle();
    expect(useSettingsDialog.getState().open).toBe(true);
    useSettingsDialog.getState().toggle();
    expect(useSettingsDialog.getState().open).toBe(false);
  });

  it("exposes named settings-dialog helpers for app-layer consumers", () => {
    openSettingsDialog();
    expect(useSettingsDialog.getState().open).toBe(true);

    toggleSettingsDialog();
    expect(useSettingsDialog.getState().open).toBe(false);

    toggleSettingsDialog();
    closeSettingsDialog();
    expect(useSettingsDialog.getState().open).toBe(false);
  });

  it("normalizes explicit open-state writes at the store seam", () => {
    expect(normalizeSettingsDialogOpen(true)).toBe(true);
    expect(normalizeSettingsDialogOpen(false)).toBe(false);
    expect(normalizeSettingsDialogOpen("true")).toBeNull();
    expect(normalizeSettingsDialogOpen(1)).toBeNull();

    setSettingsDialogOpen(true);
    expect(useSettingsDialog.getState().open).toBe(true);

    setSettingsDialogOpen("false");
    expect(useSettingsDialog.getState().open).toBe(true);

    setSettingsDialogOpen(false);
    expect(useSettingsDialog.getState().open).toBe(false);
  });

  it("normalizes malformed open-state reads before toggling", () => {
    useSettingsDialog.setState({
      open: "true",
    } as unknown as Partial<ReturnType<typeof useSettingsDialog.getState>>);

    toggleSettingsDialog();

    expect(useSettingsDialog.getState().open).toBe(true);
  });
});

describe("command-palette Settings entry point", () => {
  it("ops provider contributes a Settings command that opens the dialog", () => {
    const settings = opsCommandProvider(commandContext())
      .map(
        (c) => c as { id?: string; family?: string; label?: string; run?: () => void },
      )
      .find((c) => c.id === "app:settings");
    expect(settings).toBeDefined();
    expect(settings?.family).toBe("app");
    expect(settings?.label).toBe("Settings…");

    expect(useSettingsDialog.getState().open).toBe(false);
    settings?.run?.();
    expect(useSettingsDialog.getState().open).toBe(true);
  });
});
