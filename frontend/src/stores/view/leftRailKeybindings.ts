import { useEffect } from "react";

import {
  ArrowUpDown,
  FilePlus2,
  Filter,
  FilterX,
  FoldVertical,
  ListFilter,
  ListRestart,
  Search,
  UnfoldVertical,
} from "lucide-react";

import {
  legacyActionPresentation,
  type ActionDescriptor,
} from "../../platform/actions/action";
import {
  type KeybindingDef,
  legacyKeybindingPresentation,
  registerKeybindings,
} from "../../platform/keymap/registry";
import { useDashboardFilterSidebarIntent } from "../server/dashboardFilterSidebarIntent";
import { useActiveScope } from "../server/queries";
import {
  BROWSER_MODE_OPTIONS,
  type BrowserMode,
  cycleBrowserMode,
  setBrowserMode,
} from "./browserMode";
import { openCreateDocDialog } from "./createDocChrome";
import { useDashboardFeatureFilterDraft } from "./dashboardFeatureFilter";
import { toggleFilterSidebar } from "./filterSidebar";
import { registerKeyAction } from "./keymapDispatcher";
import {
  RAIL_SORT_OPTIONS,
  type RailSortKey,
  resetRailSort,
  setRailSortKey,
} from "./railSort";

export const LEFT_RAIL_KEYMAP_CONTEXT = "left-rail";
export const LEFT_RAIL_CYCLE_MODE_ACTION_ID = "left-rail:cycle-browser-mode";
export const LEFT_RAIL_FOCUS_FILTER_ACTION_ID = "left-rail:focus-filter";
export const LEFT_RAIL_CLEAR_FILTER_ACTION_ID = "left-rail:clear-filter";
export const LEFT_RAIL_NEW_DOC_ACTION_ID = "left-rail:new-document";
export const LEFT_RAIL_EXPAND_TREE_ACTION_ID = "left-rail:expand-tree";
export const LEFT_RAIL_COLLAPSE_TREE_ACTION_ID = "left-rail:collapse-tree";
export const LEFT_RAIL_TOGGLE_FACETS_ACTION_ID = "left-rail:toggle-facets";
export const LEFT_RAIL_RESET_FILTERS_ACTION_ID = "left-rail:reset-filters";
export const LEFT_RAIL_RESET_SORTING_ACTION_ID = "left-rail:reset-sorting";

export const LEFT_RAIL_NEW_DOC_LABEL =
  legacyKeybindingPresentation("Add to a Feature…");
export const LEFT_RAIL_EXPAND_TREE_LABEL =
  legacyKeybindingPresentation("Expand Vault Tree");
export const LEFT_RAIL_COLLAPSE_TREE_LABEL =
  legacyKeybindingPresentation("Collapse Vault Tree");
export const LEFT_RAIL_TOGGLE_FACETS_LABEL =
  legacyKeybindingPresentation("Toggle Filter Facets");
export const LEFT_RAIL_RESET_FILTERS_LABEL =
  legacyKeybindingPresentation("Reset Filters");
export const LEFT_RAIL_RESET_SORTING_LABEL = "Reset Sorting";

const LEFT_RAIL_GROUP = legacyKeybindingPresentation("Left rail");

