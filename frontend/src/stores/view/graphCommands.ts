// Stores-layer graph command verbs (deferral #13). These forward through the
// scene-command bridge so the command palette and keymap (stores layer) can drive
// the graph camera/layout without importing the scene. The same effects the
// GraphControls buttons fire (camera verbs, freeze, reset-to-defaults) are now
// reachable as enrolled actions, not bespoke UI handlers alone.

import {
  GRAPH_CONTROLS_APPEARANCE_DEFAULTS,
  GRAPH_CONTROLS_TUNE_DEFAULTS,
  setGraphControlsAppearanceParams,
  setGraphControlsFrozen,
  setGraphControlsTuneParams,
} from "./graphControlsChrome";
import { runSceneCommand } from "./sceneCommandBridge";

export function graphFitToView(): void {
  runSceneCommand({ kind: "fit-to-view" });
}

export function graphResetView(): void {
  runSceneCommand({ kind: "reset-view" });
}

export function graphZoomIn(): void {
  runSceneCommand({ kind: "zoom-in" });
}

export function graphZoomOut(): void {
  runSceneCommand({ kind: "zoom-out" });
}

/** Set the layout freeze: persist the chrome state AND tell the scene. */
export function setGraphFrozen(frozen: boolean, scope: unknown): void {
  setGraphControlsFrozen(frozen, scope);
  runSceneCommand({ kind: "set-frozen", frozen });
}

/**
 * Reset both force and appearance params to defaults — the same effect as the
 * GraphControls "Reset to defaults" button (its param→scene mapping replicated
 * here so the verb is reachable from the palette). The scene's `set-force-params`
 * takes `charge = -repulsion`; the rest pass through.
 */
export function resetGraphControlsToDefaults(): void {
  setGraphControlsTuneParams(GRAPH_CONTROLS_TUNE_DEFAULTS);
  setGraphControlsAppearanceParams(GRAPH_CONTROLS_APPEARANCE_DEFAULTS);
  runSceneCommand({
    kind: "set-force-params",
    params: {
      charge: -GRAPH_CONTROLS_TUNE_DEFAULTS.repulsion,
      linkDistance: GRAPH_CONTROLS_TUNE_DEFAULTS.linkDistance,
      linkStrength: GRAPH_CONTROLS_TUNE_DEFAULTS.linkSpring,
    },
  });
  runSceneCommand({
    kind: "set-appearance-params",
    params: { ...GRAPH_CONTROLS_APPEARANCE_DEFAULTS },
  });
}
