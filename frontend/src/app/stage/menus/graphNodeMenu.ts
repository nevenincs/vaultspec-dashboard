// Graph node context menu (dashboard-context-menus W04.P11). This is the
// CANONICAL resolver for the "node" entity kind: a node is the same domain
// entity whether right-clicked on the stage or in the inspector, so one resolver
// serves both surfaces (the registry is one-resolver-per-kind). It is the richer
// superset - focus, open/close island, pin/unpin, expand/collapse ego, copy -
// reading the open/pin/working-set membership from the descriptor (filled at
// event time) so the resolver stays pure.
//
// App layer: store mutators are called directly (the same paths the scene `pin`
// event and keyboard E/X drive); copy routes through the seam. View-state
// mutations are gated out in time-travel (disabledInTimeTravel); focus and copy
// are not.

import { legacyActionPresentation } from "../../../platform/actions/action";
import { Crosshair, Maximize2, Minimize2, Network, Pin, PinOff } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionContext, ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { featureTagFromNodeId } from "../../../stores/server/liveAdapters";
import { activateEntity } from "../../../stores/view/activateEntity";
import {
  closeMenuNodeIsland,
  collapseMenuWorkingSet,
  expandMenuWorkingSet,
  focusMenuNode,
  toggleMenuPinnedNode,
} from "../../../stores/view/menuActions";
import {
  archiveFeatureAction,
  autofixFeatureAction,
  docStemFromNodeId,
  relateToSelectionAction,
} from "../../menus/sharedActions";

export function graphNodeMenu(
  entity: unknown,
  ctx?: ActionContext,
): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "node") return [];

  const actions: ActionDescriptor[] = [
    {
      id: "node:focus",
      label: legacyActionPresentation("Focus on stage"),
      section: "navigate",
      icon: Crosshair,
      run: () => focusMenuNode(normalizedEntity.id, normalizedEntity),
    },
    normalizedEntity.isOpen
      ? {
          id: "node:close-island",
          label: legacyActionPresentation("Close island"),
          section: "navigate",
          icon: Minimize2,
          run: () => closeMenuNodeIsland(normalizedEntity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:open",
          label: legacyActionPresentation("Open"),
          section: "navigate",
          icon: Maximize2,
          // The context-menu Open routes through the ONE canonical activate seam: a
          // PERMANENT dock tab (frame:false — the node is already on the canvas the
          // user right-clicked). Retires the on-canvas island as the default open.
          run: () =>
            void activateEntity(normalizedEntity.id, normalizedEntity.scope, {
              permanent: true,
              frame: false,
            }).catch(() => undefined),
          disabledInTimeTravel: true,
        },
    normalizedEntity.isPinned
      ? {
          id: "node:unpin",
          label: legacyActionPresentation("Unpin"),
          section: "transform",
          icon: PinOff,
          run: () => toggleMenuPinnedNode(normalizedEntity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:pin",
          label: legacyActionPresentation("Pin"),
          section: "transform",
          icon: Pin,
          run: () => toggleMenuPinnedNode(normalizedEntity.id),
          disabledInTimeTravel: true,
        },
    normalizedEntity.inWorkingSet
      ? {
          id: "node:collapse-ego",
          label: legacyActionPresentation("Collapse ego"),
          section: "transform",
          icon: Network,
          run: () => collapseMenuWorkingSet(normalizedEntity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:expand-ego",
          label: legacyActionPresentation("Expand ego"),
          section: "transform",
          icon: Network,
          run: () => expandMenuWorkingSet(normalizedEntity.id),
          disabledInTimeTravel: true,
        },
    copyAction({
      id: "node:copy-id",
      label: { key: "common:actions.copy" },
      text: normalizedEntity.id,
      what: "id",
    }),
  ];
  actions.push(
    normalizedEntity.title
      ? copyAction({
          id: "node:copy-title",
          label: { key: "common:actions.copyTitle" },
          text: normalizedEntity.title,
          what: "title",
        })
      : {
          id: "node:copy-title",
          label: { key: "common:actions.copyTitle" },
          section: "copy",
          disabled: true,
          disabledReason: legacyActionPresentation("no title"),
        },
  );
  // Relate this node to the focused node (vault link add) — enabled only for
  // document nodes with a different document focused.
  actions.push(
    relateToSelectionAction({
      id: "node:relate",
      srcStem: docStemFromNodeId(normalizedEntity.id),
      scope: normalizedEntity.scope,
      ctx,
      notADocumentReason: "only documents can be related",
    }),
  );
  // Autofix the feature's documents (vault check all --fix). Feature-scoped, so it is
  // a node/feature entity verb (not a standing palette command). Disabled-with-reason
  // for non-feature nodes.
  actions.push(
    autofixFeatureAction({
      id: "node:autofix-feature",
      feature: featureTagFromNodeId(normalizedEntity.id) ?? null,
      scope: normalizedEntity.scope,
    }),
  );
  // Archive the whole feature a feature node represents (vault feature archive).
  // Disabled-with-reason for non-feature nodes.
  actions.push(
    archiveFeatureAction({
      id: "node:archive-feature",
      feature: featureTagFromNodeId(normalizedEntity.id) ?? null,
      scope: normalizedEntity.scope,
    }),
  );
  return actions;
}

registerResolver("node", graphNodeMenu as ActionResolver);
