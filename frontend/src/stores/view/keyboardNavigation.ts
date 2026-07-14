import { useEffect, useMemo } from "react";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import {
  type KeybindingDef,
  legacyKeybindingPresentation,
  registerKeybindings,
} from "../../platform/keymap/registry";
import type { EngineNode } from "../server/engine";
import { featureNodeIdFromTag } from "../server/liveAdapters";
import {
  useActiveScope,
  useDashboardSelectedNodeId,
  useFiltersVocabularyView,
  useNodeNeighbors,
} from "../server/queries";
import { registerKeyAction, useKeymapDispatcher } from "./keymapDispatcher";
import { normalizeSelectionScope, useDashboardNodeSelection } from "./selection";

export interface KeyboardNavigationView {
  selectedId: string | null;
  neighborIds: string[];
  featureIds: string[];
  announcement: string;
}

export type KeyboardNavigationIntent = { kind: "select-node"; id: string };

export const KEYBOARD_NAVIGATION_ACTION_GROUP =
  legacyKeybindingPresentation("Navigation");

export type KeyboardNavigationActionId =
  | "nav:neighbor-previous"
  | "nav:neighbor-next"
  | "nav:feature-previous"
  | "nav:feature-next";

export interface KeyboardNavigationBinding extends KeybindingDef {
  key: string;
}

export const KEYBOARD_NAVIGATION_BINDINGS: readonly KeyboardNavigationBinding[] = [
  {
    id: "nav:neighbor-previous",
    defaultChord: "ArrowLeft",
    label: legacyKeybindingPresentation("Select previous connected document"),
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowLeft",
  },
  {
    id: "nav:neighbor-next",
    defaultChord: "ArrowRight",
    label: legacyKeybindingPresentation("Select next connected document"),
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowRight",
  },
  {
    id: "nav:feature-previous",
    defaultChord: "ArrowUp",
    label: legacyKeybindingPresentation("Select previous feature"),
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowUp",
  },
  {
    id: "nav:feature-next",
    defaultChord: "ArrowDown",
    label: legacyKeybindingPresentation("Select next feature"),
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowDown",
  },
];

export function keyboardNavigationKeyForAction(id: string): string | null {
  return KEYBOARD_NAVIGATION_BINDINGS.find((binding) => binding.id === id)?.key ?? null;
}

export function cycleKeyboardList<T>(
  list: readonly T[],
  current: T | null,
  dir: 1 | -1,
): T | null {
  if (list.length === 0) return null;
  const index = current === null ? -1 : list.indexOf(current);
  if (index === -1) return list[0];
  return list[(index + dir + list.length) % list.length];
}

export function deriveKeyboardNavigationKeyIntent(
  key: string,
  navigation: KeyboardNavigationView,
): KeyboardNavigationIntent | null {
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const next = cycleKeyboardList(
      navigation.neighborIds,
      null,
      key === "ArrowRight" ? 1 : -1,
    );
    return next ? { kind: "select-node", id: next } : null;
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    const next = cycleKeyboardList(
      navigation.featureIds,
      navigation.selectedId,
      key === "ArrowDown" ? 1 : -1,
    );
    return next ? { kind: "select-node", id: next } : null;
  }
  return null;
}

export type KeyboardNodeSelectionIntent = (id: string) => Promise<unknown>;

export function deriveKeyboardNavigationActionDescriptor(
  binding: KeyboardNavigationBinding,
  navigation: KeyboardNavigationView,
  selectDashboardNode: KeyboardNodeSelectionIntent,
): ActionDescriptor | null {
  const key = keyboardNavigationKeyForAction(binding.id);
  if (key === null) return null;
  const intent = deriveKeyboardNavigationKeyIntent(key, navigation);
  if (intent === null) return null;
  return {
    id: binding.id,
    label:
      typeof binding.label === "string"
        ? legacyActionPresentation(binding.label)
        : binding.label,
    run: () => {
      void selectDashboardNode(intent.id).catch(() => undefined);
    },
  };
}

export function deriveKeyboardNavigationView(
  selectedId: string | null,
  neighborNodes: readonly EngineNode[] | undefined,
  featureTags: readonly string[],
): KeyboardNavigationView {
  return {
    selectedId,
    neighborIds: (neighborNodes ?? [])
      .map((node) => node.id)
      .filter((id) => id !== selectedId),
    featureIds: featureTags.map(featureNodeIdFromTag),
    announcement: selectedId
      ? `selected ${selectedId.replace(/^(feature|doc):/, "")}`
      : "",
  };
}

/**
 * Stores selector for global keyboard navigation. The app-level key listener
 * consumes node-neighbor and feature-cycle ids as one projection instead of
 * reading query payloads and vocabulary fields locally.
 */
export function useKeyboardNavigationView(scope: unknown): KeyboardNavigationView {
  const normalizedScope = normalizeSelectionScope(scope);
  const selectedId = useDashboardSelectedNodeId(normalizedScope);
  const vocabulary = useFiltersVocabularyView(normalizedScope);
  const neighbors = useNodeNeighbors(selectedId, normalizedScope);
  return useMemo(
    () =>
      deriveKeyboardNavigationView(
        selectedId,
        neighbors.data?.nodes,
        vocabulary.featureTags,
      ),
    [neighbors.data?.nodes, selectedId, vocabulary.featureTags],
  );
}

export function useKeyboardNavigationKeybindings(
  navigation: KeyboardNavigationView,
  selectDashboardNode: KeyboardNodeSelectionIntent,
): void {
  useEffect(() => {
    const disposeBinding = registerKeybindings(KEYBOARD_NAVIGATION_BINDINGS);
    const disposeActions = KEYBOARD_NAVIGATION_BINDINGS.map((binding) =>
      registerKeyAction(binding.id, () =>
        deriveKeyboardNavigationActionDescriptor(
          binding,
          navigation,
          selectDashboardNode,
        ),
      ),
    );
    return () => {
      for (const dispose of disposeActions) dispose();
      disposeBinding();
    };
  }, [navigation, selectDashboardNode]);
}

export function useKeyboardNavigationSurface(): KeyboardNavigationView {
  const scope = useActiveScope();
  const normalizedScope = normalizeSelectionScope(scope);
  const navigation = useKeyboardNavigationView(normalizedScope);
  const selectDashboardNode = useDashboardNodeSelection(normalizedScope);
  useKeymapDispatcher();
  useKeyboardNavigationKeybindings(navigation, selectDashboardNode);
  return navigation;
}
