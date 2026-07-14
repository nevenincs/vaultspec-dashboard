// @vitest-environment happy-dom
//
// The document command provider (authoring-surface ADR D3): copy-link is enrolled on
// the palette ONLY when a document is open, and under the ONE shared id the vault-doc
// context menu uses (`vault-doc:copy-link`). Importing this module self-registers the
// provider; resolveCommands then reflects its contribution for a given context.

import { afterAll, describe, expect, it } from "vitest";

import {
  resetCommandProviders,
  resolveCommands,
  type CommandContext,
} from "../commandRegistry";
import "./documentCommandProvider";

const noop = () => undefined;

function contextWith(activeDocumentStem: string | null): CommandContext {
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
    activeDocumentStem,
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
  };
}

afterAll(() => resetCommandProviders());

describe("documentCommandProvider", () => {
  it("enrolls copy-link on the palette when a document is open", () => {
    const ids = resolveCommands(contextWith("2026-07-12-x-plan")).map((c) => c.id);
    expect(ids).toContain("vault-doc:copy-link");
  });

  it("withdraws copy-link when no document is open", () => {
    const ids = resolveCommands(contextWith(null)).map((c) => c.id);
    expect(ids).not.toContain("vault-doc:copy-link");
  });
});
