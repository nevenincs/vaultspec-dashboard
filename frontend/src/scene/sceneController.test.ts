import { describe, expect, it } from "vitest";

import { SceneController } from "./sceneController";

describe("SceneController", () => {
  it("holds scene data outside React and reports counts", () => {
    const scene = new SceneController();
    scene.command({
      kind: "set-data",
      nodes: [
        { id: "feature:editor-demo", x: 0, y: 0 },
        { id: "doc:2026-06-12-editor-demo-plan", x: 1, y: 1 },
      ],
      edges: [["doc:2026-06-12-editor-demo-plan", "feature:editor-demo"]],
    });
    expect(scene.nodeCount).toBe(2);
    expect(scene.edgeCount).toBe(1);
  });

  it("delivers interaction events to subscribers and supports unsubscribe", () => {
    const scene = new SceneController();
    const seen: string[] = [];
    const off = scene.on((event) => {
      seen.push(event.kind);
    });
    scene.emit({ kind: "select", id: "feature:editor-demo" });
    off();
    scene.emit({ kind: "hover", id: null });
    expect(seen).toEqual(["select"]);
  });
});
