// Reload provider unit (global-context-actions): the client-side Refresh command is a
// pure function of the injected CommandContext, composing the SHARED refreshDataAction
// builder under the reload family. The cross-plane id identity (palette + keymap + tail)
// is enforced separately by actionCoverage.guard.test.ts.

import { describe, expect, it } from "vitest";

import { RELOAD_REFRESH_DATA_ACTION_ID } from "../reloadKeybindings";
import type { CommandContext } from "../commandRegistry";
import { reloadCommandProvider } from "./reloadCommandProvider";

type RawCommand = { id?: string; label?: string; family?: string; run?: () => void };

function commandContext(): CommandContext {
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

describe("reloadCommandProvider", () => {
  it("contributes the shared Refresh command under the reload family", () => {
    const out = reloadCommandProvider(commandContext()).map((c) => c as RawCommand);
    expect(out.map((c) => c.id)).toEqual([RELOAD_REFRESH_DATA_ACTION_ID]);
    expect(out[0]?.family).toBe("reload");
    expect(typeof out[0]?.run).toBe("function");
  });
});
