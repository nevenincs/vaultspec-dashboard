import { SceneController } from "../sceneController";
import { ThreeField } from "../three/threeField";

/** Build the app's scene: one controller, one three.js + d3-force field behind it.
 *  This is the SINGLE live graph surface (graph-backend-unification ADR D1); the
 *  former Cosmos (@cosmos.gl) and Pixi fields are retired. The three-lab drives the
 *  same factory so the lab and the app exercise an identical field. */
export function createDashboardScene(): {
  controller: SceneController;
  field: ThreeField;
} {
  const field = new ThreeField();
  const controller = new SceneController(field);
  field.controller = controller;
  return { controller, field };
}
