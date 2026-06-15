// Island interior context menu (dashboard-context-menus W04.P11): an opened
// node rendered as a DOM island above the field. Focus re-centers it on the
// stage; close removes the island; copy id. Pure over the descriptor; closing
// is a view-state op gated in time-travel.

import { Crosshair, Minimize2 } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import type { IslandEntity } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { selectNode } from "../../../stores/view/selection";
import { useViewStore } from "../../../stores/view/viewStore";

export function islandMenu(entity: IslandEntity): ActionDescriptor[] {
  return [
    {
      id: "island:focus",
      label: "Focus on stage",
      section: "navigate",
      icon: Crosshair,
      run: () => selectNode(entity.id),
    },
    {
      id: "island:close",
      label: "Close island",
      section: "navigate",
      icon: Minimize2,
      run: () => useViewStore.getState().closeNode(entity.id),
      disabledInTimeTravel: true,
    },
    copyAction({ id: "island:copy-id", label: "Copy id", text: entity.id, what: "id" }),
  ];
}

registerResolver("island", islandMenu as ActionResolver<IslandEntity>);
