// Shared test-support: the FULL default keybinding set (keyboard-shortcut-conflict-review).
//
// Both keymap guards — `defaultKeybindingConflicts.guard.test.ts` (same-specificity conflict
// freedom) and `reservedKeybindingDenylist.guard.test.ts` (no browser/OS-reserved default) —
// must reason over the exact same assembled default set. This module is the ONE assembly they
// both import, so a new binding source added here covers both guards at once; a source added to
// one guard's private copy but not the other used to silently under-cover a guard. It is
// test-support only (imported solely by `*.guard.test.ts`), which is why it may reach across the
// stores→app boundary the guard tests already cross.
//
// Kept in lockstep with the `registerKeybindings` call sites: a new source registered at app
// init without a line here under-covers BOTH guards, so this list is the coverage contract.

import type { KeybindingDef } from "../../platform/keymap/registry";

// Every binding source registered at app init (each `registerKeybindings` call site).
import {
  COMMAND_PALETTE_KEYBINDING,
  DOCUMENT_SEARCH_KEYBINDING,
  SEARCH_PALETTE_KEYBINDING,
} from "./commandPalette";
import { deriveAgentKeybindings } from "./agentActions";
import { deriveDocTabKeybindings } from "./docTabKeybindings";
import { deriveEditorKeybindings } from "./editorKeybindings";
import { deriveGraphToggleKeybindings } from "./graphToggleKeybindings";
import { KEYBOARD_NAVIGATION_BINDINGS } from "./keyboardNavigation";
import { KEYBOARD_SHORTCUTS_TOGGLE_BINDING } from "./keyboardShortcuts";
import { deriveLeftRailKeybindings } from "./leftRailKeybindings";
import { deriveProjectKeybindings } from "./projectActions";
import { deriveReloadKeybindings } from "./reloadKeybindings";
import { deriveRightRailKeybindings } from "./rightRailKeybindings";
import { WORKING_SET_KEYBINDINGS } from "./workingSet";
import { deriveRegionCycleKeybindings } from "../../app/chrome/regionCycleKeybindings";
import { GRAPH_WALK_KEYBINDING_DEFS } from "../../app/stage/graphWalkKeybindings";

/** The full default keybinding set: every source that self-registers at app init. */
export function assembleDefaultKeybindings(): KeybindingDef[] {
  return [
    COMMAND_PALETTE_KEYBINDING,
    SEARCH_PALETTE_KEYBINDING,
    DOCUMENT_SEARCH_KEYBINDING,
    KEYBOARD_SHORTCUTS_TOGGLE_BINDING,
    ...deriveAgentKeybindings(),
    ...deriveDocTabKeybindings(),
    ...deriveEditorKeybindings(),
    ...deriveGraphToggleKeybindings(),
    ...KEYBOARD_NAVIGATION_BINDINGS,
    ...deriveLeftRailKeybindings(),
    ...deriveProjectKeybindings(),
    ...deriveReloadKeybindings(),
    ...deriveRightRailKeybindings(),
    ...WORKING_SET_KEYBINDINGS,
    ...deriveRegionCycleKeybindings(),
    ...GRAPH_WALK_KEYBINDING_DEFS,
  ];
}
