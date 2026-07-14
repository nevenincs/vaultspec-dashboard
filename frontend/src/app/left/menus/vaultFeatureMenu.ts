// Left-rail context menu: a FEATURE folder row in the vault tree (Features
// section). A pure resolver over the normalized descriptor — it reads only the
// descriptor's own fields (feature, scope, nodeId, expansionKey, expanded), never
// global state, so it is unit-testable in isolation. The registration below
// contributes it for the "vault-feature" entity kind at module load.
//
// The verbs are target-relative to the feature and composed from the shared
// builders the graph node and vault-doc rows use (unified-action-plane), so a
// feature row offers the SAME focus / new-document / autofix / archive verbs under
// shared ids — authored once, not re-derived here.

import { legacyActionPresentation } from "../../../platform/actions/action";
import { Crosshair, Filter, FoldVertical, UnfoldVertical } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { setDashboardFeatureFilter } from "../../../stores/server/dashboardState";
import { focusMenuNode } from "../../../stores/view/menuActions";
import { newDocumentAction } from "../../../stores/view/leftRailKeybindings";
import { toggleVaultBrowserTreeItem } from "../../../stores/view/browserTreeExpansion";
import { archiveFeatureAction, autofixFeatureAction } from "../../menus/sharedActions";

/**
 * The menu for a feature folder row. "Focus on stage" selects the feature's linked
 * node (navigation — disabled-with-reason until the feature resolves to a node);
 * "Expand/Collapse feature" toggles the folder through the one expansion authority;
 * "Filter to this feature" writes the one canonical feature-query filter so every
 * corpus view narrows to it; "Add to a Feature…" opens the create dialog pre-filled with
 * this feature; "Autofix"
 * and "Archive feature" are the shared feature verbs (confirm-guarded, time-travel-
 * gated); and the feature tag is copyable. Focus and expand are non-mutating, so no
 * `disabledInTimeTravel` on them.
 */
export function vaultFeatureMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "vault-feature") return [];

  const actions: ActionDescriptor[] = [];

  actions.push(
    normalizedEntity.nodeId
      ? {
          id: "vault-feature:focus",
          label: legacyActionPresentation("Focus on stage"),
          section: "navigate",
          icon: Crosshair,
          run: () => focusMenuNode(normalizedEntity.nodeId, normalizedEntity),
        }
      : {
          id: "vault-feature:focus",
          label: legacyActionPresentation("Focus on stage"),
          section: "navigate",
          icon: Crosshair,
          disabled: true,
          disabledReason: legacyActionPresentation(
            "no graph node for this feature yet",
          ),
        },
  );

  if (normalizedEntity.expansionKey) {
    const expansionKey = normalizedEntity.expansionKey;
    actions.push({
      id: "vault-feature:toggle",
      label: legacyActionPresentation(
        normalizedEntity.expanded ? "Collapse feature" : "Expand feature",
      ),
      section: "navigate",
      icon: normalizedEntity.expanded ? FoldVertical : UnfoldVertical,
      run: () => toggleVaultBrowserTreeItem(normalizedEntity.scope, expansionKey),
    });
  }

  // Filter the whole corpus to this feature — writes the ONE canonical feature-query
  // filter (the same write the rail's feature search performs), narrowing the rail
  // tree, the graph, and the timeline in lock-step (one-filter-authority).
  actions.push({
    id: "vault-feature:filter",
    label: legacyActionPresentation("Filter to this feature"),
    section: "navigate",
    icon: Filter,
    run: () => {
      void setDashboardFeatureFilter(normalizedEntity.scope, normalizedEntity.feature);
    },
  });

  // Create a new vault document pre-filled with this feature (vaultspec-core vault
  // add) — the shared rail create verb, here carrying the row's feature as prefill.
  actions.push(newDocumentAction(normalizedEntity.feature));

  // Autofix conformance over the feature's documents — the shared feature verb.
  actions.push(
    autofixFeatureAction({
      id: "vault-feature:autofix",
      feature: normalizedEntity.feature,
      scope: normalizedEntity.scope,
    }),
  );

  actions.push(
    copyAction({
      id: "vault-feature:copy-tag",
      label: legacyActionPresentation("Copy feature tag"),
      text: normalizedEntity.feature,
    }),
  );

  // Archive the completed feature — the shared destructive feature verb.
  actions.push(
    archiveFeatureAction({
      id: "vault-feature:archive",
      feature: normalizedEntity.feature,
      scope: normalizedEntity.scope,
    }),
  );

  return actions;
}

registerResolver("vault-feature", vaultFeatureMenu as ActionResolver);
