// Working-set intent seam. The working set is view-local stage state, but every
// surface expands/collapses it through these named operations so the app layer
// does not duplicate the mutation path.

import { useEffect, useMemo } from "react";

import type { ActionDescriptor } from "../../platform/actions/action";
import type {
  CountMessageDescriptor,
  MessageDescriptor,
} from "../../platform/localization/message";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { normalizeNodeId } from "../nodeIds";
import { registerKeyAction } from "./keymapDispatcher";
import { nodeIdDisplayLabel } from "./nodeLabels";
import { useViewStore, WORKING_SET_CAP } from "./viewStore";

export interface WorkingSetRowView {
  id: string;
  label:
    | { readonly kind: "user-data"; readonly value: string }
    | { readonly kind: "message"; readonly descriptor: MessageDescriptor };
  collapseLabel: MessageDescriptor;
  rootClassName: string;
  collapseButtonClassName: string;
  /** Present + true only when the chip's node is FILTERED OUT of the visible set
   *  (GS-006): the chip is dimmed (rootClassName carries the dim utility) and carries the
   *  `hiddenHint` affordance so the trail never implies a node is on stage that the active
   *  filter has hidden. Absent when the node is visible (or no filter membership is
   *  supplied), keeping the visible-row shape unchanged. */
  hidden?: true;
  /** Plain-language "hidden by filter" affordance, present only when `hidden`. */
  hiddenHint?: MessageDescriptor;
  /** Complete accessible copy combining the user-data label and hidden state. */
  hiddenLabel?: MessageDescriptor;
}

export interface WorkingSetView {
  rows: WorkingSetRowView[];
  visible: boolean;
  navClassName: string;
  navLabel: MessageDescriptor;
  countClassName: string;
  count: number;
  countAriaLabel: CountMessageDescriptor;
  clearButtonClassName: string;
  clearLabel: MessageDescriptor;
}

const WORKING_SET_NAV_CLASS =
  "pointer-events-auto absolute top-9 left-2 z-10 flex flex-wrap items-center gap-1";
const WORKING_SET_COUNT_CLASS =
  "rounded-fg-pill bg-paper-sunken px-fg-1-5 py-fg-0-5 text-caption tabular-nums text-ink-muted";
const WORKING_SET_ROW_CLASS =
  "flex items-center gap-fg-1 rounded-fg-pill border border-rule bg-paper-raised px-fg-2 py-fg-0-5 text-caption text-ink shadow-fg-raised";
const WORKING_SET_COLLAPSE_BUTTON_CLASS =
  "flex items-center text-ink-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
const WORKING_SET_CLEAR_BUTTON_CLASS =
  "rounded-fg-pill border border-rule bg-paper-sunken px-fg-2 py-fg-0-5 text-caption text-ink-muted hover:text-ink transition-colors duration-ui-fast ease-settle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus";
// A filter-hidden chip is DIMMED (the same opacity treatment the kit uses for a disabled
// control) and carries a plain-language affordance, so the chip trail is honest: it never
// renders a node at full strength that the active filter has hidden from the canvas
// (GS-006). Presentation only — the working-set membership is unchanged, and releasing the
// filter un-dims the chip with no state change.
const WORKING_SET_ROW_HIDDEN_CLASS = "opacity-50";
const WORKING_SET_HIDDEN_HINT = Object.freeze({
  key: "graph:accessibility.hiddenByActiveFilter",
} as const satisfies MessageDescriptor);
const WORKING_SET_NAV_LABEL = Object.freeze({
  key: "graph:accessibility.workingSet",
} as const satisfies MessageDescriptor);
const WORKING_SET_CLEAR_LABEL = Object.freeze({
  key: "graph:actions.clearWorkingSet",
} as const satisfies MessageDescriptor);
const WORKING_SET_ITEM_LABEL = Object.freeze({
  key: "graph:labels.item",
} as const satisfies MessageDescriptor);

export const WORKING_SET_KEYBINDING_GROUP = Object.freeze({
  key: "graph:shortcutGroups.workingSet",
} as const satisfies MessageDescriptor);
export const WORKING_SET_EXPAND_SELECTION_ACTION_ID = "working-set:expand-selection";
export const WORKING_SET_COLLAPSE_LAST_ACTION_ID = "working-set:collapse-last";
export const WORKING_SET_EXPAND_SELECTION_LABEL = Object.freeze({
  key: "graph:actions.addSelectedItemToWorkingSet",
} as const satisfies MessageDescriptor);
export const WORKING_SET_COLLAPSE_LAST_LABEL = Object.freeze({
  key: "graph:actions.removeLastItemFromWorkingSet",
} as const satisfies MessageDescriptor);

export const WORKING_SET_KEYBINDINGS: readonly KeybindingDef[] = [
  {
    id: WORKING_SET_EXPAND_SELECTION_ACTION_ID,
    defaultChord: "E",
    label: WORKING_SET_EXPAND_SELECTION_LABEL,
    group: WORKING_SET_KEYBINDING_GROUP,
    context: "global",
  },
  {
    id: WORKING_SET_COLLAPSE_LAST_ACTION_ID,
    defaultChord: "Backspace",
    label: WORKING_SET_COLLAPSE_LAST_LABEL,
    group: WORKING_SET_KEYBINDING_GROUP,
    context: "global",
  },
];

export function normalizeWorkingSetIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = ids.length - 1; i >= 0; i -= 1) {
    const id = normalizeNodeId(ids[i]);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    out.unshift(id);
    if (out.length >= WORKING_SET_CAP) break;
  }
  return out;
}

export function useWorkingSet(): readonly string[] {
  // Select the RAW stable slice; derive in useMemo (stable-selectors) — never
  // inside the selector, even under useShallow.
  const workingSet = useViewStore((state) => state.workingSet);
  return useMemo(() => normalizeWorkingSetIds(workingSet), [workingSet]);
}

