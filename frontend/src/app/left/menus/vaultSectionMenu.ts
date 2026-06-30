// Left-rail context menu: a top-level SECTION header (Features / Documents) in the
// vault tree. A pure resolver over the normalized descriptor — it reads only the
// descriptor's own `section` and `scope`, never global state, so it is unit-testable
// in isolation. The registration below contributes it for the "vault-section" entity
// kind at module load.
//
// The expand-all / collapse-all verbs are the SAME shared builders the left-rail
// keymap binds (unified-action-plane): `expandTreeAction` / `collapseTreeAction`
// under their `left-rail:*-tree` ids, here driven by the imperative vault-tree
// expansion seam so the verb is authored once and the keymap and this menu cannot
// drift. "New document…" is the shared rail create verb, unfilled at section level.

import type { ActionDescriptor } from "../../../platform/actions/action";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import {
  collapseTreeAction,
  expandTreeAction,
  newDocumentAction,
} from "../../../stores/view/leftRailKeybindings";
import {
  collapseVaultBrowserTree,
  expandAllVaultBrowserTree,
} from "../../../stores/view/browserTreeExpansion";

/**
 * The menu for a section header (Features / Documents). Expand-all and collapse-all
 * over the whole vault tree (the shared keymap verbs, run through the one expansion
 * authority) plus a New document escape hatch. All non-mutating, so none carries
 * `disabledInTimeTravel`.
 */
export function vaultSectionMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "vault-section") return [];
  const scope = normalizedEntity.scope;

  return [
    expandTreeAction(() => expandAllVaultBrowserTree(scope)),
    collapseTreeAction(() => collapseVaultBrowserTree(scope)),
    newDocumentAction(),
  ];
}

registerResolver("vault-section", vaultSectionMenu as ActionResolver);
