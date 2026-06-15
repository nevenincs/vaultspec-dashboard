// Empty-canvas context menu (dashboard-context-menus W04.P11): right-click on
// the field background (no node under the pointer). Camera/layout verbs go
// through the SceneController command channel via getScene() - the established
// chrome->scene pattern (AlgorithmPanel, MinimapWidget, NavToolbar) - and clear
// working set is a view-store call. Fit/reset/layout are pure view ops (not
// gated); clearing the working set is gated in time-travel.

import { Maximize, RotateCcw, Shuffle, Trash2 } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { registerResolver } from "../../../platform/actions/registry";
import { useViewStore } from "../../../stores/view/viewStore";
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
      id: "canvas:toggle-layout",
      label: "Toggle layout mode",
      section: "transform",
      icon: Shuffle,
      run: () => {
        const mode = getScene().controller.getLayoutState().mode;
        getScene().controller.command({
          kind: "set-layout-mode",
          mode: mode === "force" ? "circular" : "force",
        });
      },
    },
    {
      id: "canvas:clear-working-set",
      label: "Clear working set",
      section: "transform",
      icon: Trash2,
      run: () => useViewStore.getState().clearWorkingSet(),
      disabledInTimeTravel: true,
    },
  ];
}

registerResolver("canvas", canvasMenu);
