// Island interior context menu (dashboard-context-menus W04.P11): an opened
// node rendered as a DOM island above the field. Focus re-centers it on the
// stage; close removes the island; copy id. Pure over the descriptor; closing
// is a view-state op gated in time-travel.

import { Crosshair, Minimize2 } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { copyAction } from "../../../platform/actions/clipboardActions";
import { normalizeEntityDescriptor } from "../../../platform/actions/entity";
import type { ActionResolver } from "../../../platform/actions/registry";
import { registerResolver } from "../../../platform/actions/registry";
import { closeMenuNodeIsland, focusMenuNode } from "../../../stores/view/menuActions";

export function islandMenu(entity: unknown): ActionDescriptor[] {
  const normalizedEntity = normalizeEntityDescriptor(entity);
  if (normalizedEntity?.kind !== "island") return [];

  return [
    {
      id: "island:focus",
      label: { key: "common:actions.focusOnStage" },
      section: "navigate",
      icon: Crosshair,
      run: () => focusMenuNode(normalizedEntity.id, normalizedEntity),
    },
    {
      id: "island:close",
      label: { key: "common:actions.closeIsland" },
      section: "navigate",
      icon: Minimize2,
      run: () => closeMenuNodeIsland(normalizedEntity.id),
      disabledInTimeTravel: true,
    },
    copyAction({
      id: "island:copy-id",
      label: { key: "common:actions.copy" },
      text: normalizedEntity.id,
      what: "id",
    }),
  ];
}

registerResolver("island", islandMenu as ActionResolver);
