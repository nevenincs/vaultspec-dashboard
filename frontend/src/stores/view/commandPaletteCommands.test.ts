import { afterEach, describe, expect, it } from "vitest";

import { registerKeybindings, resetKeybindings } from "../../platform/keymap/registry";
import { setIsMacForTesting } from "../../platform/keymap/chord";
import {
  buildEditorCommands,
  deriveCommandAccelerators,
  buildGraphCommands,
  buildLeftRailCommands,
  buildSettingsCommands,
  buildTimelineCommands,
  commandPaletteMovedCursor,
  commandPaletteSafeCursor,
  COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS,
  COMMAND_PALETTE_SOURCE_ITEMS_CAP,
  deriveCommandPaletteArmedRepair,
  deriveCommandPaletteActivation,
  deriveCommandPaletteKeyboardIntent,
  deriveCommandPalettePresentationView,
  filterCommands,
  groupByFamily,
  normalizeCommandFamily,
  normalizeCommandPaletteSourceItems,
  normalizePaletteCommand,
  type PaletteCommand,
} from "./commandPaletteCommands";

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
    expect(cmds.find((c) => c.id === "graph:toggle-freeze")?.label).toBe(
      "graph: freeze layout",
    );
    const frozen = buildGraphCommands({
      frozen: true,
      setFrozen: () => undefined,
      resetDefaults: () => undefined,
    });
    expect(frozen.find((c) => c.id === "graph:toggle-freeze")?.label).toBe(
      "graph: unfreeze layout",
    );
  });

  it("freeze toggle inverts the current state through the injected setter", () => {
    let next: boolean | null = null;
    buildGraphCommands({
      frozen: true,
      setFrozen: (f) => {
        next = f;
      },
      resetDefaults: () => undefined,
    })
      .find((c) => c.id === "graph:toggle-freeze")
      ?.run();
    expect(next).toBe(false);
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
    cmds.forEach((c) => c.run());
    expect(set).toEqual(["system", "light", "dark", "high-contrast"]);
  });
});

describe("buildTimelineCommands / buildEditorCommands", () => {
  it("timeline enrolls jump-to-now, fit-to-corpus, and the range presets", () => {
    let jumped = 0;
    let fitted = 0;
    const days: number[] = [];
    const commands = buildTimelineCommands({
      jumpToLive: () => {
        jumped += 1;
      },
      fitToCorpus: () => {
        fitted += 1;
      },
      setRangeDays: (d) => days.push(d),
    });
    expect(commands.map((c) => c.id)).toEqual([
      "timeline:jump-to-now",
      "timeline:fit-to-corpus",
      "timeline:range-1d",
      "timeline:range-7d",
      "timeline:range-30d",
      "timeline:range-90d",
    ]);
    expect(commands.every((c) => c.family === "navigate")).toBe(true);
    commands.find((c) => c.id === "timeline:jump-to-now")?.run();
    commands.find((c) => c.id === "timeline:fit-to-corpus")?.run();
    commands.find((c) => c.id === "timeline:range-30d")?.run();
    expect(jumped).toBe(1);
    expect(fitted).toBe(1);
    expect(days).toEqual([30]);
  });

  it("editor close-document fires the injected effect", () => {
    let closed = 0;
    const commands = buildEditorCommands(() => {
      closed += 1;
    });
    expect(commands.map((c) => c.id)).toEqual(["editor:close-document"]);
    expect(commands[0]?.family).toBe("app");
    commands[0]?.run();
    expect(closed).toBe(1);
  });
});

describe("buildLeftRailCommands", () => {
  it("enrolls new-document, browse modes, facets, collapse, and reset — shared ids", () => {
    const commands = buildLeftRailCommands({
      collapseTree: () => undefined,
      resetFilters: () => undefined,
    });
    expect(commands.map((c) => c.id)).toEqual([
      "left-rail:new-document",
      "left-rail:browse-vault",
      "left-rail:browse-code",
      "left-rail:toggle-facets",
      "left-rail:collapse-tree",
      "left-rail:reset-filters",
    ]);
    const families = new Map(commands.map((c) => [c.id, c.family]));
    expect(families.get("left-rail:new-document")).toBe("app");
    expect(families.get("left-rail:browse-vault")).toBe("navigate");
    expect(families.get("left-rail:toggle-facets")).toBe("filters");
    expect(families.get("left-rail:reset-filters")).toBe("filters");
    // Every palette command must carry a runnable effect (run-only plane).
    expect(commands.every((c) => typeof c.run === "function")).toBe(true);
  });

  it("fires the injected collapse-tree and reset-filters effects", () => {
    let collapsed = 0;
    let reset = 0;
    const commands = buildLeftRailCommands({
      collapseTree: () => {
        collapsed += 1;
      },
      resetFilters: () => {
        reset += 1;
      },
    });
    commands.find((c) => c.id === "left-rail:collapse-tree")?.run();
    commands.find((c) => c.id === "left-rail:reset-filters")?.run();
    expect(collapsed).toBe(1);
    expect(reset).toBe(1);
  });
});

function command(id: string, patch: Partial<PaletteCommand> = {}): PaletteCommand {
  return {
    id,
    label: id,
    family: "app",
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

  it("projects rows, confirm labels, and live copy from one presentation seam", () => {
    const ops = command("ops:rag:reindex", {
      label: "ops: reindex",
      family: "rag",
      confirm: true,
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
      label: "confirm ops: reindex?",
      armed: true,
      confirmShortcutLabel: "⏎ ⏎",
      selectionHintVisible: false,
    });
    expect(view.liveMessage).toBe("1 command. confirm ops: reindex?");
  });

  it("derives activation outcomes for disabled, confirm, and run commands", () => {
    const run = command("nav:state", { label: "go to state", family: "navigate" });
    const disabled = command("app:disabled", { disabled: true });
    const confirm = command("ops:rag:reindex", {
      label: "ops: reindex",
      family: "rag",
      confirm: true,
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
    setIsMacForTesting(null);
  });

  it("derives the inline accelerator from the keymap registry by shared id", () => {
    setIsMacForTesting(false);
    registerKeybindings([
      {
        id: "left-rail:new-document",
        defaultChord: "Mod+Alt+N",
        label: "New document",
        group: "Left rail",
        context: "left-rail",
      },
    ]);
    const [withChord, withoutChord] = deriveCommandAccelerators(
      [
        command("left-rail:new-document", { family: "app" }),
        command("graph:fit", { family: "navigate" }),
      ],
      {},
    );
    expect(withChord.accelerator).toBe("Ctrl+Alt+N");
    expect(withoutChord.accelerator).toBeUndefined();
  });

  it("reflects an effective override over the default chord", () => {
    setIsMacForTesting(false);
    registerKeybindings([
      {
        id: "left-rail:new-document",
        defaultChord: "Mod+Alt+N",
        label: "New document",
        group: "Left rail",
        context: "left-rail",
      },
    ]);
    const [derived] = deriveCommandAccelerators(
      [command("left-rail:new-document", { family: "app" })],
      { "left-rail:new-document": "Mod+Shift+N" },
    );
    expect(derived.accelerator).toBe("Ctrl+Shift+N");
  });
});
