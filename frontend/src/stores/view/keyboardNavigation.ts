import { useEffect, useMemo } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import type { KeybindingDef } from "../../platform/keymap/registry";
import { registerKeybindings } from "../../platform/keymap/registry";
import type { EngineNode } from "../server/engine";
import { featureNodeIdFromTag } from "../server/liveAdapters";
import {
  useActiveScope,
  useDashboardSelectedNodeId,
  useFiltersVocabularyView,
  useNodeNeighbors,
} from "../server/queries";
import { registerKeyAction, useKeymapDispatcher } from "./keymapDispatcher";
import { useDashboardNodeSelection } from "./selection";
import { timelineViewSnapshot, timelineVisibleRange } from "./timeline";
import { movePlayhead } from "./timelineIntent";

export interface KeyboardNavigationView {
  selectedId: string | null;
  neighborIds: string[];
  featureIds: string[];
  announcement: string;
}

export interface KeyboardVisibleRange {
  fromMs: number;
  toMs: number;
}

export type KeyboardNavigationIntent =
  | { kind: "select-node"; id: string }
  | { kind: "move-playhead"; playhead: number | "live" };

export const KEYBOARD_NAVIGATION_ACTION_GROUP = "Navigation";

export type KeyboardNavigationActionId =
  | "nav:neighbor-previous"
  | "nav:neighbor-next"
  | "nav:feature-previous"
  | "nav:feature-next"
  | "timeline:playhead-previous"
  | "timeline:playhead-next";

export interface KeyboardNavigationBinding extends KeybindingDef {
  key: string;
}

export const KEYBOARD_NAVIGATION_BINDINGS: readonly KeyboardNavigationBinding[] = [
  {
    id: "nav:neighbor-previous",
    defaultChord: "ArrowLeft",
    label: "Select previous connected document",
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowLeft",
  },
  {
    id: "nav:neighbor-next",
    defaultChord: "ArrowRight",
    label: "Select next connected document",
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowRight",
  },
  {
    id: "nav:feature-previous",
    defaultChord: "ArrowUp",
    label: "Select previous feature",
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowUp",
  },
  {
    id: "nav:feature-next",
    defaultChord: "ArrowDown",
    label: "Select next feature",
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "ArrowDown",
  },
  {
    id: "timeline:playhead-previous",
    defaultChord: "[",
    label: "Step playhead backward",
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "[",
  },
  {
    id: "timeline:playhead-next",
    defaultChord: "]",
    label: "Step playhead forward",
    group: KEYBOARD_NAVIGATION_ACTION_GROUP,
    context: "global",
    key: "]",
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

export function keyboardBracketStep(visibleSpanMs: number): number {
  return Math.max(60_000, visibleSpanMs * 0.02);
}

export function steppedKeyboardPlayhead(
  current: number | "live",
  dir: 1 | -1,
  range: KeyboardVisibleRange,
  now: number,
): number | "live" {
  const base = current === "live" ? now : current;
  const next = base + dir * keyboardBracketStep(range.toMs - range.fromMs);
  if (next >= now) return "live";
  return Math.max(range.fromMs, next);
}

export function deriveKeyboardNavigationKeyIntent(
  key: string,
  navigation: KeyboardNavigationView,
  playhead: number | "live",
  range: KeyboardVisibleRange,
  now: number,
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
  if (key === "[" || key === "]") {
    return {
      kind: "move-playhead",
      playhead: steppedKeyboardPlayhead(playhead, key === "]" ? 1 : -1, range, now),
    };
  }
  return null;
}

export type KeyboardNodeSelectionIntent = (id: string) => Promise<unknown>;

export function deriveKeyboardNavigationActionDescriptor(
  binding: KeyboardNavigationBinding,
  navigation: KeyboardNavigationView,
  scope: string | null,
  selectDashboardNode: KeyboardNodeSelectionIntent,
  now = Date.now(),
): ActionDescriptor | null {
  const key = keyboardNavigationKeyForAction(binding.id);
  if (key === null) return null;
  const { playheadT, pxPerMs, scrollOffset, viewportWidth } = timelineViewSnapshot();
  const intent = deriveKeyboardNavigationKeyIntent(
    key,
    navigation,
    playheadT,
    timelineVisibleRange(scrollOffset, viewportWidth, pxPerMs, 0),
    now,
  );
  if (intent === null) return null;
  return {
    id: binding.id,
    label: binding.label,
    run: () => {
      if (intent.kind === "select-node") {
        void selectDashboardNode(intent.id).catch(() => undefined);
        return;
      }
      movePlayhead(intent.playhead, scope);
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
export function useKeyboardNavigationView(
  scope: string | null,
): KeyboardNavigationView {
  const selectedId = useDashboardSelectedNodeId(scope);
  const vocabulary = useFiltersVocabularyView(scope);
  const neighbors = useNodeNeighbors(selectedId, scope);
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
  scope: string | null,
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
          scope,
          selectDashboardNode,
        ),
      ),
    );
    return () => {
      for (const dispose of disposeActions) dispose();
      disposeBinding();
    };
  }, [navigation, scope, selectDashboardNode]);
}

export function useKeyboardNavigationSurface(): KeyboardNavigationView {
  const scope = useActiveScope();
  const navigation = useKeyboardNavigationView(scope);
  const selectDashboardNode = useDashboardNodeSelection(scope);
  useKeymapDispatcher();
  useKeyboardNavigationKeybindings(scope, navigation, selectDashboardNode);
  return navigation;
}
