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

export function normalizeRightRailKeybindingTab(tab: unknown): RailTabId | null {
  if (typeof tab !== "string") return null;
  const normalized = tab.trim();
  return RIGHT_RAIL_TABS.find((candidate) => candidate.id === normalized)?.id ?? null;
}

export function rightRailTabActionId(tab: unknown): string | null {
  const normalizedTab = normalizeRightRailKeybindingTab(tab);
  return normalizedTab === null ? null : `right-rail:show-${normalizedTab}`;
}

export function rightRailTabChord(index: unknown): string | null {
  return Number.isInteger(index) &&
    typeof index === "number" &&
    index >= 0 &&
    index < RIGHT_RAIL_TABS.length
    ? `Mod+${index + 1}`
    : null;
}

export function deriveRightRailKeybindings(): KeybindingDef[] {
  const tabBindings = RIGHT_RAIL_TABS.flatMap((tab, index) => {
    const id = rightRailTabActionId(tab.id);
    const defaultChord = rightRailTabChord(index);
    return id === null || defaultChord === null
      ? []
      : [
          {
            id,
            defaultChord,
            label: `Show the ${tab.label} tab`,
            group: RIGHT_RAIL_GROUP,
            context: "right-rail" as const,
          },
        ];
  });
  return [
    ...tabBindings,
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
    const disposeTabs = RIGHT_RAIL_TABS.flatMap((tab) => {
      const id = rightRailTabActionId(tab.id);
      return id === null
        ? []
        : [
            registerKeyAction(
              id,
              (): ActionDescriptor => ({
                id,
                label: `Show the ${tab.label} tab`,
                run: () => {
                  void setRightTab(tab.id).catch(() => undefined);
                },
              }),
            ),
          ];
    });
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
