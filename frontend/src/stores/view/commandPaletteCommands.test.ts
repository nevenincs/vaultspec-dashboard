import { describe, expect, it } from "vitest";

import {
  buildCommands,
  buildLeftRailCommands,
  commandPaletteMovedCursor,
  commandPaletteSafeCursor,
  COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS,
  COMMAND_PALETTE_SOURCE_ITEMS_CAP,
  deriveCommandPaletteArmedRepair,
  deriveCommandPaletteActivation,
  deriveCommandPaletteKeyboardIntent,
  deriveCommandPalettePresentationView,
  filterCommands,
  gateCommandsForTimeTravel,
  groupByFamily,
  normalizeCommandFamily,
  normalizeCommandPaletteSourceItems,
  normalizePaletteCommand,
  type PaletteCommand,
} from "./commandPaletteCommands";

function sources(patch: Partial<Parameters<typeof buildCommands>[0]> = {}) {
  const calls: string[] = [];
  return {
    calls,
    input: {
      featureTags: ["state", "timeline"],
      lensNames: ["critical"],
      query: "",
      applyLens: (name: string) => calls.push(`lens:${name}`),
      saveLens: (name: string) => calls.push(`save:${name}`),
      runOp: (target: "core" | "rag", verb: string) =>
        calls.push(`ops:${target}:${verb}`),
      navigate: (nodeId: string) => calls.push(`nav:${nodeId}`),
      openSettings: () => calls.push("settings"),
      ...patch,
    },
  };
}

describe("buildLeftRailCommands", () => {
  it("enrolls new-document, both browse modes, and collapse — reusing the shared ids", () => {
    const commands = buildLeftRailCommands(() => undefined);
    expect(commands.map((c) => c.id)).toEqual([
      "left-rail:new-document",
      "left-rail:browse-vault",
      "left-rail:browse-code",
      "left-rail:collapse-tree",
    ]);
    const families = new Map(commands.map((c) => [c.id, c.family]));
    expect(families.get("left-rail:new-document")).toBe("app");
    expect(families.get("left-rail:browse-vault")).toBe("navigate");
    expect(families.get("left-rail:collapse-tree")).toBe("navigate");
    // Every palette command must carry a runnable effect (run-only plane).
    expect(commands.every((c) => typeof c.run === "function")).toBe(true);
  });

  it("fires the injected collapse-tree effect (the only state-coupled command)", () => {
    let collapsed = 0;
    const commands = buildLeftRailCommands(() => {
      collapsed += 1;
    });
    commands.find((c) => c.id === "left-rail:collapse-tree")?.run();
    expect(collapsed).toBe(1);
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

  it("builds commands from shared sources and gates ops in time travel", () => {
    const { calls, input } = sources({ query: "saved lens" });
    const commands = buildCommands(input);

    expect(commands.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "nav:state",
        "lens:critical",
        "ops:core:vault-check",
        "ops:rag:reindex",
        "app:settings",
        "save-lens:saved lens",
      ]),
    );

    commands.find((item) => item.id === "nav:state")?.run();
    commands.find((item) => item.id === "ops:rag:reindex")?.run();
    commands.find((item) => item.id === "save-lens:saved lens")?.run();
    expect(calls).toEqual(["nav:feature:state", "ops:rag:reindex", "save:saved lens"]);

    expect(
      gateCommandsForTimeTravel(commands, true).some((item) =>
        item.id.startsWith("ops:"),
      ),
    ).toBe(false);
  });

  it("normalizes runtime query values before command assembly", () => {
    const { calls, input } = sources({ query: "  saved lens  " });
    const commands = buildCommands(input);

    expect(commands.map((item) => item.id)).toContain("save-lens:saved lens");

    commands.find((item) => item.id === "save-lens:saved lens")?.run();
    expect(calls).toContain("save:saved lens");

    expect(
      buildCommands(sources({ query: { label: "saved lens" } }).input).some((item) =>
        item.id.startsWith("save-lens:"),
      ),
    ).toBe(false);
  });

  it("normalizes command source lists before creating ids and callbacks", () => {
    const { calls, input } = sources({
      featureTags: [" state ", "", "state", { tag: "bad" }, "timeline"],
      lensNames: [" critical ", "critical", null, "  ", "ops"],
    });
    const commands = buildCommands(input);

    expect(commands.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "nav:state",
        "nav:timeline",
        "lens:critical",
        "lens:ops",
      ]),
    );
    expect(commands.filter((item) => item.id === "nav:state")).toHaveLength(1);
    expect(commands.some((item) => item.id === "nav:")).toBe(false);

    commands.find((item) => item.id === "nav:state")?.run();
    commands.find((item) => item.id === "lens:critical")?.run();
    expect(calls).toEqual(["nav:feature:state", "lens:critical"]);

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
    expect(
      buildCommands(
        sources({
          featureTags: ["x".repeat(COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS + 1)],
          lensNames: ["x".repeat(COMMAND_PALETTE_SOURCE_ITEM_MAX_CHARS + 1)],
        }).input,
      ).some((item) => item.id.startsWith("nav:") || item.id.startsWith("lens:")),
    ).toBe(false);
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
