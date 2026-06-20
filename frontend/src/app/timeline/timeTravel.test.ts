import { beforeEach, describe, expect, it } from "vitest";

import { SceneController } from "../../scene/sceneController";
import { useLiveStatusStore } from "../../stores/server/liveStatus";
import { mapDelta, sceneTarget } from "./timeTravel";

describe("time-travel delta mapping", () => {
  it("delegates malformed historical diff entries to the shared graph mapper", () => {
    expect(mapDelta(null)).toBeNull();
    expect(mapDelta({ op: "add", t: 100, seq: 1 })).toBeNull();
    expect(
      mapDelta({
        op: "change",
        edge: { id: " edge:a-b ", src: " doc:a ", dst: " doc:b " },
        t: 200,
        seq: 2,
      }),
    ).toMatchObject({
      op: "change",
      edge: { id: "edge:a-b", src: "doc:a", dst: "doc:b" },
      t: 200,
      seq: 2,
    });
  });
});

describe("time-travel scene target", () => {
  beforeEach(() => {
    useLiveStatusStore.getState().reset();
  });

  it("updates broken-link state from the exact historical slice pushed to the scene", () => {
    const scene = new SceneController();
    const target = sceneTarget(scene);

    target.pushSlice(
      [
        { id: "doc:a", kind: "plan" },
        { id: "doc:b", kind: "adr" },
      ],
      [
        {
          id: "edge:broken",
          src: "doc:a",
          dst: "doc:b",
          relation: "mentions",
          tier: "structural",
          confidence: 1,
          state: "broken",
        },
        {
          id: "edge:resolved",
          src: "doc:a",
          dst: "doc:b",
          relation: "mentions",
          tier: "structural",
          confidence: 1,
          state: "resolved",
        },
      ],
      126,
    );

    expect(scene.nodeCount).toBe(2);
    expect(scene.edgeCount).toBe(2);
    expect(useLiveStatusStore.getState().brokenLinkCount).toBe(1);
  });
});
