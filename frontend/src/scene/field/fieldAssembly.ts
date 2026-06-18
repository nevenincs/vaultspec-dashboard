import { SceneController } from "../sceneController";
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
