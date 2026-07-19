// Shared app-chrome ActionDescriptor builders (background-context-menus ADR D3): the
// escape hatches — command palette, settings, keyboard shortcuts, reset layout — authored
// ONCE and composed by BOTH the background context menu (app layer) and the command palette
// (stores layer), so the surfaces cannot drift (unified-action-plane). It lives in stores/
// view because it depends only on stores + platform (no app import), mirroring the
// icon-bearing reloadKeybindings builder. Accelerators are DERIVED from the one keymap
// registry (palette-command-accelerators-derive-from-the-keymap-registry), never hand-typed;
// a verb with no bound chord simply renders without one.

import {
  Activity,
  ClipboardCheck,
  Command,
  Crosshair,
  Keyboard,
  Network,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { type ActionDescriptor, type ActionIcon } from "../../platform/actions/action";
import {
  CONTROL_PANEL_IDS,
  toggleControlPanel,
  type ControlPanelId,
  type FooterChipId,
} from "./controlPanels";
import { openAgentPanel } from "./agentPanel";
import { chordToKeycaps } from "../../platform/keymap/chord";
import { effectiveChord, getKeybinding } from "../../platform/keymap/registry";
import { COMMAND_PALETTE_ACTION_ID, openCommandPalette } from "./commandPalette";
import { followModeEnabled, toggleFollowMode } from "./selection";
import { getShellGraphVisible, toggleShellGraphVisible } from "./shellLayout";
import {
  KEYBOARD_SHORTCUTS_TOGGLE_ACTION_ID,
  openKeyboardShortcuts,
} from "./keyboardShortcuts";
import { getKeymapOverrides } from "./keymapDispatcher";
import { runResetLayout } from "./resetLayoutBridge";
import { openSettingsDialog } from "./settingsDialog";
import { CONTROL_PANEL_VOCABULARY } from "./controlPanelVocabulary";

export const SETTINGS_ACTION_ID = "app:settings";
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

/** Toggle the GRAPH (with its tethered timeline) in the center (appshell-reframe
 *  #11). ONE shared builder composed by the keymap, the command palette
 *  (`buildWindowCommands`), and the background context menu under the single id
 *  `window:graph` (unified-action-plane), so the chord, the legend, and the menu
 *  entry cannot drift; the label reflects the resulting action so it reads the
 *  current state. A layout toggle, not a mutation — not time-travel gated. */
export function toggleGraphAction(): ActionDescriptor {
  return withAccelerator({
    id: GRAPH_TOGGLE_ACTION_ID,
    label: {
      key: getShellGraphVisible()
        ? "common:actions.hideGraph"
        : "common:actions.showGraph",
    },
    section: "transform",
    icon: Network,
    run: toggleShellGraphVisible,
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

/** The stable action id per control panel (activity-rail-realignment D4). The chip,
 *  the palette command, and the keymap accelerator all resolve under this one id. */
export const CONTROL_PANEL_ACTION_IDS: Record<ControlPanelId, string> = {
  "search-service": "panel:search-service",
  "backend-health": "panel:backend-health",
  "vault-health": "panel:vault-health",
};

const CONTROL_PANEL_ACTION_ICONS: Record<ControlPanelId, ActionIcon> = {
  "search-service": Search,
  "backend-health": Activity,
  "vault-health": ShieldCheck,
};

/** The review chip's stable action id (review-surface-flow ADR F1). PRESERVED from
 *  the retired Approvals modal so keymap + command-palette enrollment carries over
 *  unchanged — one descriptor, one id — even though the verb now opens the Agent
 *  panel's pending-changes view rather than a modal. */
export const REVIEW_INBOX_ACTION_ID = "panel:approvals";

/** Toggle one framework control panel (activity-rail-realignment D4): ONE shared
 *  descriptor per panel under a single id, composed by the rail-footer chip, the
 *  command palette, and the keymap — no bespoke per-surface handler. The panels are
 *  session-transient dialogs (settings-dialog idiom), so this is a view toggle, not
 *  a mutation — not time-travel gated. */
export function controlPanelToggleAction(
  id: ControlPanelId,
  openControlPanel: ControlPanelId | null,
): ActionDescriptor {
  const vocabulary = CONTROL_PANEL_VOCABULARY[id];
  return withAccelerator({
    id: CONTROL_PANEL_ACTION_IDS[id],
    label: openControlPanel === id ? vocabulary.hideLabel : vocabulary.showLabel,
    section: "navigate",
    icon: CONTROL_PANEL_ACTION_ICONS[id],
    run: () => toggleControlPanel(id),
  });
}

/** Every modal control-panel toggle descriptor, in cluster order. */
export function controlPanelActions(
  openControlPanel: ControlPanelId | null,
): ActionDescriptor[] {
  return CONTROL_PANEL_IDS.map((id) => controlPanelToggleAction(id, openControlPanel));
}

/** Open the review inbox (review-surface-flow ADR F1): the SHARED descriptor for the
 *  footer Review chip and its Cmd+K command, under the preserved `panel:approvals`
 *  id. It opens the Agent panel's pending-changes view — not a modal — so the queue
 *  opens beside the work, never blocking it. Its label + count source stay the
 *  retired panel's vocabulary (the chip's identity is preserved, its host is not). */
export function reviewInboxAction(): ActionDescriptor {
  return withAccelerator({
    id: REVIEW_INBOX_ACTION_ID,
    label: CONTROL_PANEL_VOCABULARY.approvals.showLabel,
    section: "navigate",
    icon: ClipboardCheck,
    run: () => openAgentPanel({ view: "pending" }),
  });
}

/** The ONE shared descriptor for a rail-footer status chip, dispatched by id: the
 *  two panel-backed chips fire their modal toggle; the review chip opens the Agent
 *  panel's pending view. Composed identically by the footer cluster and the command
 *  palette so no chip can drift (actions-keymap-palette). */
export function footerChipAction(
  id: FooterChipId,
  openControlPanel: ControlPanelId | null,
): ActionDescriptor {
  return id === "approvals"
    ? reviewInboxAction()
    : controlPanelToggleAction(id, openControlPanel);
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
