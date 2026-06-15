// The shared settings-dialog open state (dashboard-settings W04.P09) and its two
// entry points. The store drives both the gear button and the command-palette
// "Settings" command; this pins the store transitions and proves the palette
// command opens the same dialog.

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCommands } from "../palette/CommandPalette";
import type { PaletteSources } from "../palette/CommandPalette";
import { useSettingsDialog } from "./useSettingsDialog";

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
});

describe("command-palette Settings entry point", () => {
  const sources = (over: Partial<PaletteSources> = {}): PaletteSources => ({
    featureTags: [],
    lensNames: [],
    query: "",
    applyLens: () => undefined,
    saveLens: () => undefined,
    runOp: () => undefined,
    navigate: () => undefined,
    openSettings: () => undefined,
    ...over,
  });

  it("builds an 'open settings' command in the app family that calls openSettings", () => {
    const openSettings = vi.fn();
    const commands = buildCommands(sources({ openSettings }));
    const settings = commands.find((c) => c.id === "app:settings");
    expect(settings).toBeDefined();
    expect(settings?.family).toBe("app");
    expect(settings?.label).toBe("open settings");
    settings?.run();
    expect(openSettings).toHaveBeenCalledTimes(1);
  });
});
