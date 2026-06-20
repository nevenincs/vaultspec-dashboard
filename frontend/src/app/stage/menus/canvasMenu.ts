// Empty-canvas context menu (dashboard-context-menus W04.P11): right-click on
// the field background (no node under the pointer). Camera verbs go through the
// SceneController command channel via getScene(), while graph layout intent lives
// in dashboard-state through the LayoutSelector. Clear working set is a
// view-store call gated in time-travel.

import { Maximize, RotateCcw, Trash2 } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { registerResolver } from "../../../platform/actions/registry";
import { clearMenuWorkingSet } from "../../../stores/view/menuActions";
import { getScene } from "../Stage";

export function canvasMenu(): ActionDescriptor[] {
  return [
    {
      id: "canvas:fit",
      label: "Fit to view",
      section: "navigate",
      icon: Maximize,
      run: () => getScene().controller.command({ kind: "fit-to-view" }),
    },
    {
      id: "canvas:reset",
      label: "Reset view",
      section: "navigate",
      icon: RotateCcw,
      run: () => getScene().controller.command({ kind: "reset-view" }),
    },
    {
      id: "canvas:clear-working-set",
      label: "Clear working set",
      section: "transform",
      icon: Trash2,
      run: clearMenuWorkingSet,
      disabledInTimeTravel: true,
    },
  ];
}

registerResolver("canvas", canvasMenu);
