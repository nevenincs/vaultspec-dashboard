// Backend verb-feed provider units (command-palette-actions ADR, W03.P09): the ops
// provider (whitelisted core/rag verbs + open-settings) and the settings provider (theme
// quick-toggles). Each is a pure function of the injected CommandContext. The reload
// provider has its own home in reloadCommandProvider.test.ts.

import { describe, expect, it } from "vitest";

import type { CommandContext } from "../commandRegistry";
import { opsCommandProvider } from "./opsCommandProvider";
import { settingsCommandProvider } from "./settingsCommandProvider";

type RawCommand = {
  id?: string;
  label?: string;
  family?: string;
  confirm?: boolean;
  disabledInTimeTravel?: boolean;
  run?: () => void;
};

function commandContext(over: Partial<CommandContext> = {}): CommandContext {
  const noop = () => undefined;
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
      graphVisible: true,
    },
    intents: {
      collapseTree: noop,
      resetFilters: noop,
      clearFeatureFilter: noop,
      focusRightRailSearch: noop,
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
    ...over,
  };
}

const rows = (
  provider: (ctx: CommandContext) => readonly unknown[],
  ctx: CommandContext,
) => provider(ctx).map((c) => c as RawCommand);

describe("opsCommandProvider", () => {
  it("contributes the whitelisted core/rag verbs as confirm-guarded, gated commands", () => {
    const out = rows(opsCommandProvider, commandContext());
    const ids = out.map((c) => c.id);
    expect(ids).toContain("ops:core:vault-check");
    expect(ids).toContain("ops:rag:reindex");
    const reindex = out.find((c) => c.id === "ops:rag:reindex");
    expect(reindex?.confirm).toBe(true);
    expect(reindex?.disabledInTimeTravel).toBe(true);
    expect(reindex?.family).toBe("rag");
  });

  it("routes a verb through the injected runOp intent", () => {
    const calls: string[] = [];
    const out = rows(
      opsCommandProvider,
      commandContext({
        intents: {
          ...commandContext().intents,
          runOp: (target, verb) => calls.push(`${target}:${verb}`),
        },
      }),
    );
    out.find((c) => c.id === "ops:rag:reindex")?.run?.();
    expect(calls).toEqual(["rag:reindex"]);
  });

  it("contributes the open-settings app command (composed from the shared builder)", () => {
    const settings = rows(opsCommandProvider, commandContext()).find(
      (c) => c.id === "app:settings",
    );
    expect(settings?.family).toBe("app");
    // Composed from the shared `openSettingsAction` builder (unified-action-plane).
    expect(settings?.label).toBe("Settings…");
  });
});

describe("settingsCommandProvider", () => {
  it("offers the four theme quick-toggles, each firing the injected setter", () => {
    const set: string[] = [];
    const out = rows(
      settingsCommandProvider,
      commandContext({
        intents: { ...commandContext().intents, setTheme: (v) => set.push(v) },
      }),
    );
    expect(out.map((c) => c.id)).toEqual([
      "settings:theme-system",
      "settings:theme-light",
      "settings:theme-dark",
      "settings:theme-high-contrast",
    ]);
    out.forEach((c) => c.run?.());
    expect(set).toEqual(["system", "light", "dark", "high-contrast"]);
  });
});
