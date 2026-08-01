// Shared app-chrome ActionDescriptor builders: the
// escape hatches — command palette, settings, keyboard shortcuts, reset layout — authored
// ONCE and composed by BOTH the background context menu (app layer) and the command palette
// (stores layer), so the surfaces cannot drift (unified-action-plane). It lives in stores/
// view because it depends only on stores + platform (no app import), mirroring the
// icon-bearing reloadKeybindings builder. Accelerators are DERIVED from the one keymap
// registry (palette-command-accelerators-derive-from-the-keymap-registry), never hand-typed;
// a verb with no bound chord simply renders without one.

import {
  ClipboardCheck,
  Command,
  Crosshair,
  Keyboard,
  Network,
  RotateCcw,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

import { type ActionDescriptor } from "../../platform/actions/action";
import { openAdvancedSettings } from "./advancedConsole";
import { openAgentPanel } from "./agentPanel";
import { chordToKeycaps } from "../../platform/keymap/chord";
import { effectiveChord, getKeybinding } from "../../platform/keymap/registry";
import { COMMAND_PALETTE_ACTION_ID, openCommandPalette } from "./commandPalette";
import { followModeEnabled, toggleFollowMode } from "./selection";
import { getShellCenterSlot, toggleShellGraphSlot } from "./shellLayout";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  openKeyboardShortcuts,
} from "./keyboardShortcuts";
import { getKeymapOverrides } from "./keymapDispatcher";
import { runResetLayout } from "./resetLayoutBridge";
import { openSettingsDialog } from "./settingsDialog";

export const SETTINGS_ACTION_ID = "app:settings";
export const ADVANCED_SETTINGS_ACTION_ID = "app:advanced-settings";
export const RESET_LAYOUT_ACTION_ID = "window:reset-layout";

/** The registry-derived accelerator for an action id, or undefined when unbound. */
function acceleratorFor(id: string): ActionDescriptor["accelerator"] {
  const def = getKeybinding(id);
  if (def === undefined) return undefined;
  const keycaps = chordToKeycaps(effectiveChord(def, getKeymapOverrides()));
  return keycaps.length > 0 ? keycaps : undefined;
}

function withAccelerator(action: ActionDescriptor): ActionDescriptor {
  const accelerator = acceleratorFor(action.id);
  return accelerator ? { ...action, accelerator } : action;
}

/** Open the command palette (Cmd/Ctrl+K). */
export function openCommandPaletteAction(): ActionDescriptor {
  return withAccelerator({
    id: COMMAND_PALETTE_ACTION_ID,
    label: { key: "common:actions.openCommandPalette" },
    section: "navigate",
    icon: Command,
    run: openCommandPalette,
  });
}

/** Open the settings dialog. */
export function openSettingsAction(): ActionDescriptor {
  return withAccelerator({
    id: SETTINGS_ACTION_ID,
    label: { key: "common:actions.openSettings" },
    section: "navigate",
    icon: Settings,
    run: openSettingsDialog,
  });
}

/** Show the keyboard-shortcuts legend (?). */
export function showKeyboardShortcutsAction(): ActionDescriptor {
  return withAccelerator({
    id: KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
    label: { key: "common:actions.showKeyboardShortcuts" },
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
    label: { key: "common:actions.resetLayout" },
    section: "transform",
    icon: RotateCcw,
    run: runResetLayout,
    disabledInTimeTravel: true,
  });
}

export const GRAPH_TOGGLE_ACTION_ID = "window:graph";

/** Give the center slot to the GRAPH (with its tethered timeline), or empty it when
 *  the graph already holds it (agent-panel-shell-integration D1). ONE shared builder
 *  composed by the keymap, the command palette (`buildWindowCommands`), the dock
 *  header's segmented switch, and the background context menu under the single id
 *  `window:graph` (unified-action-plane), so the chord, the legend, and the menu
 *  entry cannot drift; the label reflects the resulting action so it reads the
 *  current state. A layout toggle, not a mutation — not time-travel gated. */
export function toggleGraphAction(): ActionDescriptor {
  return withAccelerator({
    id: GRAPH_TOGGLE_ACTION_ID,
    label: {
      key:
        getShellCenterSlot() === "graph"
          ? "common:actions.hideGraph"
          : "common:actions.showGraph",
    },
    section: "transform",
    icon: Network,
    run: toggleShellGraphSlot,
  });
}

export const FOLLOW_MODE_TOGGLE_ACTION_ID = "view:follow-mode";

/** Toggle FOLLOW MODE (follow-mode-selection-sync): the bidirectional rail<->graph
 *  SELECTION tether (opt-in, default ON). ONE shared builder composed by the
 *  background menu (and reachable from the palette) under one shared id
 *  (unified-action-plane); the label reflects the resulting action so the current
 *  state reads from the verb. A view-local toggle, never a filter — not time-travel
 *  gated. */
export function toggleFollowModeAction(): ActionDescriptor {
  return withAccelerator({
    id: FOLLOW_MODE_TOGGLE_ACTION_ID,
    label: {
      key: followModeEnabled()
        ? "common:actions.disableFollowMode"
        : "common:actions.enableFollowMode",
    },
    section: "transform",
    icon: Crosshair,
    run: toggleFollowMode,
  });
}

/** Open Settings ▸ Advanced with the primary console expanded
 *  (advanced-service-console ADR D7): the ONE verb that replaces the four retired
 *  per-panel toggles the rail-footer cluster used to fire. Every operational
 *  console now lives behind this one destination, so there is one command rather
 *  than four aliases pointing at it (no-deprecation-bridges). A view toggle, not
 *  a mutation — not time-travel gated. */
export function openAdvancedSettingsAction(): ActionDescriptor {
  return withAccelerator({
    id: ADVANCED_SETTINGS_ACTION_ID,
    label: { key: "common:actions.openAdvancedSettings" },
    section: "navigate",
    icon: SlidersHorizontal,
    run: openAdvancedSettings,
  });
}

/** The pending-changes chip's stable action id. The verb opens the Agent panel's
 *  pending-changes view, so it is enrolled on the AGENT plane
 *  (agent-panel-shell-integration D1) — the last trace of the retired Approvals
 *  modal, `panel:approvals`, is retired with the "Review" vocabulary it carried. */
export const AGENT_PENDING_CHANGES_ACTION_ID = "agent:pending-changes";

/** Open the pending-changes inbox (review-surface-flow ADR F1): the SHARED
 *  descriptor for the footer chip and its Cmd+K command. It gives the center slot
 *  to the Agent panel in its pending-changes view — not a modal — so the queue
 *  opens beside the work, never blocking it. */
export function agentPendingChangesAction(): ActionDescriptor {
  return withAccelerator({
    id: AGENT_PENDING_CHANGES_ACTION_ID,
    label: { key: "common:agent.pending.show" },
    section: "navigate",
    icon: ClipboardCheck,
    run: () => openAgentPanel({ view: "pending" }),
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
