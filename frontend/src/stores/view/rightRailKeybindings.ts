import { useEffect } from "react";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useShellPanelIntent } from "../server/panelStateIntent";
import { useActiveScope } from "../server/queries";
import { registerKeyAction } from "./keymapDispatcher";
import { RIGHT_RAIL_TABS, type RailTabId } from "./shellLayout";

export const RIGHT_RAIL_KEYMAP_CONTEXT = "right-rail";

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
  return tabBindings;
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
                label: legacyActionPresentation(`Show the ${tab.label} tab`),
                run: () => {
                  void setRightTab(tab.id).catch(() => undefined);
                },
              }),
            ),
          ];
    });
    return () => {
      for (const dispose of disposeTabs) dispose();
      disposeBindings();
    };
  }, [panelIntent]);
}
