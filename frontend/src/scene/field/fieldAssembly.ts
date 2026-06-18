import { SceneController } from "../sceneController";
import { ThreeField } from "../three/threeField";
import { CosmosField } from "./cosmosField";

/** Build the app's scene: one controller, one cosmos.gl field behind it. */
export function createDashboardScene(): {
  controller: SceneController;
  field: CosmosField;
} {
  const field = new CosmosField();
  const controller = new SceneController(field);
  field.controller = controller;
  return { controller, field };
}

/** Parallel three.js GPGPU field behind the same SceneController seam. Used by the
 *  three-lab today; swap-in candidate for `createDashboardScene` once it supersedes
 *  cosmos. */
export function createThreeScene(): {
  controller: SceneController;
  field: ThreeField;
} {
  const field = new ThreeField();
  const controller = new SceneController(field);
  field.controller = controller;
  return { controller, field };
}
