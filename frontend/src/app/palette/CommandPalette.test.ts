import { describe, expect, it } from "vitest";

import type { WindowCommandSources } from "../../stores/view/commandPaletteCommands";
import {
  buildWindowCommands,
  commandPaletteRightRailCommandId,
  commandPaletteOptionDomIdPart,
  commandPaletteRowLabel,
  deriveCommandPalettePresentationView,
  filterCommands,
  gateCommandsForTimeTravel,
  groupByFamily,
  normalizeCommandPaletteRightRailTab,
  type PaletteCommand,
} from "../../stores/view/commandPaletteCommands";
import {
  COMMAND_PALETTE_ACTION_ID,
  COMMAND_PALETTE_KEYBINDING,
  COMMAND_PALETTE_SHORTCUT_LABEL,
} from "../../stores/view/commandPalette";
import { RIGHT_RAIL_TABS } from "../../stores/view/shellLayout";

// Synthetic command rows exercising the projection seams (grouping, filtering,
// presentation). Command CONTENT now comes from the provider registry; these tests
// pin the pure projection helpers, not corpus assembly.
function command(id: string, patch: Partial<PaletteCommand> = {}): PaletteCommand {
  return { id, label: id, family: "app", run: () => undefined, ...patch };
}

function sample(): PaletteCommand[] {
  return [
    command("graph:fit", { label: "graph: fit to view", family: "navigate" }),
    command("graph:zoom-in", { label: "graph: zoom in", family: "navigate" }),
    command("left-rail:reset-filters", { label: "reset filters", family: "filters" }),
    command("ops:core:vault-check", {
      label: "ops: vault check",
      family: "core",
      confirm: true,
      disabledInTimeTravel: true,
    }),
    command("ops:rag:reindex", {
      label: "ops: reindex",
      family: "rag",
      confirm: true,
      disabledInTimeTravel: true,
    }),
    command("app:settings", { label: "open settings", family: "app" }),
  ];
}

describe("command-palette toggle binding", () => {
  it("declares the command-palette toggle as a bindable command", () => {
    expect(COMMAND_PALETTE_KEYBINDING).toEqual({
      id: COMMAND_PALETTE_ACTION_ID,
      defaultChord: "Mod+K",
      label: COMMAND_PALETTE_SHORTCUT_LABEL,
      group: "General",
      context: "global",
    });
  });
});

describe("gateCommandsForTimeTravel", () => {
  it("removes the shared disabledInTimeTravel commands in historical mode", () => {
    const commands = sample();
    expect(gateCommandsForTimeTravel(commands, false)).toHaveLength(commands.length);

    const gated = gateCommandsForTimeTravel(commands, true);
    expect(gated.every((command) => command.disabledInTimeTravel !== true)).toBe(true);
    expect(gated.map((command) => command.id)).not.toContain("ops:core:vault-check");
    expect(gated.map((command) => command.id)).toContain("app:settings");
  });
});

describe("filterCommands", () => {
  it("matches case-insensitively on the label and passes empty through", () => {
    const commands = sample();
    expect(filterCommands(commands, "REINDEX")).toHaveLength(1);
    expect(filterCommands(commands, "")).toHaveLength(commands.length);
    expect(filterCommands(commands, "zzz")).toHaveLength(0);
  });

  it("is forgiving of word order and partial tokens", () => {
    const commands = sample();
    // "fit graph" matches "graph: fit to view" regardless of token order.
    expect(filterCommands(commands, "fit graph").map((c) => c.id)).toContain(
      "graph:fit",
    );
    // A partial fragment still matches.
    expect(filterCommands(commands, "zoom").map((c) => c.id)).toContain(
      "graph:zoom-in",
    );
  });
});

function windowSources(over: Partial<WindowCommandSources> = {}): WindowCommandSources {
  return {
    leftRailVisible: true,
    leftCollapsed: false,
    rightCollapsed: false,
    timelineVisible: true,
    toggleLeftRail: () => undefined,
    toggleLeftCollapsed: () => undefined,
    toggleRightRail: () => undefined,
    toggleTimeline: () => undefined,
    setRightTab: () => undefined,
    resetLayout: () => undefined,
    showKeyboardShortcuts: () => undefined,
    ...over,
  };
}

