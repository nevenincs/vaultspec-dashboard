import { useEffect } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useShellPanelIntent } from "../server/panelStateIntent";
import { useActiveScope } from "../server/queries";
import { registerKeyAction } from "./keymapDispatcher";
import {
  RIGHT_RAIL_TABS,
  rightRailTabPresentation,
  type RailTabId,
} from "./shellLayout";

export const RIGHT_RAIL_KEYMAP_CONTEXT = "right-rail";

const RIGHT_RAIL_GROUP = { key: "common:shortcutGroups.window" } as const;

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
    const presentation = rightRailTabPresentation(tab.id);
    const id = rightRailTabActionId(tab.id);
    const defaultChord = rightRailTabChord(index);
    return presentation === null || id === null || defaultChord === null
      ? []
      : [
          {
            id,
            defaultChord,
            label: presentation.actionLabel,
            group: RIGHT_RAIL_GROUP,
            context: "right-rail" as const,
          },
        ];
  });
  return tabBindings;
}

export function rightRailTabAction(
  tab: unknown,
  selectTab: (tab: RailTabId) => void,
): ActionDescriptor | null {
  const presentation = rightRailTabPresentation(tab);
  const id = presentation === null ? null : rightRailTabActionId(presentation.id);
  if (presentation === null || id === null) return null;
  return {
    id,
    label: presentation.actionLabel,
    run: () => selectTab(presentation.id),
  };
}

export function useRightRailKeybindings(): void {
  const scope = useActiveScope();
  const panelIntent = useShellPanelIntent(scope);

  useEffect(() => {
    const setRightTab = panelIntent.setRightTab;
    const disposeBindings = registerKeybindings(deriveRightRailKeybindings());
    const disposeTabs = RIGHT_RAIL_TABS.flatMap((tab) => {
      const action = rightRailTabAction(tab.id, (selectedTab) => {
        void setRightTab(selectedTab).catch(() => undefined);
      });
      return action === null
        ? []
        : [registerKeyAction(action.id, (): ActionDescriptor => action)];
    });
    return () => {
      for (const dispose of disposeTabs) dispose();
      disposeBindings();
    };
  }, [panelIntent]);
}
