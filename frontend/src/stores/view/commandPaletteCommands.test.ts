import { afterEach, describe, expect, it } from "vitest";

import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import { createActionConfirmationDescriptor } from "../../platform/localization/message";
import {
  buildEditorCommands,
  deriveCommandAccelerators,
  buildGraphCommands,
  buildLeftRailCommands,
  buildSettingsCommands,
  buildTimelineCommands,
  commandPaletteMovedCursor,
  commandPaletteMovedRunnableCursor,
  commandPaletteSafeCursor,
  COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS,
  COMMAND_PALETTE_SOURCE_ITEMS_CAP,
  deriveCommandPaletteArmedRepair,
  deriveCommandPaletteActivation,
  deriveCommandPaletteKeyboardIntent,
  deriveCommandPalettePresentationView,
  filterCommands,
  groupByFamily,
  COMMAND_FAMILY_MESSAGES,
  normalizeCommandFamily,
  normalizeCommandPaletteSourceItems,
  normalizePaletteCommand,
  type ResolvedPaletteCommand,
} from "./commandPaletteCommands";

describe("COMMAND_FAMILY_MESSAGES", () => {
  it("exhaustively maps stable family tokens to typed headings", () => {
    expect(COMMAND_FAMILY_MESSAGES).toEqual({
      navigate: { key: "common:commandFamilies.navigation" },
      filters: { key: "common:commandFamilies.filters" },
      focus: { key: "common:commandFamilies.focus" },
      window: { key: "common:commandFamilies.layout" },
      edit: { key: "common:commandFamilies.editing" },
      reload: { key: "common:commandFamilies.refresh" },
      settings: { key: "common:commandFamilies.settings" },
      search: { key: "common:commandFamilies.search" },
      core: { key: "common:commandFamilies.workspaceMaintenance" },
      rag: { key: "common:commandFamilies.searchMaintenance" },
      help: { key: "common:commandFamilies.help" },
      app: { key: "common:commandFamilies.general" },
    });
    expect(Object.isFrozen(COMMAND_FAMILY_MESSAGES)).toBe(true);
  });
});

describe("buildGraphCommands", () => {
  it("enrolls camera, freeze (label reflects state), and reset-defaults", () => {
    const cmds = buildGraphCommands({
      frozen: false,
      setFrozen: () => undefined,
      resetDefaults: () => undefined,
    });
    expect(cmds.map((c) => c.id)).toEqual([
      "graph:fit-to-view",
      "graph:reset-view",
      "graph:zoom-in",
      "graph:zoom-out",
      "graph:toggle-freeze",
      "graph:reset-defaults",
    ]);
    expect(cmds.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "graph:fit-to-view", label: { key: "graph:actions.fitToView" } },
      { id: "graph:reset-view", label: { key: "graph:actions.resetView" } },
      { id: "graph:zoom-in", label: { key: "graph:actions.zoomIn" } },
      { id: "graph:zoom-out", label: { key: "graph:actions.zoomOut" } },
      {
        id: "graph:toggle-freeze",
        label: { key: "graph:actions.pauseMovement" },
      },
      {
        id: "graph:reset-defaults",
        label: { key: "graph:actions.resetSettings" },
      },
    ]);
    const frozen = buildGraphCommands({
      frozen: true,
      setFrozen: () => undefined,
      resetDefaults: () => undefined,
    });
    expect(frozen.find((c) => c.id === "graph:toggle-freeze")?.label).toEqual({
      key: "graph:actions.resumeMovement",
    });
  });

  it("freeze toggle inverts the current state through the injected setter", () => {
    const states: boolean[] = [];
    buildGraphCommands({
      frozen: true,
      setFrozen: (f) => {
        states.push(f);
      },
      resetDefaults: () => undefined,
    })
      .find((c) => c.id === "graph:toggle-freeze")
      ?.run();
    buildGraphCommands({
      frozen: false,
      setFrozen: (f) => {
        states.push(f);
      },
      resetDefaults: () => undefined,
    })
      .find((c) => c.id === "graph:toggle-freeze")
      ?.run();
    expect(states).toEqual([false, true]);
  });
});

