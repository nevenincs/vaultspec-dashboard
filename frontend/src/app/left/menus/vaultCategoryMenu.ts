// Left-rail context menu: a CATEGORY (doc-type) folder row in the vault tree — a
// feature sub-folder (Features section) or a top-level category (Documents
// section). A pure resolver over the normalized descriptor — it reads only the
// descriptor's own fields (docType, feature, scope, expansionKey, expanded), never
// global state, so it is unit-testable in isolation. The registration below
// contributes it for the "vault-category" entity kind at module load.

import { legacyActionPresentation } from "../../../platform/actions/action";
import { Filter, FoldVertical, UnfoldVertical } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { toggleDashboardFilterFacet } from "../../../stores/server/dashboardState";
import { newDocumentAction } from "../../../stores/view/leftRailKeybindings";
import { toggleVaultBrowserTreeItem } from "../../../stores/view/browserTreeExpansion";
import { docGroupLabel } from "../vaultRowPresentation";

/**
 * The menu for a category folder row. "Expand/Collapse" toggles the folder through
 * the one expansion authority; "Filter to this type" toggles the canonical
 * `doc_types` facet (the SAME write the graph legend performs) so every corpus view
 * narrows; "Add to a Feature…" opens the create dialog (pre-filled with the parent
 * feature when this is a feature sub-folder, otherwise unfilled); the human category
 * label is copyable. None of the verbs mutate the corpus, so none carries
 * `disabledInTimeTravel`.
 */
export function vaultCategoryMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "vault-category") return [];

  const actions: ActionDescriptor[] = [];

  if (normalizedEntity.expansionKey) {
    const expansionKey = normalizedEntity.expansionKey;
    actions.push({
      id: "vault-category:toggle",
      label: legacyActionPresentation(
        normalizedEntity.expanded ? "Collapse category" : "Expand category",
      ),
      section: "navigate",
      icon: normalizedEntity.expanded ? FoldVertical : UnfoldVertical,
      run: () => toggleVaultBrowserTreeItem(normalizedEntity.scope, expansionKey),
    });
  }

  // Filter the whole corpus to this doc type — toggles the ONE canonical `doc_types`
  // facet (the graph legend's write path), narrowing the rail tree, the graph, and
  // the timeline in lock-step (one-filter-authority).
  actions.push({
    id: "vault-category:filter",
    label: legacyActionPresentation("Filter to this type"),
    section: "navigate",
    icon: Filter,
    run: () => {
      void toggleDashboardFilterFacet(
        normalizedEntity.scope,
        "doc_types",
        normalizedEntity.docType,
      );
    },
  });

  // Add to a Feature — pre-filled with the parent feature when this is a feature
  // sub-folder; unfilled for a top-level Documents-section category.
  actions.push(newDocumentAction(normalizedEntity.feature));

  actions.push(
    copyAction({
      id: "vault-category:copy-category",
      label: legacyActionPresentation("Copy category"),
      text: docGroupLabel(normalizedEntity.docType),
    }),
  );

  return actions;
}

registerResolver("vault-category", vaultCategoryMenu as ActionResolver);
