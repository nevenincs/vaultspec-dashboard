// Action coverage-grid guard (action-surface-mapping ADR). A mechanical
// backstop for the convergence invariant: every verb that is
// eligible for more than one plane is enrolled under ONE shared action id, so its
// inline accelerator and the `?` legend derive correctly and cannot drift. It asserts:
//   1. every dual-plane (keymap + palette) verb appears in the resolved palette command
//      list under its SHARED keymap action-id constant (cross-plane id identity), and
//   2. the delta verbs (focus/clear filter) are present, and the
//      right-rail entity kinds (commit, pull-request) each have a resolver.
// If a future change renames a verb on one plane but not the other, the shared-id
// assertion fails here rather than silently breaking accelerator derivation.

import { afterAll, describe, expect, it } from "vitest";

import { hasResolver, resetResolvers } from "../../platform/actions/registry";
import {
  resetCommandProviders,
  resolveCommands,
  type CommandContext,
} from "./commandRegistry";
import {
  LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
  LEFT_RAIL_NEW_DOC_ACTION_ID,
  LEFT_RAIL_RESET_FILTERS_ACTION_ID,
  LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
  deriveLeftRailKeybindings,
} from "./leftRailKeybindings";
import {
  PROJECT_BROWSE_ACTION_ID,
  PROJECT_OPEN_ACTION_ID,
  deriveProjectKeybindings,
} from "./projectActions";
import { deriveRightRailKeybindings } from "./rightRailKeybindings";
import {
  RELOAD_REFRESH_DATA_ACTION_ID,
  deriveReloadKeybindings,
} from "./reloadKeybindings";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
} from "./keyboardShortcuts";
import {
  AGENT_PENDING_CHANGES_ACTION_ID,
  ADVANCED_SETTINGS_ACTION_ID,
  GRAPH_TOGGLE_ACTION_ID,
} from "./chromeActions";
import { deriveGraphToggleKeybindings } from "./graphToggleKeybindings";
import {
  AGENT_NEW_SESSION_ACTION_ID,
  AGENT_TOGGLE_PANEL_ACTION_ID,
  deriveAgentKeybindings,
} from "./agentActions";

// Register the command providers and the right-rail resolvers under test (side effects).
import "./commandProviders/leftRailCommandProvider";
import "./commandProviders/projectCommandProvider";
import "./commandProviders/reloadCommandProvider";
import "./commandProviders/windowCommandProvider";
import "./commandProviders/advancedConsoleCommandProvider";
import "./commandProviders/agentCommandProvider";
import "../../app/right/menus/commitMenu";
import "../../app/right/menus/prMenu";
import "../../app/stage/menus/docTabMenu";

/** Verbs eligible for BOTH the keymap and the palette: their keymap action id MUST
 *  equal the palette command id (so accelerators derive). The keymap ids are the
 *  source-of-truth constants; the palette providers must emit commands under them. */
const DUAL_PLANE_VERBS = [
  LEFT_RAIL_NEW_DOC_ACTION_ID,
  // The "Project" command group: Open (Mod+Alt+O) and Browse-or-Switch (Mod+Alt+P)
  // are keymap + palette under one shared id (the single projectCommandProvider).
  // Clear History is palette-only, so it is not a dual-plane verb.
  PROJECT_OPEN_ACTION_ID,
  PROJECT_BROWSE_ACTION_ID,
  LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
  LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
  LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_RESET_FILTERS_ACTION_ID,
  RELOAD_REFRESH_DATA_ACTION_ID,
  // The keyboard-shortcuts legend: keymap (?) + palette (window provider, help family),
  // converged onto one id so its accelerator derives across both planes + the background
  // context menu (background-context-menus drift fix).
  KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  // The graph-visibility toggle (appshell-reframe #11): keymap (Mod+Shift+G) +
  // palette (window provider) + background context menu, one shared id.
  GRAPH_TOGGLE_ACTION_ID,
  // The agent-panel toggle: keymap (Mod+Alt+A), palette, background menu, and
  // footer chip all share one action id.
  AGENT_TOGGLE_PANEL_ACTION_ID,
];

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
  };
}

afterAll(() => {
  resetCommandProviders();
  resetResolvers();
});

describe("action coverage grid guard", () => {
  const paletteIds = new Set(resolveCommands(commandContext()).map((c) => c.id));
  // The keymap SIDE of the identity: the action ids the keymap registry declares for
  // these surfaces. A dual-plane verb must appear under the SAME id in BOTH sets.
  const keymapIds = new Set(
    [
      ...deriveLeftRailKeybindings(),
      ...deriveProjectKeybindings(),
      ...deriveRightRailKeybindings(),
      ...deriveReloadKeybindings(),
      ...deriveGraphToggleKeybindings(),
      ...deriveAgentKeybindings(),
      KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
    ].map((b) => b.id),
  );

  it("every dual-plane verb is enrolled on BOTH the keymap and the palette under one id", () => {
    const missingFromKeymap = DUAL_PLANE_VERBS.filter((id) => !keymapIds.has(id));
    const missingFromPalette = DUAL_PLANE_VERBS.filter((id) => !paletteIds.has(id));
    // Cross-plane id identity: the same id resolves on both planes, so a rename on one
    // plane (a hand-typed id/binding) that does not move the other is caught here.
    expect({ missingFromKeymap, missingFromPalette }).toEqual({
      missingFromKeymap: [],
      missingFromPalette: [],
    });
  });

  it("the delta verbs (focus/clear filter) are present in the palette", () => {
    expect(paletteIds.has(LEFT_RAIL_FOCUS_FILTER_ACTION_ID)).toBe(true);
    expect(paletteIds.has(LEFT_RAIL_CLEAR_FILTER_ACTION_ID)).toBe(true);
  });

  it("the right-rail entity kinds each have a resolver (commit + pull-request)", () => {
    expect(hasResolver("commit")).toBe(true);
    expect(hasResolver("pull-request")).toBe(true);
  });

  it("the document-tab entity kind has a layered resolver (#15)", () => {
    expect(hasResolver("doc-tab")).toBe(true);
  });

  it("the Advanced console and the pending inbox are enrolled under their shared ids", () => {
    // advanced-service-console ADR D2/D7: the four retired per-panel toggles
    // collapsed into ONE destination — no alias command may reappear beside it —
    // and the pending-changes inbox stays enrolled on the AGENT plane because it
    // opens the Agent panel's pending view rather than a modal.
    expect(paletteIds.has(ADVANCED_SETTINGS_ACTION_ID)).toBe(true);
    expect(paletteIds.has(AGENT_PENDING_CHANGES_ACTION_ID)).toBe(true);
    for (const retired of [
      "panel:search-service",
      "panel:backend-health",
      "panel:vault-health",
      "panel:agent-service",
    ]) {
      expect(paletteIds.has(retired)).toBe(false);
    }
  });

  it("the always-available agent verbs resolve in the palette under their shared ids", () => {
    // toggle-panel (dual-plane, asserted above) and new-session are always offered;
    // stop-run is eligibility-gated (present only with a stoppable run) so it is
    // correctly absent here with no active run — a deliberate non-lie, not a gap.
    expect(paletteIds.has(AGENT_TOGGLE_PANEL_ACTION_ID)).toBe(true);
    expect(paletteIds.has(AGENT_NEW_SESSION_ACTION_ID)).toBe(true);
  });
});