export function workingSetRows(
  ids: readonly unknown[],
  visibleNodeIds: ReadonlySet<string> | null = null,
): WorkingSetRowView[] {
  return normalizeWorkingSetIds(ids).map((id) => {
    const displayLabel = /^(?:feature|doc|code):/u.test(id)
      ? nodeIdDisplayLabel(id)
      : null;
    const label: WorkingSetRowView["label"] =
      displayLabel === null || displayLabel.length === 0
        ? { kind: "message", descriptor: WORKING_SET_ITEM_LABEL }
        : { kind: "user-data", value: displayLabel };
    // A chip is filter-hidden when a visibility membership is supplied AND its node is not
    // in it. With no membership (null) nothing is dimmed — the visible-row shape is
    // unchanged, so a mount that does not thread visibility behaves exactly as before.
    const hidden = visibleNodeIds !== null && !visibleNodeIds.has(id);
    return {
      id,
      label,
      collapseLabel:
        displayLabel !== null && displayLabel.length > 0
          ? {
              key: "graph:actions.removeNamedItemFromWorkingSet",
              values: { item: displayLabel },
            }
          : { key: "graph:actions.removeItemFromWorkingSet" },
      rootClassName: hidden
        ? `${WORKING_SET_ROW_CLASS} ${WORKING_SET_ROW_HIDDEN_CLASS}`
        : WORKING_SET_ROW_CLASS,
      collapseButtonClassName: WORKING_SET_COLLAPSE_BUTTON_CLASS,
      ...(hidden
        ? {
            hidden: true as const,
            hiddenHint: WORKING_SET_HIDDEN_HINT,
            hiddenLabel:
              displayLabel !== null && displayLabel.length > 0
                ? ({
                    key: "graph:accessibility.namedWorkingSetItemHidden",
                    values: { item: displayLabel },
                  } satisfies MessageDescriptor)
                : ({
                    key: "graph:accessibility.workingSetItemHidden",
                  } satisfies MessageDescriptor),
          }
        : {}),
    };
  });
}

export function useWorkingSetRows(
  visibleNodeIds: ReadonlySet<string> | null = null,
): WorkingSetRowView[] {
  return workingSetRows(useWorkingSet(), visibleNodeIds);
}

export function workingSetView(
  ids: readonly unknown[],
  visibleNodeIds: ReadonlySet<string> | null = null,
): WorkingSetView {
  const rows = workingSetRows(ids, visibleNodeIds);
  return {
    rows,
    visible: rows.length > 0,
    navClassName: WORKING_SET_NAV_CLASS,
    navLabel: WORKING_SET_NAV_LABEL,
    countClassName: WORKING_SET_COUNT_CLASS,
    count: rows.length,
    countAriaLabel: {
      key: "graph:accessibility.workingSetCount",
      values: { count: rows.length },
    },
    clearButtonClassName: WORKING_SET_CLEAR_BUTTON_CLASS,
    clearLabel: WORKING_SET_CLEAR_LABEL,
  };
}

export function workingSetKeyAction(
  actionId: unknown,
  selectedId: unknown,
): ActionDescriptor | null {
  if (actionId === WORKING_SET_EXPAND_SELECTION_ACTION_ID) {
    const nodeId = normalizeNodeId(selectedId);
    if (nodeId === null) return null;
    return {
      id: WORKING_SET_EXPAND_SELECTION_ACTION_ID,
      label: WORKING_SET_EXPAND_SELECTION_LABEL,
      run: () => expandWorkingSet(nodeId),
    };
  }

  if (actionId === WORKING_SET_COLLAPSE_LAST_ACTION_ID) {
    const last = lastWorkingSetEntry();
    if (last === undefined) return null;
    return {
      id: WORKING_SET_COLLAPSE_LAST_ACTION_ID,
      label: WORKING_SET_COLLAPSE_LAST_LABEL,
      run: () => collapseWorkingSet(last),
    };
  }

  return null;
}

export function useWorkingSetView(
  visibleNodeIds: ReadonlySet<string> | null = null,
): WorkingSetView {
  const ids = useWorkingSet();
  // Derive OUTSIDE the store selector (stable-selectors): `ids` is the referentially
  // stable normalized slice, `visibleNodeIds` is passed by the mount site; memoize the
  // view on both so a consumer never sees a fresh object on an unrelated render.
  return useMemo(() => workingSetView(ids, visibleNodeIds), [ids, visibleNodeIds]);
}

export function useWorkingSetKeybindings(selectedId: unknown): void {
  useEffect(() => {
    const disposeBindings = registerKeybindings(WORKING_SET_KEYBINDINGS);
    const disposeActions = WORKING_SET_KEYBINDINGS.map((binding) =>
      registerKeyAction(binding.id, () => workingSetKeyAction(binding.id, selectedId)),
    );
    return () => {
      for (const dispose of disposeActions) dispose();
      disposeBindings();
    };
  }, [selectedId]);
}

export function expandWorkingSet(id: unknown): void {
  useViewStore.getState().addToWorkingSet(id);
}

export function collapseWorkingSet(id: unknown): void {
  useViewStore.getState().removeFromWorkingSet(id);
}

export function clearWorkingSet(): void {
  useViewStore.getState().clearWorkingSet();
}

export function lastWorkingSetEntry(): string | undefined {
  return normalizeWorkingSetIds(useViewStore.getState().workingSet).at(-1);
}

export function isInWorkingSet(id: unknown): boolean {
  const nodeId = normalizeNodeId(id);
  return (
    nodeId !== null &&
    normalizeWorkingSetIds(useViewStore.getState().workingSet).includes(nodeId)
  );
}
