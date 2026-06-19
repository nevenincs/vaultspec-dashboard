import { describe, expect, it } from "vitest";

import type {
  PaletteSources,
  WindowCommandSources,
} from "../../stores/view/commandPaletteCommands";
import {
  buildCommands,
  buildWindowCommands,
  commandPaletteOptionDomIdPart,
  commandPaletteRowLabel,
  deriveCommandPalettePresentationView,
  filterCommands,
  gateCommandsForTimeTravel,
  groupByFamily,
} from "../../stores/view/commandPaletteCommands";
import {
  COMMAND_PALETTE_ACTION_ID,
  COMMAND_PALETTE_KEYBINDING,
  COMMAND_PALETTE_SHORTCUT_LABEL,
} from "../../stores/view/commandPalette";
import { RIGHT_RAIL_TABS } from "../../stores/view/shellLayout";

function sources(over: Partial<PaletteSources> = {}): PaletteSources {
  return {
    featureTags: ["auth-flow", "sync-service"],
    lensNames: ["broken links"],
    query: "",
    applyLens: () => undefined,
    saveLens: () => undefined,
    runOp: () => undefined,
    navigate: () => undefined,
    openSettings: () => undefined,
    ...over,
  };
}

describe("buildCommands (G2.a / G5.c)", () => {
  it("declares the command-palette toggle as a bindable command", () => {
    expect(COMMAND_PALETTE_KEYBINDING).toEqual({
      id: COMMAND_PALETTE_ACTION_ID,
      defaultChord: "Mod+K",
      label: COMMAND_PALETTE_SHORTCUT_LABEL,
      group: "General",
      context: "global",
    });
  });

  it("fronts navigation, lenses, and the whitelisted ops verbs", () => {
    const commands = buildCommands(sources());
    const ids = commands.map((c) => c.id);
    expect(ids).toContain("nav:auth-flow");
    expect(ids).toContain("lens:broken links");
    expect(ids).toContain("ops:core:vault-check");
    expect(ids).toContain("ops:rag:reindex");
    // Ops verbs require confirmation; navigation does not.
    expect(commands.find((c) => c.id === "ops:rag:reindex")?.confirm).toBe(true);
    expect(commands.find((c) => c.id === "ops:rag:reindex")?.disabledInTimeTravel).toBe(
      true,
    );
    expect(commands.find((c) => c.id === "nav:auth-flow")?.confirm).toBeUndefined();
    expect(
      commands.find((c) => c.id === "nav:auth-flow")?.disabledInTimeTravel,
    ).toBeUndefined();
  });

  it("tags each command with its family (object-then-action taxonomy)", () => {
    const commands = buildCommands(sources());
    expect(commands.find((c) => c.id === "nav:auth-flow")?.family).toBe("navigate");
    expect(commands.find((c) => c.id === "lens:broken links")?.family).toBe("filters");
    expect(commands.find((c) => c.id === "ops:core:vault-check")?.family).toBe("core");
    expect(commands.find((c) => c.id === "ops:rag:reindex")?.family).toBe("rag");
  });

  it("offers save-lens only when a name is typed", () => {
    expect(buildCommands(sources()).some((c) => c.id.startsWith("save-lens:"))).toBe(
      false,
    );
    const withQuery = buildCommands(sources({ query: "my sprint" }));
    expect(withQuery.some((c) => c.id === "save-lens:my sprint")).toBe(true);
  });

  it("does not offer save-lens while the canonical filter snapshot is not loaded", () => {
    const commands = buildCommands(sources({ query: "my sprint", canSaveLens: false }));

    expect(commands.some((c) => c.id.startsWith("save-lens:"))).toBe(false);
  });

  it("runs the wired actions", () => {
    const navigated: string[] = [];
    const commands = buildCommands(sources({ navigate: (id) => navigated.push(id) }));
    commands.find((c) => c.id === "nav:sync-service")!.run();
    expect(navigated).toEqual(["feature:sync-service"]);
  });
});

describe("gateCommandsForTimeTravel", () => {
  it("uses the shared disabledInTimeTravel descriptor flag", () => {
    const commands = buildCommands(sources());
    expect(gateCommandsForTimeTravel(commands, false)).toHaveLength(commands.length);

    const gated = gateCommandsForTimeTravel(commands, true);
    expect(gated.every((command) => command.disabledInTimeTravel !== true)).toBe(true);
    expect(gated.map((command) => command.id)).not.toContain("ops:core:vault-check");
    expect(gated.map((command) => command.id)).toContain("app:settings");
  });
});