export function deriveLeftRailKeybindings(): KeybindingDef[] {
  return [
    {
      id: LEFT_RAIL_CYCLE_MODE_ACTION_ID,
      defaultChord: "Mod+B",
      label: legacyKeybindingPresentation("Cycle the browser mode (Vault / Code)"),
      group: LEFT_RAIL_GROUP,
      context: "left-rail",
    },
    {
      id: LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
      defaultChord: "Mod+Shift+F",
      label: legacyKeybindingPresentation("Focus the left-rail filter"),
      group: LEFT_RAIL_GROUP,
      context: "global",
    },
    {
      id: LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
      defaultChord: "Mod+Shift+X",
      label: legacyKeybindingPresentation("Clear the document filter"),
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
    {
      id: LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
      defaultChord: "Mod+Shift+L",
      label: LEFT_RAIL_TOGGLE_FACETS_LABEL,
      group: LEFT_RAIL_GROUP,
      context: "global",
    },
    {
      id: LEFT_RAIL_RESET_FILTERS_ACTION_ID,
      defaultChord: "Mod+Alt+0",
      label: LEFT_RAIL_RESET_FILTERS_LABEL,
      group: LEFT_RAIL_GROUP,
      context: "global",
    },
  ];
}

// --- shared action descriptors (the one uniform source every plane consumes) ----
// The keymap dispatcher, the command palette, and the per-row context menus all
// build their left-rail action from these builders, so a label/effect change
// lands once and every surface inherits it (the unified action plane).

/**
 * "Add to a Feature" — opens the global create-document dialog, optionally pre-filling
 * the feature tag from the surface that invoked it and/or requesting focus on the
 * feature field (the Features-section create affordance). The id is ALWAYS the one
 * shared `left-rail:new-document`, whatever the options — every visible create
 * affordance dispatches this one descriptor (unified action plane). A store-only
 * intent (the write itself rides `useCreateDoc` from the dialog), so no time-travel gate.
 */
export function newDocumentAction(
  prefillFeature?: string,
  options?: { focusFeature?: boolean },
): ActionDescriptor {
  return {
    id: LEFT_RAIL_NEW_DOC_ACTION_ID,
    label: legacyActionPresentation(LEFT_RAIL_NEW_DOC_LABEL),
    section: "transform",
    icon: FilePlus2,
    run: () => openCreateDocDialog(prefillFeature, options),
  };
}

/** Switch the browser to a specific mode (Vault / Files) — a direct set, the
 *  discrete counterpart to the Mod+B cycle. */
export function browseModeAction(mode: BrowserMode): ActionDescriptor {
  const option = BROWSER_MODE_OPTIONS.find((candidate) => candidate.id === mode);
  return {
    id: `left-rail:browse-${mode}`,
    label: legacyActionPresentation(`Browse ${option?.label ?? mode}`),
    section: "navigate",
    run: () => setBrowserMode(mode),
  };
}

/** "Expand the whole vault tree" — store-only intent over the expansion set. The
 *  caller supplies the live `expandAll` closure (it owns the loaded tree keys). */
export function expandTreeAction(expandAll: () => void): ActionDescriptor {
  return {
    id: LEFT_RAIL_EXPAND_TREE_ACTION_ID,
    label: legacyActionPresentation(LEFT_RAIL_EXPAND_TREE_LABEL),
    section: "navigate",
    icon: UnfoldVertical,
    run: expandAll,
  };
}

/** "Collapse the whole vault tree" — store-only intent over the expansion set. */
export function collapseTreeAction(collapseAll: () => void): ActionDescriptor {
  return {
    id: LEFT_RAIL_COLLAPSE_TREE_ACTION_ID,
    label: legacyActionPresentation(LEFT_RAIL_COLLAPSE_TREE_LABEL),
    section: "navigate",
    icon: FoldVertical,
    run: collapseAll,
  };
}

/** "Toggle the filter facets" — opens/closes the one canonical facet surface
 *  (filtering-has-one-canonical-surface). Store-only intent. */
export function toggleFacetsAction(): ActionDescriptor {
  return {
    id: LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
    label: legacyActionPresentation(LEFT_RAIL_TOGGLE_FACETS_LABEL),
    section: "navigate",
    icon: Filter,
    run: toggleFilterSidebar,
  };
}

/** "Reset all filters" — clears the canonical `dashboardState.filters` to empty.
 *  The caller supplies the scoped `resetFilters` closure (the stores write seam). */
export function resetFiltersAction(resetFilters: () => void): ActionDescriptor {
  return {
    id: LEFT_RAIL_RESET_FILTERS_ACTION_ID,
    label: legacyActionPresentation(LEFT_RAIL_RESET_FILTERS_LABEL),
    section: "navigate",
    icon: ListFilter,
    run: resetFilters,
  };
}

/** The vault tree's sort verbs (left-rail-tree-controls ADR D3): ONE descriptor
 *  per sort option under a stable shared id, consumed by the rail-top sort menu,
 *  the vault-section context menu, and the palette. Choosing the active key again
 *  flips direction (the store owns that gesture). Store-only intents. */
export function sortTreeActions(): ActionDescriptor[] {
  return RAIL_SORT_OPTIONS.map((option) => ({
    id: sortTreeActionId(option.id),
    label: legacyActionPresentation(`Sort by ${option.label}`),
    section: "navigate",
    icon: ArrowUpDown,
    run: () => setRailSortKey(option.id),
  }));
}

export function sortTreeActionId(key: RailSortKey): string {
  return `left-rail:sort-${key}`;
}

/** "Reset sorting" — restores the default order (latest activity). */
export function resetSortingAction(): ActionDescriptor {
  return {
    id: LEFT_RAIL_RESET_SORTING_ACTION_ID,
    label: legacyActionPresentation(LEFT_RAIL_RESET_SORTING_LABEL),
    section: "navigate",
    icon: ListRestart,
    run: resetRailSort,
  };
}

/** "Focus the document filter" — moves focus to the left-rail filter input. A
 *  store-only focus intent (the same `focusLeftRailFilter` the chord fires), shared by
 *  the keymap and the palette so the verb is authored once (the unified action plane). */
export function focusFilterAction(): ActionDescriptor {
  return {
    id: LEFT_RAIL_FOCUS_FILTER_ACTION_ID,
    label: legacyActionPresentation("Focus the document filter"),
    section: "navigate",
    icon: Search,
    run: focusLeftRailFilter,
  };
}

/** "Clear the document filter" — clears the left-rail feature-filter draft. The caller
 *  supplies the scoped `clearFilter` closure (the stores write seam). Shared by the
 *  keymap and the palette. */
export function clearFilterAction(clearFilter: () => void): ActionDescriptor {
  return {
    id: LEFT_RAIL_CLEAR_FILTER_ACTION_ID,
    label: legacyActionPresentation("Clear the document filter"),
    section: "navigate",
    icon: FilterX,
    run: clearFilter,
  };
}

function focusLeftRailFilter(): void {
  if (typeof document === "undefined") return;
  const input = document.querySelector<HTMLInputElement>(
    "[data-rail-filter-area] [data-kit-search-input]",
  );
  input?.focus();
  input?.select();
}

export function useLeftRailKeybindings(): void {
  const scope = useActiveScope();
  const clearFeatureFilter = useDashboardFeatureFilterDraft(scope).clear;
  const resetFilters = useDashboardFilterSidebarIntent(scope).clearFilters;

  useEffect(() => {
    const disposeBindings = registerKeybindings(deriveLeftRailKeybindings());
    const disposeCycle = registerKeyAction(
      LEFT_RAIL_CYCLE_MODE_ACTION_ID,
      (): ActionDescriptor => ({
        id: LEFT_RAIL_CYCLE_MODE_ACTION_ID,
        label: legacyActionPresentation("Cycle the browser mode (Vault / Code)"),
        run: cycleBrowserMode,
      }),
    );
    const disposeFocus = registerKeyAction(LEFT_RAIL_FOCUS_FILTER_ACTION_ID, () =>
      focusFilterAction(),
    );
    const disposeClear = registerKeyAction(LEFT_RAIL_CLEAR_FILTER_ACTION_ID, () =>
      clearFilterAction(clearFeatureFilter),
    );
    // The add-to-a-feature verb is a global chord (reachable while the stage is focused); the
    // expand/collapse-tree thunks live with the tree (TreeBrowser) where the loaded
    // keys are, so they only fire when the vault tree is mounted.
    const disposeNewDoc = registerKeyAction(LEFT_RAIL_NEW_DOC_ACTION_ID, () =>
      newDocumentAction(),
    );
    const disposeToggleFacets = registerKeyAction(
      LEFT_RAIL_TOGGLE_FACETS_ACTION_ID,
      () => toggleFacetsAction(),
    );
    const disposeResetFilters = registerKeyAction(
      LEFT_RAIL_RESET_FILTERS_ACTION_ID,
      () => resetFiltersAction(() => void resetFilters()),
    );

    return () => {
      disposeResetFilters();
      disposeToggleFacets();
      disposeNewDoc();
      disposeClear();
      disposeFocus();
      disposeCycle();
      disposeBindings();
    };
  }, [clearFeatureFilter, resetFilters]);
}
