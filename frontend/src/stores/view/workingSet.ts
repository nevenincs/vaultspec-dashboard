// Working-set intent seam. The working set is view-local stage state, but every
// surface expands/collapses it through these named operations so the app layer
// does not duplicate the mutation path.

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";

import type { ActionDescriptor } from "../../platform/actions/action";
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
  label: string;
  collapseLabel: string;
  rootClassName: string;
  collapseButtonClassName: string;
}

export interface WorkingSetView {
  rows: WorkingSetRowView[];
  visible: boolean;
  navClassName: string;
  navLabel: string;
  countClassName: string;
  countLabel: string;
  countAriaLabel: string;
  clearButtonClassName: string;
  clearLabel: string;
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

export const WORKING_SET_KEYBINDING_GROUP = "Working set";
export const WORKING_SET_EXPAND_SELECTION_ACTION_ID = "working-set:expand-selection";
export const WORKING_SET_COLLAPSE_LAST_ACTION_ID = "working-set:collapse-last";

export const WORKING_SET_KEYBINDINGS: readonly KeybindingDef[] = [
  {
    id: WORKING_SET_EXPAND_SELECTION_ACTION_ID,
    defaultChord: "E",
    label: "Expand selected document into the working set",
    group: WORKING_SET_KEYBINDING_GROUP,
    context: "global",
  },
  {
    id: WORKING_SET_COLLAPSE_LAST_ACTION_ID,
    defaultChord: "Backspace",
    label: "Collapse the last working-set expansion",
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
  return useViewStore(useShallow((state) => normalizeWorkingSetIds(state.workingSet)));
}

export function workingSetRows(ids: readonly unknown[]): WorkingSetRowView[] {
  return normalizeWorkingSetIds(ids).map((id) => {
    const label = nodeIdDisplayLabel(id);
    return {
      id,
      label,
      collapseLabel: `Collapse ${label}`,
      rootClassName: WORKING_SET_ROW_CLASS,
      collapseButtonClassName: WORKING_SET_COLLAPSE_BUTTON_CLASS,
    };
  });
}

export function useWorkingSetRows(): WorkingSetRowView[] {
  return workingSetRows(useWorkingSet());
}

export function workingSetView(ids: readonly unknown[]): WorkingSetView {
  const rows = workingSetRows(ids);
  return {
    rows,
    visible: rows.length > 0,
    navClassName: WORKING_SET_NAV_CLASS,
    navLabel: "working set",
    countClassName: WORKING_SET_COUNT_CLASS,
    countLabel: String(rows.length),
    countAriaLabel: `${rows.length} expansions in working set`,
    clearButtonClassName: WORKING_SET_CLEAR_BUTTON_CLASS,
    clearLabel: "clear to constellation",
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
      label: "Expand selected document into the working set",
      run: () => expandWorkingSet(nodeId),
    };
  }

  if (actionId === WORKING_SET_COLLAPSE_LAST_ACTION_ID) {
    const last = lastWorkingSetEntry();
    if (last === undefined) return null;
    return {
      id: WORKING_SET_COLLAPSE_LAST_ACTION_ID,
      label: "Collapse the last working-set expansion",
      run: () => collapseWorkingSet(last),
    };
  }

  return null;
}

export function useWorkingSetView(): WorkingSetView {
  return workingSetView(useWorkingSet());
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