describe("buildWindowCommands (window-management parity)", () => {
  it("exposes every window-management action under the window family", () => {
    const commands = buildWindowCommands(windowSources());
    // The keyboard-shortcuts legend is a HELP verb per the action taxonomy (it
    // rides the `window:` id stem only so its registry-derived accelerator is
    // unchanged); every OTHER window-management action is in the window family.
    expect(
      commands
        .filter((c) => c.id !== "window:keyboard-shortcuts")
        .every((c) => c.family === "window"),
    ).toBe(true);
    expect(commands.find((c) => c.id === "window:keyboard-shortcuts")?.family).toBe(
      "help",
    );
    expect(commands.map((c) => c.id)).toEqual([
      "window:left-rail",
      "window:left-collapse",
      "window:right-rail",
      "window:timeline",
      ...RIGHT_RAIL_TABS.map((tab) => `window:rail-${tab.id}`),
      "window:reset-layout",
      "window:keyboard-shortcuts",
    ]);
  });

  it("names the inverse action from current visibility state", () => {
    const shown = buildWindowCommands(windowSources());
    expect(shown.find((c) => c.id === "window:left-rail")?.label).toBe(
      "hide left rail",
    );
    expect(shown.find((c) => c.id === "window:timeline")?.label).toBe("hide timeline");
    expect(shown.find((c) => c.id === "window:right-rail")?.label).toBe(
      "hide right rail",
    );
    const hidden = buildWindowCommands(
      windowSources({
        leftRailVisible: false,
        timelineVisible: false,
        rightCollapsed: true,
        leftCollapsed: true,
      }),
    );
    expect(hidden.find((c) => c.id === "window:left-rail")?.label).toBe(
      "show left rail",
    );
    expect(hidden.find((c) => c.id === "window:timeline")?.label).toBe("show timeline");
    expect(hidden.find((c) => c.id === "window:right-rail")?.label).toBe(
      "show right rail",
    );
  });

  it("omits the collapse command when the left rail is hidden", () => {
    const hidden = buildWindowCommands(windowSources({ leftRailVisible: false }));
    expect(hidden.some((c) => c.id === "window:left-collapse")).toBe(false);
  });

  it("routes each command to its intent callback", () => {
    const fired: string[] = [];
    const tabs: unknown[] = [];
    const commands = buildWindowCommands(
      windowSources({
        toggleLeftRail: () => fired.push("left-rail"),
        toggleTimeline: () => fired.push("timeline"),
        resetLayout: () => fired.push("reset"),
        setRightTab: (tab) => tabs.push(tab),
      }),
    );
    commands.find((c) => c.id === "window:left-rail")?.run();
    commands.find((c) => c.id === "window:timeline")?.run();
    commands.find((c) => c.id === "window:reset-layout")?.run();
    commands.find((c) => c.id === "window:rail-search")?.run();
    expect(fired).toEqual(["left-rail", "timeline", "reset"]);
    expect(tabs).toEqual(["search"]);
  });

  it("normalizes runtime right-rail tab command identity", () => {
    expect(normalizeCommandPaletteRightRailTab(" search ")).toBe("search");
    expect(normalizeCommandPaletteRightRailTab({ tab: "search" })).toBeNull();
    expect(commandPaletteRightRailCommandId(" search ")).toBe("window:rail-search");
    expect(commandPaletteRightRailCommandId({ tab: "search" })).toBeNull();
  });
});

describe("groupByFamily", () => {
  it("groups in canonical family order and drops empty families", () => {
    const groups = groupByFamily(sample());
    expect(groups.map((g) => g.family)).toEqual([
      "navigate",
      "filters",
      "core",
      "rag",
      "app",
    ]);
    const grouped = groups.flatMap((g) => g.commands);
    expect(grouped).toHaveLength(sample().length);
  });

  it("omits a family with no commands", () => {
    const navOnly = sample().filter((c) => c.family === "navigate");
    expect(groupByFamily(navOnly).map((g) => g.family)).toEqual(["navigate"]);
  });
});

