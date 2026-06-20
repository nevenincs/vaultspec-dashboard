import { useEffect } from "react";

import { FilePlus2, FoldVertical, UnfoldVertical } from "lucide-react";

import type { ActionDescriptor } from "../../platform/actions/action";
import {
  type KeybindingDef,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useActiveScope } from "../server/queries";
import {
  BROWSER_MODE_OPTIONS,
  type BrowserMode,
  cycleBrowserMode,
  setBrowserMode,
} from "./browserMode";
import { openCreateDocDialog } from "./createDocChrome";
import { useDashboardTextFilterDraft } from "./dashboardTextFilter";
import { registerKeyAction } from "./keymapDispatcher";

export const LEFT_RAIL_KEYMAP_CONTEXT = "left-rail";
export const LEFT_RAIL_CYCLE_MODE_ACTION_ID = "left-rail:cycle-browser-mode";
export const LEFT_RAIL_FOCUS_FILTER_ACTION_ID = "left-rail:focus-filter";
export const LEFT_RAIL_CLEAR_FILTER_ACTION_ID = "left-rail:clear-filter";
export const LEFT_RAIL_NEW_DOC_ACTION_ID = "left-rail:new-document";
export const LEFT_RAIL_EXPAND_TREE_ACTION_ID = "left-rail:expand-tree";
export const LEFT_RAIL_COLLAPSE_TREE_ACTION_ID = "left-rail:collapse-tree";

export const LEFT_RAIL_NEW_DOC_LABEL = "New document…";
export const LEFT_RAIL_EXPAND_TREE_LABEL = "Expand the whole vault tree";
export const LEFT_RAIL_COLLAPSE_TREE_LABEL = "Collapse the whole vault tree";

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
    {
      id: LEFT_RAIL_NEW_DOC_ACTION_ID,
      defaultChord: "Mod+Alt+N",
      label: LEFT_RAIL_NEW_DOC_LABEL,
      group: LEFT_RAIL_GROUP,
      context: "global",
    },
    {
      id: LEFT_RAIL_EXPAND_TREE_ACTION_ID,
      defaultChord: "Mod+Alt+]",
      label: LEFT_RAIL_EXPAND_TREE_LABEL,
      group: LEFT_RAIL_GROUP,
      context: "left-rail",
    },
    {
      id: LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
      defaultChord: "Mod+Alt+[",
      label: LEFT_RAIL_COLLAPSE_TREE_LABEL,
      group: LEFT_RAIL_GROUP,
      context: "left-rail",
    },
  ];
}

// --- shared action descriptors (the one uniform source every plane consumes) ----
// The keymap dispatcher, the command palette, and the per-row context menus all
// build their left-rail action from these builders, so a label/effect change
// lands once and every surface inherits it (the unified action plane).

/**
 * "New document" — opens the global create-document dialog, optionally pre-filling
 * the feature tag from the surface that invoked it. A store-only intent (the write
 * itself rides `useCreateDoc` from the dialog), so no time-travel gate.
 */
export function newDocumentAction(prefillFeature?: string): ActionDescriptor {
  return {
    id: LEFT_RAIL_NEW_DOC_ACTION_ID,
    label: LEFT_RAIL_NEW_DOC_LABEL,
    section: "transform",
    icon: FilePlus2,
    run: () => openCreateDocDialog(prefillFeature),
  };
}

/** Switch the browser to a specific mode (Vault / Files) — a direct set, the
 *  discrete counterpart to the Mod+B cycle. */
export function browseModeAction(mode: BrowserMode): ActionDescriptor {
  const option = BROWSER_MODE_OPTIONS.find((candidate) => candidate.id === mode);
  return {
    id: `left-rail:browse-${mode}`,
    label: `Browse ${option?.label ?? mode}`,
    section: "navigate",
    run: () => setBrowserMode(mode),
  };
}

/** "Expand the whole vault tree" — store-only intent over the expansion set. The
 *  caller supplies the live `expandAll` closure (it owns the loaded tree keys). */
export function expandTreeAction(expandAll: () => void): ActionDescriptor {
  return {
    id: LEFT_RAIL_EXPAND_TREE_ACTION_ID,
    label: LEFT_RAIL_EXPAND_TREE_LABEL,
    section: "navigate",
    icon: UnfoldVertical,
    run: expandAll,
  };
}

/** "Collapse the whole vault tree" — store-only intent over the expansion set. */
export function collapseTreeAction(collapseAll: () => void): ActionDescriptor {
  return {
    id: LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
    label: LEFT_RAIL_COLLAPSE_TREE_LABEL,
    section: "navigate",
    icon: FoldVertical,
    run: collapseAll,
  };
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
  const clearTextFilter = useDashboardTextFilterDraft(scope).clear;

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
        run: clearTextFilter,
      }),
    );
    // New document is a global chord (reachable while the stage is focused); the
    // expand/collapse-tree thunks live with the tree (TreeBrowser) where the loaded
    // keys are, so they only fire when the vault tree is mounted.
    const disposeNewDoc = registerKeyAction(LEFT_RAIL_NEW_DOC_ACTION_ID, () =>
      newDocumentAction(),
    );

    return () => {
      disposeNewDoc();
      disposeClear();
      disposeFocus();
      disposeCycle();
      disposeBindings();
    };
  }, [clearTextFilter]);
}
