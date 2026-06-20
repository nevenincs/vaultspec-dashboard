import { describe, expect, it } from "vitest";

import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import { focusFromWalk } from "./selection";

function captureScene() {
  const commands: SceneCommand[] = [];
  const field: SceneFieldRenderer = {
    mount: () => undefined,
    resize: () => undefined,
    destroy: () => undefined,
    command: (cmd) => commands.push(cmd),
  };
  return { scene: new SceneController(field), commands };
}

describe("focusFromWalk: keyboard walk re-centers instantly (HIGH-2)", () => {
  it("issues exactly one focus-node with animate:false", async () => {
    const { scene, commands } = captureScene();

    await focusFromWalk(scene, "feature:walked");
    expect(commands.filter((c) => c.kind === "focus-node")).toEqual([
      { kind: "focus-node", id: "feature:walked", animate: false },
    ]);
  });

  it("normalizes the walked focus id before commanding the scene", async () => {
    const { scene, commands } = captureScene();

    await focusFromWalk(scene, " feature:walked ");
    expect(commands.filter((c) => c.kind === "focus-node")).toEqual([
      { kind: "focus-node", id: "feature:walked", animate: false },
    ]);
  });

  it("rejects an invalid walked focus id before commanding the scene", async () => {
    const { scene, commands } = captureScene();

    await expect(focusFromWalk(scene, "   ")).resolves.toBe(false);
    expect(commands.filter((c) => c.kind === "focus-node")).toEqual([]);
  });

  it("a clearing walk (null) does not command a focus", async () => {
    const { scene, commands } = captureScene();

    await focusFromWalk(scene, null);
    expect(commands.filter((c) => c.kind === "focus-node")).toEqual([]);
  });
});
