import { useEffect } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useShellPanelIntent } from "../server/panelStateIntent";
import { useActiveScope } from "../server/queries";
import { registerKeyAction } from "./keymapDispatcher";
import { RIGHT_RAIL_TABS, type RailTabId } from "./shellLayout";

export const RIGHT_RAIL_KEYMAP_CONTEXT = "right-rail";
export const RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID = "right-rail:focus-search";

const RIGHT_RAIL_GROUP = "Right rail";

export function rightRailTabActionId(tab: RailTabId): string {
  return `right-rail:show-${tab}`;
}

export function rightRailTabChord(index: number): string {
  return `Mod+${index + 1}`;
}

export function deriveRightRailKeybindings(): KeybindingDef[] {
  return [
    ...RIGHT_RAIL_TABS.map((tab, index) => ({
      id: rightRailTabActionId(tab.id),
      defaultChord: rightRailTabChord(index),
      label: `Show the ${tab.label} tab`,
      group: RIGHT_RAIL_GROUP,
      context: "right-rail" as const,
    })),
    {
      id: RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID,
      defaultChord: "Mod+Shift+S",
      label: "Focus the right-rail search",
      group: RIGHT_RAIL_GROUP,
      context: "global",
    },
  ];
}

function focusRightRailSearch(setRightTab: (tab: RailTabId) => Promise<unknown>): void {
  void setRightTab("search").catch(() => undefined);
  if (typeof queueMicrotask === "function") {
    queueMicrotask(focusSearchField);
  } else {
    focusSearchField();
  }
}

function focusSearchField(): void {
  if (typeof document === "undefined") return;
  const input = document.querySelector<HTMLInputElement>(
    "[data-search-tab] [data-kit-search-input]",
  );
  input?.focus();
  input?.select();
}

export function useRightRailKeybindings(): void {
  const scope = useActiveScope();
  const panelIntent = useShellPanelIntent(scope);

  useEffect(() => {
    const setRightTab = panelIntent.setRightTab;
    const disposeBindings = registerKeybindings(deriveRightRailKeybindings());
    const disposeTabs = RIGHT_RAIL_TABS.map((tab) =>
      registerKeyAction(
        rightRailTabActionId(tab.id),
        (): ActionDescriptor => ({
          id: rightRailTabActionId(tab.id),
          label: `Show the ${tab.label} tab`,
          run: () => {
            void setRightTab(tab.id).catch(() => undefined);
          },
        }),
      ),
    );
    const disposeFocusSearch = registerKeyAction(
      RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID,
      (): ActionDescriptor => ({
        id: RIGHT_RAIL_FOCUS_SEARCH_ACTION_ID,
        label: "Focus the right-rail search",
        run: () => focusRightRailSearch(setRightTab),
      }),
    );

    return () => {
      disposeFocusSearch();
      for (const dispose of disposeTabs) dispose();
      disposeBindings();
    };
  }, [panelIntent]);
}
