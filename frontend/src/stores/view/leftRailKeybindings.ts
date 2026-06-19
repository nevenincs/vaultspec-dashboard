import { useEffect } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useActiveScope } from "../server/queries";
import { cycleBrowserMode } from "./browserMode";
import { useDashboardTextFilterDraft } from "./dashboardTextFilter";
import { registerKeyAction } from "./keymapDispatcher";

export const LEFT_RAIL_KEYMAP_CONTEXT = "left-rail";
export const LEFT_RAIL_CYCLE_MODE_ACTION_ID = "left-rail:cycle-browser-mode";
export const LEFT_RAIL_FOCUS_FILTER_ACTION_ID = "left-rail:focus-filter";
export const LEFT_RAIL_CLEAR_FILTER_ACTION_ID = "left-rail:clear-filter";

const LEFT_RAIL_GROUP = "Left rail";

export function deriveLeftRailKeybindings(): KeybindingDef[] {
  return [
    {
      id: LEFT_RAIL_CYCLE_MODE_ACTION_ID,
      defaultChord: "Mod+B",
      label: "Cycle the browser mode (Vault / Code)",
      group: LEFT_RAIL_GROUP,
      context: "left-rail",
    },
    {
      id: LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
      defaultChord: "Mod+Shift+F",
      label: "Focus the left-rail filter",
      group: LEFT_RAIL_GROUP,
      context: "global",
    },
    {
      id: LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
      defaultChord: "Mod+Shift+X",
      label: "Clear the document filter",
      group: LEFT_RAIL_GROUP,
      context: "global",
    },
  ];
}

function focusLeftRailFilter(): void {
  if (typeof document === "undefined") return;
  const input = document.querySelector<HTMLInputElement>(
    "[data-rail-filter] [data-kit-search-input]",
  );
  input?.focus();
  input?.select();
}

export function useLeftRailKeybindings(): void {
  const scope = useActiveScope();
  const textFilter = useDashboardTextFilterDraft(scope);

  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveLeftRailKeybindings());
    const disposeCycle = registerKeyAction(
      LEFT_RAIL_CYCLE_MODE_ACTION_ID,
      (): ActionDescriptor => ({
        id: LEFT_RAIL_CYCLE_MODE_ACTION_ID,
        label: "Cycle the browser mode (Vault / Code)",
        run: cycleBrowserMode,
      }),
    );
    const disposeFocus = registerKeyAction(
      LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
      (): ActionDescriptor => ({
        id: LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
        label: "Focus the left-rail filter",
        run: focusLeftRailFilter,
      }),
    );
    const disposeClear = registerKeyAction(
      LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
      (): ActionDescriptor => ({
        id: LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
        label: "Clear the document filter",
        run: () => textFilter.clear(),
      }),
    );

    return () => {
      disposeClear();
      disposeFocus();
      disposeCycle();
      disposeBindings();
    };
  }, [textFilter]);
}