describe("buildSettingsCommands", () => {
  it("offers the four theme preferences, each firing the injected setter", () => {
    const set: string[] = [];
    const cmds = buildSettingsCommands((v) => set.push(v));
    expect(cmds.map((c) => c.id)).toEqual([
      "settings:theme-system",
      "settings:theme-light",
      "settings:theme-dark",
      "settings:theme-high-contrast",
    ]);
    expect(cmds.map((c) => c.label)).toEqual([
      { key: "settings:actions.useSystemTheme" },
      { key: "settings:actions.useLightTheme" },
      { key: "settings:actions.useDarkTheme" },
      { key: "settings:actions.useHighContrastTheme" },
    ]);
    cmds.forEach((c) => c.run());
    expect(set).toEqual(["system", "light", "dark", "high-contrast"]);
  });
});

describe("buildTimelineCommands / buildEditorCommands", () => {
  it("timeline enrolls the date-range presets and clear (Issue #14)", () => {
    let cleared = 0;
    const days: number[] = [];
    const commands = buildTimelineCommands({
      setRangeDays: (d) => days.push(d),
      clearDateRange: () => {
        cleared += 1;
      },
    });
    expect(commands.map((c) => c.id)).toEqual([
      "timeline:range-1d",
      "timeline:range-7d",
      "timeline:range-30d",
      "timeline:range-90d",
      "timeline:clear-date-range",
    ]);
    expect(commands.every((c) => c.family === "filters")).toBe(true);
    expect(commands.map((c) => c.label)).toEqual([
      { key: "timeline:actions.showLast24Hours" },
      { key: "timeline:actions.showLast7Days" },
      { key: "timeline:actions.showLast30Days" },
      { key: "timeline:actions.showLast90Days" },
      { key: "timeline:actions.clearDateRange" },
    ]);
    commands.slice(0, 4).forEach((command) => command.run());
    commands.find((c) => c.id === "timeline:clear-date-range")?.run();
    expect(days).toEqual([1, 7, 30, 90]);
    expect(cleared).toBe(1);
  });

  it("editor commands fire the injected effects (close / close-all / reload / keep-open / toggle-diff)", () => {
    let closed = 0;
    let closedAll = 0;
    let reloaded = 0;
    let kept = 0;
    let diffToggled = 0;
    const commands = buildEditorCommands({
      closeDoc: () => {
        closed += 1;
      },
      closeAllDocs: () => {
        closedAll += 1;
      },
      reloadDoc: () => {
        reloaded += 1;
      },
      keepOpen: () => {
        kept += 1;
      },
      toggleDiff: () => {
        diffToggled += 1;
      },
    });
    expect(commands.map((c) => c.id)).toEqual([
      "editor:close-document",
      "editor:close-all-documents",
      "editor:reload-document",
      "editor:keep-document-open",
      "editor:toggle-diff",
    ]);
    // The lifecycle commands are in the "app" family; toggle-diff is in "edit".
    const appIds = [
      "editor:close-document",
      "editor:close-all-documents",
      "editor:reload-document",
      "editor:keep-document-open",
    ];
    expect(
      commands.filter((c) => appIds.includes(c.id)).every((c) => c.family === "app"),
    ).toBe(true);
    expect(commands.find((c) => c.id === "editor:toggle-diff")?.family).toBe("edit");
    expect(commands.find((c) => c.id === "editor:toggle-diff")?.label).toEqual({
      key: "documents:actions.showOrHideChanges",
    });
    expect(commands.slice(0, 4).map((c) => c.label)).toEqual([
      { key: "documents:actions.closeDocument" },
      { key: "documents:actions.closeAllDocuments" },
      { key: "documents:actions.reloadDocument" },
      { key: "documents:actions.keepDocumentOpen" },
    ]);
    commands[0]?.run();
    commands[1]?.run();
    commands[2]?.run();
    commands[3]?.run();
    commands[4]?.run();
    expect([closed, closedAll, reloaded, kept, diffToggled]).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("buildLeftRailCommands", () => {
  it("enrolls new-document, browse, focus/clear filter, facets, collapse, reset — shared ids", () => {
    const commands = buildLeftRailCommands({
      collapseTree: () => undefined,
      resetFilters: () => undefined,
      clearFilter: () => undefined,
    });
    expect(commands.map((c) => c.id)).toEqual([
      "left-rail:new-document",
      "left-rail:browse-vault",
      "left-rail:browse-code",
      "left-rail:focus-filter",
      "left-rail:clear-filter",
      "left-rail:toggle-facets",
      "left-rail:collapse-tree",
      "left-rail:reset-filters",
      // The vault tree's sort plane (left-rail-tree-controls ADR D3): one
      // command per option + the reset, from the SAME shared builders.
      "left-rail:sort-recency",
      "left-rail:sort-docs",
      "left-rail:sort-name",
      "left-rail:sort-created",
      "left-rail:sort-modified",
      "left-rail:sort-size",
      "left-rail:sort-weight",
      "left-rail:reset-sorting",
    ]);
    const families = new Map(commands.map((c) => [c.id, c.family]));
    expect(families.get("left-rail:new-document")).toBe("app");
    expect(families.get("left-rail:browse-vault")).toBe("navigate");
    expect(families.get("left-rail:focus-filter")).toBe("focus");
    expect(families.get("left-rail:clear-filter")).toBe("filters");
    expect(families.get("left-rail:toggle-facets")).toBe("filters");
    expect(families.get("left-rail:reset-filters")).toBe("filters");
    // Every palette command must carry a runnable effect (run-only plane).
    expect(commands.every((c) => typeof c.run === "function")).toBe(true);
  });

  it("fires the injected collapse-tree, reset-filters, and clear-filter effects", () => {
    let collapsed = 0;
    let reset = 0;
    let cleared = 0;
    const commands = buildLeftRailCommands({
      collapseTree: () => {
        collapsed += 1;
      },
      resetFilters: () => {
        reset += 1;
      },
      clearFilter: () => {
        cleared += 1;
      },
    });
    commands.find((c) => c.id === "left-rail:collapse-tree")?.run();
    commands.find((c) => c.id === "left-rail:reset-filters")?.run();
    commands.find((c) => c.id === "left-rail:clear-filter")?.run();
    expect(collapsed).toBe(1);
    expect(reset).toBe(1);
    expect(cleared).toBe(1);
  });
});

function command(
  id: string,
  patch: Partial<ResolvedPaletteCommand> = {},
): ResolvedPaletteCommand {
  return {
    id,
    label: id,
    family: "app",
    presentationSafe: true,
    fallbackDisabled: false,
    legacyConfirmPrompt: null,
    run: () => undefined,
    ...patch,
  };
}

describe("command palette command projection", () => {
  it("normalizes palette command family and shared action descriptor fields", () => {
    const run = () => undefined;

    expect(normalizeCommandFamily(" window ")).toBe("window");
    expect(normalizeCommandFamily("unknown")).toBeNull();
    expect(
      normalizePaletteCommand({
        id: " window:timeline ",
        label: " Hide timeline ",
        family: " window ",
        confirm: true,
        disabledInTimeTravel: true,
        run,
        rogue: "local payload",
      }),
    ).toEqual({
      id: "window:timeline",
      label: "Hide timeline",
      family: "window",
      confirm: true,
      disabledInTimeTravel: true,
      run,
    });
    expect(
      normalizePaletteCommand({
        id: "x",
        label: "X",
        family: "window",
        dispatch: { type: "ui:x" },
      }),
    ).toBeNull();
    expect(
      normalizePaletteCommand({
        id: "x",
        label: "X",
        family: "unknown",
        run,
      }),
    ).toBeNull();
  });

  it("normalizes, de-duplicates, trims, and bounds command source lists", () => {
    expect(
      normalizeCommandPaletteSourceItems([
        " state ",
        "",
        "state",
        { tag: "bad" },
        "timeline",
      ]),
    ).toEqual(["state", "timeline"]);
    expect(
      normalizeCommandPaletteSourceItems(
        Array.from(
          { length: COMMAND_PALETTE_SOURCE_ITEMS_CAP + 5 },
          (_, i) => ` item-${i} `,
        ),
      ),
    ).toHaveLength(COMMAND_PALETTE_SOURCE_ITEMS_CAP);
    expect(
      normalizeCommandPaletteSourceItems([
        "state",
        "x".repeat(COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS + 1),
        "timeline",
      ]),
    ).toEqual(["state", "timeline"]);
    expect(normalizeCommandPaletteSourceItems({ items: ["state"] })).toEqual([]);
  });

  it("filters and groups command rows in the stores view seam", () => {
    const commands = [
      command("nav:state", { label: "go to state", family: "navigate" }),
      command("window:timeline", { label: "show timeline", family: "window" }),
      command("app:settings", { label: "open settings", family: "app" }),
    ];

    expect(filterCommands(commands, "show time").map((item) => item.id)).toEqual([
      "window:timeline",
    ]);
    expect(filterCommands(commands, "  SHOW   TIME  ").map((item) => item.id)).toEqual([
      "window:timeline",
    ]);
    expect(
      filterCommands(commands, { query: "show time" }).map((item) => item.id),
    ).toEqual(["nav:state", "window:timeline", "app:settings"]);
    expect(groupByFamily(commands).map((group) => group.family)).toEqual([
      "navigate",
      "window",
      "app",
    ]);
  });

  it("keeps cursor clamping and movement out of the palette component", () => {
    expect(commandPaletteSafeCursor(0, 12)).toBe(-1);
    expect(commandPaletteSafeCursor(3, -10)).toBe(0);
    expect(commandPaletteSafeCursor(3, 10)).toBe(2);
    expect(commandPaletteMovedCursor(3, 1, 1)).toBe(2);
    expect(commandPaletteMovedCursor(3, 0, -1)).toBe(0);
    const commands = [
      command("first"),
      command("disabled", { disabled: true }),
      command("last"),
    ];
    expect(commandPaletteMovedRunnableCursor(commands, 0, 1)).toBe(2);
    expect(commandPaletteMovedRunnableCursor(commands, 2, -1)).toBe(0);
    expect(
      commandPaletteMovedRunnableCursor(
        commands.map((item) => ({ ...item, disabled: true })),
        0,
        1,
      ),
    ).toBe(-1);
  });

  it("retains disabled rows while excluding them from selection", () => {
    const disabled = command("app:disabled", {
      disabled: true,
      disabledReason: "Choose a project and try again.",
    });
    const runnable = command("app:runnable");
    const view = deriveCommandPalettePresentationView(
      {
        ordered: [disabled, runnable],
        matchedResults: [disabled, runnable],
        groups: [{ family: "app", commands: [disabled, runnable] }],
        noMatch: false,
        navLoading: false,
      },
      { cursor: 0, confirmArmed: false, armedCommandId: null },
    );

    expect(view.safeCursor).toBe(1);
    expect(view.activeCommand?.id).toBe("app:runnable");
    expect(view.rowGroups[0]?.rows[0]).toMatchObject({
      id: "app:disabled",
      disabled: true,
      disabledReason: "Choose a project and try again.",
      selected: false,
      selectionHintVisible: false,
    });
    expect(view.rowGroups[0]?.rows[0]?.rowClassName).toContain("cursor-not-allowed");
  });

  it("derives keyboard navigation intent at the store seam", () => {
    expect(deriveCommandPaletteKeyboardIntent("ArrowDown")).toEqual({
      kind: "move-cursor",
      delta: 1,
    });
    expect(deriveCommandPaletteKeyboardIntent("ArrowUp")).toEqual({
      kind: "move-cursor",
      delta: -1,
    });
    expect(deriveCommandPaletteKeyboardIntent("Enter")).toEqual({
      kind: "run-active",
    });
    expect(deriveCommandPaletteKeyboardIntent("Escape")).toBeNull();
    expect(deriveCommandPaletteKeyboardIntent({ key: "ArrowDown" })).toBeNull();
  });

  it("projects rows and confirm state without resolving live copy", () => {
    const ops = command("ops:rag:reindex", {
      label: "ops: reindex",
      family: "rag",
      confirm: true,
      legacyConfirmPrompt: "Confirm ops: reindex?",
    });
    const view = deriveCommandPalettePresentationView(
      {
        ordered: [ops],
        matchedResults: [ops],
        groups: [{ family: "rag", commands: [ops] }],
        noMatch: false,
        navLoading: false,
      },
      { cursor: 4, confirmArmed: true, armedCommandId: ops.id },
    );

    expect(view.safeCursor).toBe(0);
    expect(view.activeOptionDomIdPart).toBe("ops%3Arag%3Areindex");
    expect(view.rowGroups[0]?.rows[0]).toMatchObject({
      label: "Confirm ops: reindex?",
      armed: true,
      confirmShortcutLabel: "⏎ ⏎",
      selectionHintVisible: false,
    });
    expect(view.activeRow?.label).toBe("Confirm ops: reindex?");
    expect(view.resultCount).toBe(1);
  });

  it("derives activation outcomes for disabled, confirm, and run commands", () => {
    const run = command("nav:state", { label: "go to state", family: "navigate" });
    const disabled = command("app:disabled", { disabled: true });
    const confirm = command("ops:rag:reindex", {
      label: "ops: reindex",
      family: "rag",
      confirm: true,
    });
    const typedConfirmation = createActionConfirmationDescriptor({
      kind: "guarded",
      title: {
        key: "features:confirmations.repair.title",
        values: { feature: "feature" },
      },
      body: { key: "features:confirmations.repair.body" },
      confirmLabel: { key: "features:guardedActions.repair" },
      cancelLabel: { key: "common:actions.cancel" },
    });
    expect(typedConfirmation).not.toBeNull();
    const typed = command("feature:repair", {
      confirmation: typedConfirmation!,
    });

    expect(
      deriveCommandPaletteActivation([run], -1, {
        confirmArmed: false,
        armedCommandId: null,
      }),
    ).toMatchObject({
      kind: "run",
      cursor: 0,
      command: run,
      closeAfterRun: true,
    });
    expect(
      deriveCommandPaletteActivation([disabled], 0, {
        confirmArmed: false,
        armedCommandId: null,
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      deriveCommandPaletteActivation([confirm], 0, {
        confirmArmed: false,
        armedCommandId: null,
      }),
    ).toEqual({ kind: "arm", cursor: 0, commandId: "ops:rag:reindex" });
    expect(
      deriveCommandPaletteActivation([confirm], 0, {
        confirmArmed: true,
        armedCommandId: "ops:rag:reindex",
      }),
    ).toMatchObject({
      kind: "run",
      cursor: 0,
      command: confirm,
      closeAfterRun: false,
    });
    expect(
      deriveCommandPaletteActivation([typed], 0, {
        confirmArmed: false,
        armedCommandId: null,
      }),
    ).toEqual({
      kind: "confirm",
      cursor: 0,
      commandId: "feature:repair",
    });
  });

  it("derives armed-command repair when source changes stale the confirm row", () => {
    const confirm = command("ops:rag:reindex", {
      label: "ops: reindex",
      family: "rag",
      confirm: true,
    });
    const run = command("nav:state", { label: "go to state", family: "navigate" });

    expect(
      deriveCommandPaletteArmedRepair(confirm, {
        confirmArmed: false,
        armedCommandId: "ops:rag:reindex",
      }),
    ).toEqual({ clearArmedCommandId: true, disarm: false });
    expect(
      deriveCommandPaletteArmedRepair(confirm, {
        confirmArmed: true,
        armedCommandId: "ops:rag:reindex",
      }),
    ).toEqual({ clearArmedCommandId: false, disarm: false });
    expect(
      deriveCommandPaletteArmedRepair(run, {
        confirmArmed: true,
        armedCommandId: "ops:rag:reindex",
      }),
    ).toEqual({ clearArmedCommandId: false, disarm: true });
  });
});

describe("deriveCommandAccelerators", () => {
  afterEach(() => {
    resetKeybindings();
  });

  it("derives the inline accelerator from the keymap registry by shared id", () => {
    registerKeybindings([
      {
        id: "left-rail:new-document",
        defaultChord: "Mod+Alt+N",
        label: { key: "documents:actions.addToFeature" },
        group: { key: "common:shortcutGroups.navigation" },
        context: "left-rail",
      },
    ]);
    const [withChord, withoutChord] = deriveCommandAccelerators(
      [
        command("left-rail:new-document", { family: "app" }),
        command("graph:fit", { family: "navigate" }),
      ],
      {},
      false,
    );
    expect(withChord.accelerator).toEqual([
      { key: "common:keycaps.control" },
      { key: "common:keycaps.alt" },
      { kind: "literal", value: "N" },
    ]);
    expect(withoutChord.accelerator).toBeUndefined();
  });

  it("reflects an effective override over the default chord", () => {
    registerKeybindings([
      {
        id: "left-rail:new-document",
        defaultChord: "Mod+Alt+N",
        label: { key: "documents:actions.addToFeature" },
        group: { key: "common:shortcutGroups.navigation" },
        context: "left-rail",
      },
    ]);
    const [derived] = deriveCommandAccelerators(
      [command("left-rail:new-document", { family: "app" })],
      { "left-rail:new-document": "Mod+Shift+N" },
      false,
    );
    expect(derived.accelerator).toEqual([
      { key: "common:keycaps.control" },
      { key: "common:keycaps.shift" },
      { kind: "literal", value: "N" },
    ]);
  });
});
