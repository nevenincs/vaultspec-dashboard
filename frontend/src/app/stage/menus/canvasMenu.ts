// Empty-canvas context menu (dashboard-context-menus W04.P11): right-click on
// the field background (no node under the pointer). Camera verbs go through the
// SceneController command channel via getScene(), while graph layout intent lives
// in dashboard-state through the LayoutSelector. Clear working set is a
// view-store call gated in time-travel.

import { legacyActionPresentation } from "../../../platform/actions/action";
import { Maximize, RotateCcw, Trash2, XCircle } from "lucide-react";

import type { ActionDescriptor } from "../../../platform/actions/action";
import { registerResolver } from "../../../platform/actions/registry";
import { toggleFollowModeAction } from "../../../stores/view/chromeActions";
import { clearMenuWorkingSet, focusMenuNode } from "../../../stores/view/menuActions";
import { getScene } from "../Stage";

export function canvasMenu(): ActionDescriptor[] {
  return [
    {
      id: "canvas:fit",
      label: legacyActionPresentation("Fit to view"),
      section: "navigate",
      icon: Maximize,
      run: () => getScene().controller.command({ kind: "fit-to-view" }),
    },
    {
      id: "canvas:reset",
      label: legacyActionPresentation("Reset view"),
      section: "navigate",
      icon: RotateCcw,
      run: () => getScene().controller.command({ kind: "reset-view" }),
    },
    {
      // Clear the current node selection (the shared dashboard selection) — the
      // empty-canvas counterpart to the graph-walk Escape clear.
      id: "canvas:clear-selection",
      label: legacyActionPresentation("Clear selection"),
      section: "navigate",
      icon: XCircle,
      run: () => focusMenuNode(null),
    },
    {
      id: "canvas:clear-working-set",
      label: legacyActionPresentation("Clear working set"),
      section: "transform",
      icon: Trash2,
      run: clearMenuWorkingSet,
      disabledInTimeTravel: true,
    },
    // Follow mode is the graph<->rail SELECTION tether, so it is natural on the
    // graph's own right-click menu too (composed from the ONE shared builder under
    // its shared id — unified-action-plane; also in the background menu).
    toggleFollowModeAction(),
  ];
}

registerResolver("canvas", canvasMenu);
