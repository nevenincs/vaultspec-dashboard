import { describe, expect, it } from "vitest";

import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import { useViewStore } from "../../stores/view/viewStore";
import type { LineageNode } from "../../stores/server/engine";
import { eventTouchSummary } from "../right/Inspector";
import {
  MAX_PULSE_NODE_IDS,
  handleEventClick,
  handleNodeClick,
  joinedNodeIds,
} from "./eventSelection";

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

  it("pulses what's carried and surfaces truncation honestly (contract §5 bound)", () => {
    const { scene, commands } = captureScene();
    handleEventClick(
      {
        id: "evt-big",
        ts: "2026-02-01T00:00:00Z",
        kind: "commit",
        ref: "big",
        node_ids: ["commit:big", "doc:a"],
        truncated_node_ids: 87,
      },
      scene,
    );
    // Pulse exactly the carried ids — never a silent guess at the rest.
    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set(["commit:big", "doc:a"]),
    });
    const selection = useViewStore.getState().selection;
    expect(selection).toMatchObject({ kind: "event", truncatedNodeIds: 87 });
    // The inspector line names the dropped count.
    expect(eventTouchSummary(["commit:big", "doc:a"], 87)).toBe(
      "touches commit:big, doc:a +87 more",
    );
    expect(eventTouchSummary(["doc:a"], 0)).toBe("touches doc:a");
    expect(eventTouchSummary(["doc:a"])).toBe("touches doc:a");
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

describe("handleNodeClick (shared Selection + bounded node_ids pulse, S45)", () => {
  it("selects the lineage node through the ONE shared selection and pulses its ego", () => {
    const { scene, commands } = captureScene();
    handleNodeClick(
      node("doc:plan-1"),
      [
        { src: "doc:plan-1", dst: "doc:adr-1" },
        { src: "doc:exec-1", dst: "doc:plan-1" },
      ],
      scene,
    );
    // Selection flows through the shared concept as a node (not a bespoke kind).
    expect(useViewStore.getState().selection).toEqual({
      kind: "node",
      id: "doc:plan-1",
    });
    // The pulse cross-highlights the node + its 1-hop lineage neighbors.
    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set(["doc:plan-1", "doc:adr-1", "doc:exec-1"]),
    });
  });

  it("selects and pulses just the node when it has no arcs", () => {
    const { scene, commands } = captureScene();
    handleNodeClick(node("doc:lonely"), [], scene);
    expect(useViewStore.getState().selection).toEqual({
      kind: "node",
      id: "doc:lonely",
    });
    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set(["doc:lonely"]),
    });
  });
});
