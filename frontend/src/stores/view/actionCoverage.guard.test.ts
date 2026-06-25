// Action coverage-grid guard (action-surface-mapping ADR, W03.P23). A mechanical
// backstop for the convergence invariant the campaign closes: every verb that is
// eligible for more than one plane is enrolled under ONE shared action id, so its
// inline accelerator and the `?` legend derive correctly and cannot drift. It asserts:
//   1. every dual-plane (keymap + palette) verb appears in the resolved palette command
//      list under its SHARED keymap action-id constant (cross-plane id identity), and
//   2. the campaign's delta verbs (focus/clear filter, right-rail focus-search) are
//      present, and the right-rail entity kinds (commit, pull-request) each have a
//      resolver.
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
  RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID,
  deriveRightRailKeybindings,
} from "./rightRailKeybindings";
import {
  RELOAD_REFRESH_DATA_ACTION_ID,
  deriveReloadKeybindings,
} from "./reloadKeybindings";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
} from "./keyboardShortcuts";

// Register the command providers and the right-rail resolvers under test (side effects).
import "./commandProviders/leftRailCommandProvider";
import "./commandProviders/rightRailCommandProvider";
import "./commandProviders/reloadCommandProvider";
import "./commandProviders/windowCommandProvider";
import "../../app/right/menus/commitMenu";
import "../../app/right/menus/prMenu";

/** Verbs eligible for BOTH the keymap and the palette: their keymap action id MUST
 *  equal the palette command id (so accelerators derive). The keymap ids are the
 *  source-of-truth constants; the palette providers must emit commands under them. */
const DUAL_PLANE_VERBS = [
  LEFT_RAIL_NEW_DOC_ACTION_ID,
  LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
  LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
  LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
  LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
  LEFT_RAIL_RESET_FILTERS_ACTION_ID,
  RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID,
  RELOAD_REFRESH_DATA_ACTION_ID,
  // The keyboard-shortcuts legend: keymap (?) + palette (window provider, help family),
  // converged onto one id so its accelerator derives across both planes + the background
  // context menu (background-context-menus drift fix).
  KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
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
      ...deriveRightRailKeybindings(),
      ...deriveReloadKeybindings(),
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

  it("the campaign's delta verbs are present in the palette", () => {
    expect(paletteIds.has(LEFT_RAIL_FOCUS_FILTER_ACTION_ID)).toBe(true);
    expect(paletteIds.has(LEFT_RAIL_CLEAR_FILTER_ACTION_ID)).toBe(true);
    expect(paletteIds.has(RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID)).toBe(true);
  });

  it("the right-rail entity kinds each have a resolver (commit + pull-request)", () => {
    expect(hasResolver("commit")).toBe(true);
    expect(hasResolver("pull-request")).toBe(true);
  });
});
