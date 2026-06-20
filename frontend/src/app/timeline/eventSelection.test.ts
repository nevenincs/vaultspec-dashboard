import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import { createLiveClient, liveScope } from "../../testing/liveClient";
import { useViewStore } from "../../stores/view/viewStore";
import type { LineageNode } from "../../stores/server/engine";
import { eventTouchSummary } from "../../stores/view/inspector";
import { MAX_PULSE_NODE_IDS, handleNodeClick, joinedNodeIds } from "./eventSelection";

let scope: string;
let documentNodeId: string;

beforeAll(async () => {
  scope = await liveScope();
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live timeline selection fixture has no document node");
  }
  documentNodeId = node.id;
});

afterEach(async () => {
  useViewStore.getState().selectEntity(null);
  useViewStore.getState().setScope(null);
  await createLiveClient()
    .patchDashboardState({ scope, selected_ids: [], hovered_id: null })
    .catch(() => undefined);
});

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

describe("eventTouchSummary (inspector node_ids line)", () => {
  it("names the carried ids and the dropped count honestly", () => {
    expect(eventTouchSummary(["commit:big", "doc:a"], 87)).toBe(
      "touches commit:big, doc:a +87 more",
    );
    expect(eventTouchSummary(["doc:a"], 0)).toBe("touches doc:a");
    expect(eventTouchSummary(["doc:a"])).toBe("touches doc:a");
  });
});

function node(id: string): LineageNode {
  return { id, doc_type: "plan", phase: "plan", dates: {}, degree: 0 };
}

describe("joinedNodeIds (the bounded node_ids join, S45)", () => {
  it("collects the node plus its 1-hop arc neighbors, node first, deduped", () => {
    const arcs = [
      { src: "doc:a", dst: "doc:b" },
      { src: "doc:c", dst: "doc:a" },
      { src: "doc:b", dst: "doc:c" }, // does not touch doc:a
      { src: "doc:a", dst: "doc:b" }, // duplicate neighbor
    ];
    const { ids, truncated } = joinedNodeIds("doc:a", arcs);
    expect(ids[0]).toBe("doc:a");
    expect(new Set(ids)).toEqual(new Set(["doc:a", "doc:b", "doc:c"]));
    expect(truncated).toBe(0);
  });

  it("caps the join set and reports the dropped count honestly", () => {
    const arcs = Array.from({ length: MAX_PULSE_NODE_IDS + 5 }, (_, i) => ({
      src: "doc:x",
      dst: `doc:n${i}`,
    }));
    const { ids, truncated } = joinedNodeIds("doc:x", arcs);
    expect(ids).toHaveLength(MAX_PULSE_NODE_IDS);
    expect(ids[0]).toBe("doc:x");
    // node + (cap+5) neighbors = cap+6 candidates; cap keeps `cap`, drops 6.
    expect(truncated).toBe(6);
  });
});

describe("handleNodeClick (canonical node selection + bounded node_ids pulse, S45)", () => {
  it("emits node selection through dashboard-state only and pulses its ego", async () => {
    const { scene, commands } = captureScene();
    await expect(
      handleNodeClick(
        node(documentNodeId),
        [
          { src: documentNodeId, dst: "doc:adr-1" },
          { src: "doc:exec-1", dst: documentNodeId },
        ],
        scene,
        scope,
      ),
    ).resolves.toBe(true);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
    expect(useViewStore.getState().selection).toBeNull();
    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set([documentNodeId, "doc:adr-1", "doc:exec-1"]),
    });
  });

  it("does not pulse without an accepted dashboard-state selection", async () => {
    const { scene, commands } = captureScene();
    await expect(
      handleNodeClick(
        node(documentNodeId),
        [{ src: documentNodeId, dst: "doc:adr-1" }],
        scene,
        { scope },
      ),
    ).resolves.toBe(false);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [],
    });
    expect(useViewStore.getState().selection).toBeNull();
    expect(commands).toEqual([]);
  });

  it("selects and pulses just the node when it has no arcs", async () => {
    const { scene, commands } = captureScene();
    await expect(handleNodeClick(node(documentNodeId), [], scene, scope)).resolves.toBe(
      true,
    );
    expect(useViewStore.getState().selection).toBeNull();
    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set([documentNodeId]),
    });
  });

  it("keeps the bounded join pure for arbitrary lineage ids", () => {
    const { ids } = joinedNodeIds("doc:plan-1", [
      { src: "doc:plan-1", dst: "doc:adr-1" },
      { src: "doc:exec-1", dst: "doc:plan-1" },
    ]);
    expect(ids).toEqual(["doc:plan-1", "doc:adr-1", "doc:exec-1"]);
  });
});