describe("deriveCommandPalettePresentationView", () => {
  it("derives the selected command, labels, and live-region count", () => {
    const ordered = filterCommands(sample(), "fit");
    const groups = groupByFamily(ordered);
    const view = deriveCommandPalettePresentationView(
      {
        groups,
        ordered,
        matchedResults: ordered,
        noMatch: false,
        navLoading: true,
      },
      { cursor: 0, confirmArmed: false, armedCommandId: null },
    );

    expect(view.safeCursor).toBe(0);
    expect(view.activeCommand?.id).toBe("graph:fit");
    expect(view.rowGroups).toEqual([
      {
        family: "navigate",
        label: "navigate",
        rows: [
          expect.objectContaining({
            id: "graph:fit",
            optionDomIdPart: "graph%3Afit",
            index: 0,
            label: "graph: fit to view",
            rowClassName:
              "flex h-[1.875rem] w-full items-center justify-between rounded-fg-md px-fg-4 text-left transition-colors duration-ui-fast ease-settle bg-accent-subtle text-ink",
            labelClassName: undefined,
            selected: true,
            armed: false,
            confirmShortcutLabel: null,
            selectionHintVisible: true,
          }),
        ],
      },
    ]);
    expect(view.inputPlaceholder).toBe("type a command…");
    expect(view.dialogLabel).toBe("command palette");
    expect(view.listboxLabel).toBe("commands");
    expect(view.navLoadingMessage).toBe("loading navigation…");
    expect(view.footerHints).toEqual({
      navigate: "navigate",
      open: "open",
      close: "close",
    });
    expect(view.liveMessage).toBe("1 command. graph: fit to view");
  });

  it("projects DOM-safe option id parts for special-character command ids", () => {
    const ordered = [
      command("lens:broken links / weekly", {
        label: "broken links / weekly",
        family: "filters",
      }),
      command('save:new lens "QA"', { label: 'new lens "QA"', family: "filters" }),
    ];
    const view = deriveCommandPalettePresentationView(
      {
        groups: groupByFamily(ordered),
        ordered,
        matchedResults: ordered,
        noMatch: false,
        navLoading: false,
      },
      { cursor: 1, confirmArmed: false, armedCommandId: null },
    );

    const rows = view.rowGroups.flatMap((group) => group.rows);
    expect(rows.map((row) => row.optionDomIdPart)).toEqual([
      commandPaletteOptionDomIdPart("lens:broken links / weekly"),
      commandPaletteOptionDomIdPart('save:new lens "QA"'),
    ]);
    expect(rows.every((row) => !/\s/.test(row.optionDomIdPart))).toBe(true);
    expect(view.activeOptionDomIdPart).toBe(rows[1]?.optionDomIdPart);
  });

  it("announces the armed confirmation prompt through the presentation view", () => {
    const ordered = filterCommands(sample(), "vault");
    const groups = groupByFamily(ordered);
    const active = ordered.find((command) => command.confirm)!;
    const view = deriveCommandPalettePresentationView(
      {
        groups,
        ordered,
        matchedResults: ordered,
        noMatch: false,
        navLoading: false,
      },
      {
        cursor: ordered.indexOf(active),
        confirmArmed: true,
        armedCommandId: active.id,
      },
    );

    expect(commandPaletteRowLabel(active, true)).toBe(`confirm ${active.label}?`);
    expect(
      view.rowGroups.flatMap((group) => group.rows).find((row) => row.id === active.id),
    ).toMatchObject({
      label: `confirm ${active.label}?`,
      labelClassName: "text-state-stale",
      selected: true,
      armed: true,
      confirmShortcutLabel: "⏎ ⏎",
      selectionHintVisible: false,
    });
    expect(view.liveMessage).toBe(`1 command. confirm ${active.label}?`);
  });
});
