// The light Refresh as ONE shared action on the ONE keymap registry + dispatcher
// (global-context-actions ADR D4; keyboard-shortcuts-bind-through-the-one-keymap-
// registry). Refresh re-fetches the active scope's engine data by invalidating the
// TanStack query cache; it mutates nothing, so it carries no confirm guard and is not
// time-travel gated. The SAME `refreshDataAction()` builder is composed by the reload
// palette provider, this keybinding, and the context-menu global tail (unified-action-
// plane), so the displayed verb, the chord, and the tail entry cannot drift.

import { useEffect } from "react";

import { RefreshCw } from "lucide-react";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { refreshAllEngineQueries } from "../server/queries";
import { registerKeyAction } from "./keymapDispatcher";

export const RELOAD_REFRESH_DATA_ACTION_ID = "reload:refresh-data";
export const RELOAD_REFRESH_DATA_LABEL = "Refresh data";

/**
 * The light refresh as one shared `ActionDescriptor`: invalidate + refetch the active
 * scope's engine queries (the proven `refreshAllEngineQueries` sweep). Section-agnostic
 * by design — the palette groups by `family`, the keymap fires the `run`, and the
 * context-menu global tail (the only consumer that renders a section) assigns
 * `section: "global"` itself, so this builder carries no vestigial menu metadata.
 */
export function refreshDataAction(): ActionDescriptor {
  return {
    id: RELOAD_REFRESH_DATA_ACTION_ID,
    label: legacyActionPresentation(RELOAD_REFRESH_DATA_LABEL),
    icon: RefreshCw,
    run: () => refreshAllEngineQueries(),
  };
}

export function deriveReloadKeybindings(): KeybindingDef[] {
  return [
    {
      // Mod+R is browser-reserved (page reload, not reliably preventable); Mod+Shift+R
      // is the rebindable default chord.
      id: RELOAD_REFRESH_DATA_ACTION_ID,
      defaultChord: "Mod+Shift+R",
      label: RELOAD_REFRESH_DATA_LABEL,
      group: "General",
      context: "global",
    },
  ];
}

/** Mount the Refresh chord (and its legend entry) for the app's lifetime. */
export function useReloadKeybindings(): void {
  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveReloadKeybindings());
    const disposeAction = registerKeyAction(RELOAD_REFRESH_DATA_ACTION_ID, () =>
      refreshDataAction(),
    );
    return () => {
      disposeAction();
      disposeBindings();
    };
  }, []);
}
