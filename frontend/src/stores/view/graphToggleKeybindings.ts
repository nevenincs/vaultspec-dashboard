// The graph-visibility toggle as ONE shared action on the ONE keymap registry +
// dispatcher (appshell-reframe #11; keyboard-shortcuts-bind-through-the-one-keymap-
// registry). The SAME `toggleGraphAction()` builder is composed by the command
// palette (`buildWindowCommands`), this keybinding, and the background context menu
// under the single id `window:graph` (unified-action-plane), so the displayed verb,
// the chord (legend), and the menu entry cannot drift. A layout toggle — it mutates
// no corpus state, so it carries no confirm guard and is not time-travel gated.

import { useEffect } from "react";

import {
  type KeybindingDef,
  legacyKeybindingPresentation,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { GRAPH_TOGGLE_ACTION_ID, toggleGraphAction } from "./chromeActions";
import { registerKeyAction } from "./keymapDispatcher";

const GRAPH_TOGGLE_GROUP = legacyKeybindingPresentation("Window");

export function deriveGraphToggleKeybindings(): KeybindingDef[] {
  return [
    {
      id: GRAPH_TOGGLE_ACTION_ID,
      // Mod+Shift+G is unbound elsewhere; the chord is rebindable through the
      // engine-owned keybindings override map like every other command shortcut.
      defaultChord: "Mod+Shift+G",
      label: legacyKeybindingPresentation("Toggle graph"),
      group: GRAPH_TOGGLE_GROUP,
      context: "global",
    },
  ];
}

/** Mount the graph-toggle chord (and its legend entry) for the app's lifetime. */
export function useGraphToggleKeybindings(): void {
  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveGraphToggleKeybindings());
    const disposeAction = registerKeyAction(GRAPH_TOGGLE_ACTION_ID, () =>
      toggleGraphAction(),
    );
    return () => {
      disposeAction();
      disposeBindings();
    };
  }, []);
}
