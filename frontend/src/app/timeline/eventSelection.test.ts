import { describe, expect, it } from "vitest";

import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import { useViewStore } from "../../stores/view/viewStore";
import { handleEventClick } from "./eventSelection";

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

describe("handleEventClick (G2.b join on node_ids)", () => {
  it("selects the event and pulses its carried nodes on the stage", () => {
    const { scene, commands } = captureScene();
    handleEventClick(
      {
        id: "evt-9",
        ts: "2026-02-01T00:00:00Z",
        kind: "commit",
        ref: "abc",
        node_ids: ["commit:abc", "doc:x"],
      },
      scene,
    );
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: "evt-9",
      nodeIds: ["commit:abc", "doc:x"],
    });
    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set(["commit:abc", "doc:x"]),
    });
  });

  it("selects without pulsing when an event carries no nodes", () => {
    const { scene, commands } = captureScene();
    handleEventClick(
      {
        id: "evt-0",
        ts: "2026-02-01T00:00:00Z",
        kind: "commit",
        ref: "x",
        node_ids: [],
      },
      scene,
    );
    expect(commands.filter((c) => c.kind === "pulse")).toHaveLength(0);
  });
});
