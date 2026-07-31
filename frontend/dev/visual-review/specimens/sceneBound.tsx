// The scene-owning composites, deliberately excluded from the state matrix.
//
// The WebGL canvas is an app-lifetime, portal-pinned SINGLETON (`Stage` creates the
// scene at module scope; the graph rule forbids re-parenting or remounting it). Four
// simultaneous state cells therefore cannot each own the canvas, and a single mounted
// instance would drag the whole scene runtime — not authored props — into the desk.
// Their VISUAL states are the composition of surfaces the desk already reviews
// (`CanvasStateOverlay` carries the stage's four states; `DocPanel`, `Timeline` and
// the rails carry the rest), so excluding the composites loses no reviewable state.

import type { SpecimenDef } from "../registry";

const SCENE_SINGLETON =
  "This composite owns (or directly hosts) the WebGL scene singleton — an " +
  "app-lifetime, portal-pinned canvas that cannot be mounted per state cell. Its " +
  "states are reviewed through the surfaces it composes: CanvasStateOverlay carries " +
  "the canvas's normal / loading / empty / degraded treatments, and the panels, " +
  "rails and viewers are each reviewed on this desk individually.";

export const sceneBoundSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "stage-stage": { excluded: SCENE_SINGLETON },
  "stage-dockworkspace": { excluded: SCENE_SINGLETON },
  "shell-appshell": {
    excluded:
      "The application root: it mounts the whole shell — including the scene-owning " +
      "DockWorkspace — enrolls global keybindings, and takes over the document. Its " +
      "regions (rails, stage, panels, viewers) are each reviewed on this desk " +
      "individually.",
  },
};