describe("filterCommands", () => {
  it("matches case-insensitively on the label and passes empty through", () => {
    const commands = buildCommands(sources());
    expect(filterCommands(commands, "BROKEN")).toHaveLength(1);
    expect(filterCommands(commands, "")).toHaveLength(commands.length);
    expect(filterCommands(commands, "zzz")).toHaveLength(0);
  });

  it("is forgiving of word order and partial tokens", () => {
    const commands = buildCommands(sources());
    // "auth go" matches "go to auth-flow" regardless of token order.
    const hits = filterCommands(commands, "auth go");
    expect(hits.map((c) => c.id)).toContain("nav:auth-flow");
    // A partial fragment still matches.
    expect(filterCommands(commands, "sync").map((c) => c.id)).toContain(
      "nav:sync-service",
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
    expect(commands.every((c) => c.family === "window")).toBe(true);
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
    const tabs: string[] = [];
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
});

describe("groupByFamily", () => {
  it("groups in canonical family order and drops empty families", () => {
    const commands = buildCommands(sources());
    const groups = groupByFamily(commands);
    // The "app" family is always present (the settings command is unconditional).
    expect(groups.map((g) => g.family)).toEqual([
      "navigate",
      "filters",
      "core",
      "rag",
      "app",
    ]);
    // Every command lands in exactly one group.
    const grouped = groups.flatMap((g) => g.commands);
    expect(grouped).toHaveLength(commands.length);
  });

  it("omits a family with no commands", () => {
    const navOnly = buildCommands(
      sources({ lensNames: [], featureTags: ["only-feature"] }),
    ).filter((c) => c.family === "navigate");
    const groups = groupByFamily(navOnly);
    expect(groups.map((g) => g.family)).toEqual(["navigate"]);
  });
});

describe("deriveCommandPalettePresentationView", () => {
  it("derives the selected command, labels, and live-region count", () => {
    const ordered = filterCommands(buildCommands(sources()), "auth");
    const groups = groupByFamily(ordered);
    const view = deriveCommandPalettePresentationView(
      {
        groups,
        ordered,
        matchedResults: ordered.filter(
          (command) => !command.id.startsWith("save-lens:"),
        ),
        noMatch: false,
        navLoading: true,
      },
      { cursor: 0, confirmArmed: false, armedCommandId: null },
    );

    expect(view.safeCursor).toBe(0);
    expect(view.activeCommand?.id).toBe("nav:auth-flow");
    expect(view.rowGroups).toEqual([
      {
        family: "navigate",
        label: "navigate",
        rows: [
          expect.objectContaining({
            id: "nav:auth-flow",
            optionDomIdPart: "nav%3Aauth-flow",
            index: 0,
            label: "go to auth-flow",
            rowClassName:
              "flex h-[30px] w-full items-center justify-between rounded-fg-md px-fg-4 text-left transition-colors duration-ui-fast ease-settle bg-accent-subtle text-ink",
            labelClassName: undefined,
            selected: true,
            armed: false,
            confirmShortcutLabel: null,
            selectionHintVisible: true,
          }),
        ],
      },
    ]);
    expect(view.inputPlaceholder).toBe("type a command, feature, or lens…");
    expect(view.dialogLabel).toBe("command palette");
    expect(view.listboxLabel).toBe("commands");
    expect(view.navLoadingMessage).toBe("loading navigation…");
    expect(view.footerHints).toEqual({
      navigate: "navigate",
      open: "open",
      close: "close",
    });
    expect(view.liveMessage).toBe("1 command. go to auth-flow");
  });

  it("projects DOM-safe option id parts for user-derived command ids", () => {
    const ordered = buildCommands(
      sources({
        lensNames: ["broken links / weekly"],
        query: 'new lens "QA"',
      }),
    ).filter(
      (command) =>
        command.id === "lens:broken links / weekly" ||
        command.id === 'save-lens:new lens "QA"',
    );
    const view = deriveCommandPalettePresentationView(
      {
        groups: groupByFamily(ordered),
        ordered,
        matchedResults: ordered.filter(
          (command) => !command.id.startsWith("save-lens:"),
        ),
        noMatch: false,
        navLoading: false,
      },
      { cursor: 1, confirmArmed: false, armedCommandId: null },
    );

    const rows = view.rowGroups.flatMap((group) => group.rows);
    expect(rows).toEqual([
      expect.objectContaining({
        id: "lens:broken links / weekly",
        optionDomIdPart: commandPaletteOptionDomIdPart("lens:broken links / weekly"),
      }),
      expect.objectContaining({
        id: 'save-lens:new lens "QA"',
        optionDomIdPart: commandPaletteOptionDomIdPart('save-lens:new lens "QA"'),
      }),
    ]);
    expect(rows.map((row) => row.optionDomIdPart)).toEqual([
      "lens%3Abroken%20links%20%2F%20weekly",
      "save-lens%3Anew%20lens%20%22QA%22",
    ]);
    expect(rows.every((row) => !/\s/.test(row.optionDomIdPart))).toBe(true);
    expect(view.activeOptionDomIdPart).toBe(rows[1]?.optionDomIdPart);
  });

  it("announces the armed confirmation prompt through the presentation view", () => {
    const ordered = filterCommands(buildCommands(sources()), "vault");
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
      rowClassName:
        "flex h-[30px] w-full items-center justify-between rounded-fg-md px-fg-4 text-left transition-colors duration-ui-fast ease-settle bg-accent-subtle text-ink",
      labelClassName: "text-state-stale",
      selected: true,
      armed: true,
      confirmShortcutLabel: "⏎ ⏎",
      selectionHintVisible: false,
    });
    expect(view.liveMessage).toBe(`2 commands. confirm ${active.label}?`);
  });

  it("keeps no-match copy distinct from the save-lens survivor", () => {
    const ordered = buildCommands(sources({ query: "new lens" })).filter((command) =>
      command.id.startsWith("save-lens:"),
    );
    const view = deriveCommandPalettePresentationView(
      {
        groups: groupByFamily(ordered),
        ordered,
        matchedResults: [],
        noMatch: true,
        navLoading: false,
      },
      { cursor: 99, confirmArmed: false, armedCommandId: null },
    );

    expect(view.safeCursor).toBe(0);
    expect(view.noMatchMessage).toBe("nothing matches");
    expect(view.liveMessage).toBe(
      'no matches — save current filters as lens "new lens"',
    );
  });
});
