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
import type { NodeEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { selectNode } from "../../../stores/view/selection";
import { usePinStore } from "../../../stores/view/pins";
import { useViewStore } from "../../../stores/view/viewStore";

export function graphNodeMenu(entity: NodeEntity): ActionDescriptor[] {
  const actions: ActionDescriptor[] = [
    {
      id: "node:focus",
      label: "Focus on stage",
      section: "navigate",
      icon: Crosshair,
      run: () => selectNode(entity.id),
    },
    entity.isOpen
      ? {
          id: "node:close-island",
          label: "Close island",
          section: "navigate",
          icon: Minimize2,
          run: () => useViewStore.getState().closeNode(entity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:open-island",
          label: "Open island",
          section: "navigate",
          icon: Maximize2,
          run: () => useViewStore.getState().openNode(entity.id),
          disabledInTimeTravel: true,
        },
    entity.isPinned
      ? {
          id: "node:unpin",
          label: "Unpin",
          section: "transform",
          icon: PinOff,
          run: () => usePinStore.getState().togglePin(entity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:pin",
          label: "Pin",
          section: "transform",
          icon: Pin,
          run: () => usePinStore.getState().togglePin(entity.id),
          disabledInTimeTravel: true,
        },
    entity.inWorkingSet
      ? {
          id: "node:collapse-ego",
          label: "Collapse ego",
          section: "transform",
          icon: Network,
          run: () => useViewStore.getState().removeFromWorkingSet(entity.id),
          disabledInTimeTravel: true,
        }
      : {
          id: "node:expand-ego",
          label: "Expand ego",
          section: "transform",
          icon: Network,
          run: () => useViewStore.getState().addToWorkingSet(entity.id),
          disabledInTimeTravel: true,
        },
    copyAction({ id: "node:copy-id", label: "Copy id", text: entity.id, what: "id" }),
  ];
  actions.push(
    entity.title
      ? copyAction({
          id: "node:copy-title",
          label: "Copy title",
          text: entity.title,
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
  return actions;
}

registerResolver("node", graphNodeMenu as ActionResolver<NodeEntity>);
