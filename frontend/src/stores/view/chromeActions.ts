// Shared app-chrome ActionDescriptor builders (background-context-menus ADR D3): the
// escape hatches — command palette, settings, keyboard shortcuts, reset layout — authored
// ONCE and composed by BOTH the background context menu (app layer) and the command palette
// (stores layer), so the surfaces cannot drift (unified-action-plane). It lives in stores/
// view because it depends only on stores + platform (no app import), mirroring the
// icon-bearing reloadKeybindings builder. Accelerators are DERIVED from the one keymap
// registry (palette-command-accelerators-derive-from-the-keymap-registry), never hand-typed;
// a verb with no bound chord simply renders without one.

import { Command, Keyboard, RotateCcw, Settings } from "lucide-react";

import type { ActionDescriptor } from "../../platform/actions/action";
import { chordToKeycaps } from "../../platform/keymap/chord";
import { effectiveChord, getKeybinding } from "../../platform/keymap/registry";
import { COMMAND_PALETTE_ACTION_ID, openCommandPalette } from "./commandPalette";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  openKeyboardShortcuts,
} from "./keyboardShortcuts";
import { getKeymapOverrides } from "./keymapDispatcher";
import { runResetLayout } from "./resetLayoutBridge";
import { openSettingsDialog } from "./settingsDialog";

export const SETTINGS_ACTION_ID = "app:settings";
export const RESET_LAYOUT_ACTION_ID = "window:reset-layout";

/** The registry-derived accelerator for an action id, or undefined when unbound. */
function acceleratorFor(id: string): string | undefined {
  const def = getKeybinding(id);
  if (def === undefined) return undefined;
  const label = chordToKeycaps(effectiveChord(def, getKeymapOverrides())).join("+");
  return label.length > 0 ? label : undefined;
}

function withAccelerator(action: ActionDescriptor): ActionDescriptor {
  const accelerator = acceleratorFor(action.id);
  return accelerator ? { ...action, accelerator } : action;
}

/** Open the command palette (Cmd/Ctrl+K). */
export function openCommandPaletteAction(): ActionDescriptor {
  return withAccelerator({
    id: COMMAND_PALETTE_ACTION_ID,
    label: "Command palette…",
    section: "navigate",
    icon: Command,
    run: openCommandPalette,
  });
}

/** Open the settings dialog. */
export function openSettingsAction(): ActionDescriptor {
  return withAccelerator({
    id: SETTINGS_ACTION_ID,
    label: "Settings…",
    section: "navigate",
    icon: Settings,
    run: openSettingsDialog,
  });
}

/** Show the keyboard-shortcuts legend (?). */
export function showKeyboardShortcutsAction(): ActionDescriptor {
  return withAccelerator({
    id: KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
    label: "Keyboard shortcuts",
    section: "navigate",
    icon: Keyboard,
    run: openKeyboardShortcuts,
  });
}

/** Reset the shell layout to defaults via the FULL reset (the same one the palette's
 *  `window:reset-layout` runs — resetShellLayout PLUS the dashboard panel collapse/right-tab
 *  resets), through the shell-registered bridge. A layout MUTATION, so it is time-travel
 *  gated. */
export function resetLayoutAction(): ActionDescriptor {
  return withAccelerator({
    id: RESET_LAYOUT_ACTION_ID,
    label: "Reset layout",
    section: "transform",
    icon: RotateCcw,
    run: runResetLayout,
    disabledInTimeTravel: true,
  });
}

/** The full app-chrome escape-hatch set, in menu order. */
export function chromeEscapeHatchActions(): ActionDescriptor[] {
  return [
    openCommandPaletteAction(),
    openSettingsAction(),
    showKeyboardShortcutsAction(),
    resetLayoutAction(),
  ];
}
