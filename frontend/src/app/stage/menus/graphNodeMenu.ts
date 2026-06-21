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

import { Crosshair, Maximize2, Minimize2, Network, Pin, PinOff } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionContext, ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { featureTagFromNodeId } from "../../../stores/server/liveAdapters";
import {
  closeMenuNodeIsland,
  collapseMenuWorkingSet,
  expandMenuWorkingSet,
  focusMenuNode,
  openMenuNodeIsland,
  toggleMenuPinnedNode,
} from "../../../stores/view/menuActions";
import {
  archiveFeatureAction,
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
      label: "Focus on stage",
      section: "navigate",
      icon: Crosshair,
      run: () => focusMenuNode(normalizedEntity.id, normalizedEntity),
    },
    normalizedEntity.isOpen
      ? {
          id: "node:close-island",
          label: "Close island",
          section: "navigate",
          icon: Minimize2,
          run: () => closeMenuNodeIsland(normalizedEntity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:open-island",
          label: "Open island",
          section: "navigate",
          icon: Maximize2,
          run: () => openMenuNodeIsland(normalizedEntity.id, normalizedEntity),
          disabledInTimeTravel: true,
        },
    normalizedEntity.isPinned
      ? {
          id: "node:unpin",
          label: "Unpin",
          section: "transform",
          icon: PinOff,
          run: () => toggleMenuPinnedNode(normalizedEntity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:pin",
          label: "Pin",
          section: "transform",
          icon: Pin,
          run: () => toggleMenuPinnedNode(normalizedEntity.id),
          disabledInTimeTravel: true,
        },
    normalizedEntity.inWorkingSet
      ? {
          id: "node:collapse-ego",
          label: "Collapse ego",
          section: "transform",
          icon: Network,
          run: () => collapseMenuWorkingSet(normalizedEntity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:expand-ego",
          label: "Expand ego",
          section: "transform",
          icon: Network,
          run: () => expandMenuWorkingSet(normalizedEntity.id),
          disabledInTimeTravel: true,
        },
    copyAction({
      id: "node:copy-id",
      label: "Copy id",
      text: normalizedEntity.id,
      what: "id",
    }),
  ];
  actions.push(
    normalizedEntity.title
      ? copyAction({
          id: "node:copy-title",
          label: "Copy title",
          text: normalizedEntity.title,
          what: "title",
        })
      : {
          id: "node:copy-title",
          label: "Copy title",
          section: "copy",
          disabled: true,
          disabledReason: "no title",
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
