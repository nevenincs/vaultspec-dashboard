import { beforeEach, describe, expect, it } from "vitest";

import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import {
  bindSelectionToScene,
  selectEdge,
  selectEvent,
  selectFromScene,
  selectNode,
} from "./selection";
import { useViewStore } from "./viewStore";

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

describe("shared selection (G2.b)", () => {
  beforeEach(() => {
    useViewStore.getState().select(null);
  });

  it("mirrors every selection kind into selectedId", () => {
    selectNode("feature:a");
    expect(useViewStore.getState().selection).toEqual({
      kind: "node",
      id: "feature:a",
    });
    selectEvent("evt-1", ["doc:x"]);
    expect(useViewStore.getState().selectedId).toBe("evt-1");
    selectEdge("e1");
    expect(useViewStore.getState().selection?.kind).toBe("edge");
  });

  it("focuses the scene on cross-region node selections", () => {
    const { scene, commands } = captureScene();
    const off = bindSelectionToScene(scene);
    selectNode("feature:a");
    expect(commands).toContainEqual({ kind: "focus-node", id: "feature:a" });
    off();
  });

  it("focuses the carried node for event selections", () => {
    const { scene, commands } = captureScene();
    const off = bindSelectionToScene(scene);
    selectEvent("evt-1", ["doc:x", "doc:y"]);
    expect(commands).toContainEqual({ kind: "focus-node", id: "doc:x" });
    off();
  });

  it("does not bounce focus back for stage-originated selections", () => {
    const { scene, commands } = captureScene();
    const off = bindSelectionToScene(scene);
    selectFromScene("feature:b");
    expect(commands).toEqual([]);
    // The very next cross-region selection focuses again.
    selectNode("feature:c");
    expect(commands).toContainEqual({ kind: "focus-node", id: "feature:c" });
    off();
  });
});
