// Left-rail context menu: a top-level SECTION header (Features / Documents) in the
// vault tree. A pure resolver over the normalized descriptor — it reads only the
// descriptor's own `section` and `scope`, never global state, so it is unit-testable
// in isolation. The registration below contributes it for the "vault-section" entity
// kind at module load.
//
// Every verb is a SAME shared builder the left-rail keymap/palette bind
// (unified-action-plane): expand/collapse under their `left-rail:*-tree` ids
// driven by the imperative vault-tree expansion seam, the sort plane + reset
// verbs (left-rail-tree-controls ADR D3/D4) under their `left-rail:sort-*` /
// reset ids, so this menu and every other surface cannot drift. "Add to a Feature…"
// is the shared rail create verb, unfilled at section level.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  clearDashboardFilters,
  setDashboardFeatureFilter,
} from "../../../stores/server/dashboardState";
import {
  clearFilterAction,
  collapseTreeAction,
  expandTreeAction,
  newDocumentAction,
  resetFiltersAction,
  resetSortingAction,
  sortTreeActions,
  toggleFacetsAction,
} from "../../../stores/view/leftRailKeybindings";
import {
  collapseVaultBrowserTree,
  expandAllVaultBrowserTree,
} from "../../../stores/view/browserTreeExpansion";

/**
 * The menu for a section header (Features / Documents): expand-all/collapse-all
 * over the whole vault tree (the shared keymap verbs, run through the one
 * expansion authority), the sort plane (one shared verb per option + reset), the
 * canonical filter resets (reset-filters / clear-filter / toggle-facets — the
 * SAME builders the keymap chords and the palette fire, here bound to the
 * imperative scoped write seams the other rail menus use), and an Add-to-a-Feature
 * escape hatch. All store-only/state intents, so none carries
 * `disabledInTimeTravel`.
 */
export function vaultSectionMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "vault-section") return [];
  const scope = normalizedEntity.scope;

  return [
    expandTreeAction(() => expandAllVaultBrowserTree(scope)),
    collapseTreeAction(() => collapseVaultBrowserTree(scope)),
    ...sortTreeActions(),
    resetSortingAction(),
    toggleFacetsAction(),
    resetFiltersAction(() => void clearDashboardFilters(scope)),
    clearFilterAction(() => void setDashboardFeatureFilter(scope, "")),
    newDocumentAction(),
  ];
}

registerResolver("vault-section", vaultSectionMenu as ActionResolver);
