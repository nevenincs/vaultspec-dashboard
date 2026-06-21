// Corpus-fence structural guard (command-palette-providers ADR W01.P03). The command
// plane must carry only real app verbs — never transient vault vocabulary enrolled as
// a standing command. This test registers every shipped command provider and asserts
// that the resolved command list contains NO corpus-derived standing command (a
// per-feature `nav:<tag>` / `archive:<tag>`, a per-lens `lens:<name>`, or a
// `save-lens:` entry). Corpus navigation lives only in the document-search plane.
//
// Mirrors the filter-consolidation structural guard: a mechanical backstop so the
// fence cannot silently regress when a new provider is added.

import { afterAll, describe, expect, it } from "vitest";

import {
  resetCommandProviders,
  resolveCommands,
  type CommandContext,
} from "./commandRegistry";

// Register every shipped provider by importing its module for side effects.
import "./commandProviders/windowCommandProvider";
import "./commandProviders/leftRailCommandProvider";
import "./commandProviders/graphCommandProvider";
import "./commandProviders/timelineCommandProvider";
import "./commandProviders/editorCommandProvider";
import "./commandProviders/settingsCommandProvider";
import "./commandProviders/opsCommandProvider";

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

/** Id prefixes that denote a corpus-derived standing command. The command plane
 *  must never contain one — these belong to the document-search / filters surfaces. */
const CORPUS_ID_PREFIXES = ["nav:", "archive:", "lens:", "save-lens:"];

// The provider modules above self-register at import; clean up after this suite so
// other test files start from an empty registry.
afterAll(() => resetCommandProviders());

describe("command plane corpus fence", () => {
  const commands = resolveCommands(commandContext());

  it("registers providers that actually contribute commands", () => {
    expect(commands.length).toBeGreaterThan(0);
  });

  it("contains no corpus-derived standing command", () => {
    const offenders = commands
      .map((command) => command.id)
      .filter((id) => CORPUS_ID_PREFIXES.some((prefix) => id.startsWith(prefix)));
    expect(offenders).toEqual([]);
  });
});
