// Command-provider registry units (command-palette-providers ADR, W01.P01):
// registration + disposer, per-provider and total bounds, the central time-travel
// gate, id de-duplication, defensive normalization, and the throwing-provider
// degradation. The registry is the one host the palette consumes, so its gating and
// bounds are tested here rather than re-derived per provider.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COMMAND_PROVIDERS_CAP,
  COMMANDS_PER_PROVIDER_CAP,
  RESOLVED_COMMANDS_CAP,
  normalizeCommandDescriptor,
  registerCommandProvider,
  resolveCommands,
  resetCommandProviders,
  type CommandContext,
} from "./commandRegistry";

function ctx(overrides: Partial<CommandContext> = {}): CommandContext {
  const noop = () => undefined;
  return {
    scope: "all",
    timeTravel: false,
    keybindingOverrides: {},
    graphFrozen: false,
    openControlPanel: null,
    shell: {
      leftRailVisible: true,
      leftCollapsed: false,
      rightCollapsed: false,
      timelineVisible: true,
      graphVisible: true,
    },
    intents: {
      collapseTree: noop,
      resetFilters: noop,
      clearFeatureFilter: noop,
      clearProjectHistory: noop,
      setTheme: noop,
      runOp: noop,
      closeDocument: noop,
      closeAllDocuments: noop,
      reloadActiveDocument: noop,
      keepActiveDocumentOpen: noop,
      setGraphFrozen: noop,
      jumpToLive: noop,
      fitTimelineToCorpus: noop,
      setTimelineRangeDays: noop,
      clearDateRange: noop,
      toggleLeftRail: noop,
      toggleLeftCollapsed: noop,
      toggleRightRail: noop,
      toggleTimeline: noop,
      toggleGraph: noop,
      setRightTab: noop,
      resetLayout: noop,
      showKeyboardShortcuts: noop,
    },
    ...overrides,
  };
}

const cmd = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  label: { key: "common:actions.copy" },
  family: "app" as const,
  run: () => undefined,
  ...extra,
});

afterEach(() => resetCommandProviders());

describe("normalizeCommandDescriptor", () => {
  it("accepts a runnable descriptor with a known family", () => {
    const command = normalizeCommandDescriptor(cmd("a:b"));
    expect(command).not.toBeNull();
    expect(command?.family).toBe("app");
  });

  it("rejects an unknown family", () => {
    expect(normalizeCommandDescriptor(cmd("a", { family: "bogus" }))).toBeNull();
  });

  it("rejects a descriptor with no run", () => {
    expect(
      normalizeCommandDescriptor({
        id: "a",
        label: { key: "common:actions.copy" },
        family: "app",
      }),
    ).toBeNull();
  });

  it("rejects a dispatch-only descriptor (palette is store-only run)", () => {
    expect(
      normalizeCommandDescriptor({
        id: "a",
        label: { key: "common:actions.copy" },
        family: "app",
        dispatch: { type: "x" },
      }),
    ).toBeNull();
  });
});

describe("registerCommandProvider", () => {
  it("registers a provider and resolves its commands", () => {
    registerCommandProvider("p1", () => [cmd("p1:one"), cmd("p1:two")]);
    const ids = resolveCommands(ctx()).map((c) => c.id);
    expect(ids).toEqual(["p1:one", "p1:two"]);
  });

  it("disposer removes the provider", () => {
    const dispose = registerCommandProvider("p1", () => [cmd("p1:one")]);
    dispose();
    expect(resolveCommands(ctx())).toEqual([]);
  });

  it("a second registration under the same id replaces the first", () => {
    registerCommandProvider("p1", () => [cmd("old")]);
    registerCommandProvider("p1", () => [cmd("new")]);
    expect(resolveCommands(ctx()).map((c) => c.id)).toEqual(["new"]);
  });

  it("ignores registration past the provider cap", () => {
    for (let i = 0; i < COMMAND_PROVIDERS_CAP; i += 1) {
      registerCommandProvider(`p${i}`, () => [cmd(`p${i}:c`)]);
    }
    const dispose = registerCommandProvider("overflow", () => [cmd("overflow:c")]);
    expect(resolveCommands(ctx()).some((c) => c.id === "overflow:c")).toBe(false);
    dispose();
  });
});

describe("resolveCommands gating and bounds", () => {
  it("removes disabledInTimeTravel commands in time-travel mode", () => {
    registerCommandProvider("p1", () => [
      cmd("safe"),
      cmd("mutating", { disabledInTimeTravel: true }),
    ]);
    expect(resolveCommands(ctx({ timeTravel: true })).map((c) => c.id)).toEqual([
      "safe",
    ]);
    expect(resolveCommands(ctx({ timeTravel: false })).map((c) => c.id)).toEqual([
      "safe",
      "mutating",
    ]);
  });

  it("de-duplicates by id across providers (first wins)", () => {
    registerCommandProvider("p1", () => [
      cmd("dup", { label: { key: "common:actions.copy" } }),
    ]);
    registerCommandProvider("p2", () => [
      cmd("dup", { label: { key: "common:actions.close" } }),
    ]);
    const resolved = resolveCommands(ctx());
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.label).toEqual({ key: "common:actions.copy" });
  });

  it("caps a single provider's contribution", () => {
    registerCommandProvider("p1", () =>
      Array.from({ length: COMMANDS_PER_PROVIDER_CAP + 50 }, (_, i) => cmd(`p1:${i}`)),
    );
    expect(resolveCommands(ctx())).toHaveLength(COMMANDS_PER_PROVIDER_CAP);
  });

  it("bounds the total resolved list", () => {
    const perProvider = COMMANDS_PER_PROVIDER_CAP;
    const needed = Math.ceil(RESOLVED_COMMANDS_CAP / perProvider) + 2;
    for (let p = 0; p < needed; p += 1) {
      registerCommandProvider(`p${p}`, () =>
        Array.from({ length: perProvider }, (_, i) => cmd(`p${p}:${i}`)),
      );
    }
    expect(resolveCommands(ctx())).toHaveLength(RESOLVED_COMMANDS_CAP);
  });

  it("a throwing provider degrades to no commands without breaking the plane", () => {
    registerCommandProvider("bad", () => {
      throw new Error("boom");
    });
    registerCommandProvider("good", () => [cmd("good:c")]);
    expect(resolveCommands(ctx()).map((c) => c.id)).toEqual(["good:c"]);
  });

  it("passes the context through to providers", () => {
    const provider = vi.fn(() => [cmd("c")]);
    registerCommandProvider("p1", provider);
    const context = ctx({ scope: "feat/x" });
    resolveCommands(context);
    expect(provider).toHaveBeenCalledWith(context);
  });
});
