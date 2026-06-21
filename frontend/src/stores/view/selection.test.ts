import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createLiveClient, liveScope } from "../../testing/liveClient";
import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import {
  closeNodeIsland,
  isNodeIslandOpen,
  normalizeOpenedNodeIslandIds,
  normalizeSelectionMetadataId,
  normalizeSelectionScope,
  openGraphNodeFromScene,
  openNodeIsland,
  openNodeIslandFromWalk,
  projectDashboardSelectionToScene,
  pulseSelectionNodes,
  selectNodeAndPulse,
  resolveSelection,
  selectEdge,
  selectEvent,
  selectEventNodes,
  selectFirstNode,
  selectFromScene,
  selectNode,
  selectNodes,
  SELECTION_METADATA_ID_MAX_CHARS,
  setHoveredNodeId,
} from "./selection";
import { useViewStore } from "./viewStore";

let scope: string;
let documentNodeId: string;

beforeAll(async () => {
  scope = await liveScope();
  const slice = await createLiveClient().graphQuery({ scope, granularity: "document" });
  const node = slice.nodes.find((entry) => entry.id.startsWith("doc:"));
  if (!node) {
    throw new Error("live selection test fixture has no document node");
  }
  documentNodeId = node.id;
});

afterEach(async () => {
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

describe("selection seam", () => {
  beforeEach(() => {
    useViewStore.getState().selectEntity(null);
    useViewStore.getState().setScope(null);
    useViewStore.setState({ openedIds: [] });
  });

  it("keeps hover as transient view-local state", () => {
    setHoveredNodeId("doc:canonical");
    expect(useViewStore.getState().hoveredId).toBe("doc:canonical");

    setHoveredNodeId(null);
    expect(useViewStore.getState().hoveredId).toBeNull();
  });

  it("keeps node selection out of local viewStore when no scope is active", async () => {
    await expect(selectNode("feature:a")).resolves.toBe(false);
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("normalizes runtime scope before dashboard selection writes", async () => {
    expect(normalizeSelectionScope(" scope-a ")).toBe("scope-a");
    expect(normalizeSelectionScope("   ")).toBeNull();
    expect(normalizeSelectionScope({ scope: "scope-a" })).toBeNull();

    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({
      scope,
      selected_ids: [documentNodeId],
    });

    await expect(selectNode(null, { scope })).resolves.toBe(false);
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
  });

  it("writes explicit-scope node selection when the view store has no scope", async () => {
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await selectNode(documentNodeId, scope);

    const state = await createLiveClient().dashboardState(scope);
    expect(state.selected_ids).toEqual([documentNodeId]);
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("normalizes public node-selection inputs without treating malformed ids as clear", async () => {
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({
      scope,
      selected_ids: [documentNodeId],
    });

    await expect(selectNode(` ${documentNodeId} `, scope)).resolves.toBe(true);
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });

    await expect(selectNode("   ", scope)).resolves.toBe(false);
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });

    await expect(selectNode(null, scope)).resolves.toBe(true);
    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [],
    });
  });

  it("writes explicit-scope scene selection through the node-selection seam", async () => {
    useViewStore.getState().setScope(null);
    selectEvent("evt-old", ["doc:old"]);
    let markedSceneOrigin = false;

    await selectFromScene(documentNodeId, scope, () => {
      markedSceneOrigin = true;
    });

    const state = await createLiveClient().dashboardState(scope);
    expect(state.selected_ids).toEqual([documentNodeId]);
    expect(useViewStore.getState().selection).toBeNull();
    expect(markedSceneOrigin).toBe(true);
  });

  it("opens an island through the canonical dashboard selection seam", async () => {
    useViewStore.getState().setScope(null);

    await expect(openNodeIsland(documentNodeId, scope)).resolves.toBe(true);

    const state = await createLiveClient().dashboardState(scope);
    expect(state.selected_ids).toEqual([documentNodeId]);
    expect(useViewStore.getState().openedIds).toContain(documentNodeId);
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("normalizes malformed opened-island reads at the seam boundary", () => {
    const raw = [
      "",
      " doc:old ",
      "doc:old",
      ...Array.from({ length: 14 }, (_, i) => `doc:${i}`),
      "   ",
    ];

    const normalized = normalizeOpenedNodeIslandIds(raw);

    expect(normalized).toHaveLength(12);
    expect(normalized).not.toContain("");
    expect(normalized).not.toContain("doc:old");
    expect(normalized[0]).toBe("doc:2");
    expect(normalized.at(-1)).toBe("doc:13");

    useViewStore.setState({ openedIds: raw as string[] });
    expect(isNodeIslandOpen(" doc:2 ")).toBe(true);
    expect(isNodeIslandOpen("doc:old")).toBe(false);
  });

  it("does not open local island chrome without an accepted dashboard selection", async () => {
    useViewStore.getState().setScope(null);

    await expect(openNodeIsland(documentNodeId)).resolves.toBe(false);

    expect(useViewStore.getState().openedIds).not.toContain(documentNodeId);
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("does not open local island chrome for malformed runtime scope values", async () => {
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(openNodeIsland(documentNodeId, { scope })).resolves.toBe(false);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [],
    });
    expect(useViewStore.getState().openedIds).toEqual([]);
  });

  it("normalizes public island open/close ids at the seam", async () => {
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(openNodeIsland(` ${documentNodeId} `, scope)).resolves.toBe(true);
    expect(useViewStore.getState().openedIds).toEqual([documentNodeId]);

    closeNodeIsland(` ${documentNodeId} `);
    expect(useViewStore.getState().openedIds).toEqual([]);

    await expect(openNodeIsland({ id: documentNodeId }, scope)).resolves.toBe(false);
    expect(useViewStore.getState().openedIds).toEqual([]);
  });

  it("opens a walked island through one focus and dashboard selection seam", async () => {
    const { scene, commands } = captureScene();
    let markedSceneOrigin = false;

    await expect(
      openNodeIslandFromWalk(scene, documentNodeId, scope, (originated = true) => {
        markedSceneOrigin = originated;
      }),
    ).resolves.toBe(true);

    const state = await createLiveClient().dashboardState(scope);
    expect(state.selected_ids).toEqual([documentNodeId]);
    expect(useViewStore.getState().openedIds).toContain(documentNodeId);
    expect(useViewStore.getState().selection).toBeNull();
    expect(markedSceneOrigin).toBe(true);
    expect(commands).toContainEqual({
      kind: "focus-node",
      id: documentNodeId,
      animate: false,
    });
  });

  it("normalizes walked island ids before local state and scene focus", async () => {
    const { scene, commands } = captureScene();
    useViewStore.getState().setScope(null);
    let markedSceneOrigin = false;

    await expect(
      openNodeIslandFromWalk(
        scene,
        ` ${documentNodeId} `,
        scope,
        (originated = true) => {
          markedSceneOrigin = originated;
        },
      ),
    ).resolves.toBe(true);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
    expect(useViewStore.getState().openedIds).toContain(documentNodeId);
    expect(useViewStore.getState().openedIds).not.toContain(` ${documentNodeId} `);
    expect(markedSceneOrigin).toBe(true);
    expect(commands).toContainEqual({
      kind: "focus-node",
      id: documentNodeId,
      animate: false,
    });
  });

  it("rejects invalid walked island ids before focus or local state", async () => {
    const { scene, commands } = captureScene();

    await expect(openNodeIslandFromWalk(scene, "   ", scope)).resolves.toBe(false);

    expect(useViewStore.getState().openedIds).toEqual([]);
    expect(commands).toEqual([]);
  });

  it("does not open or focus a walked island without an accepted dashboard selection", async () => {
    const { scene, commands } = captureScene();
    let markedSceneOrigin = false;

    await expect(
      openNodeIslandFromWalk(scene, documentNodeId, null, (originated = true) => {
        markedSceneOrigin = originated;
      }),
    ).resolves.toBe(false);

    expect(useViewStore.getState().openedIds).not.toContain(documentNodeId);
    expect(useViewStore.getState().selection).toBeNull();
    expect(markedSceneOrigin).toBe(false);
    expect(commands).toEqual([]);
  });

  it("does not descend feature nodes for malformed runtime scope values", async () => {
    const descended: string[] = [];

    await expect(
      openGraphNodeFromScene(
        "feature:state-management",
        { scope },
        {
          descendFeatureTag: (featureTag) => {
            if (typeof featureTag === "string") descended.push(featureTag);
            return Promise.resolve(null);
          },
        },
      ),
    ).resolves.toBe(false);

    expect(descended).toEqual([]);
  });

  it("normalizes event and edge metadata locally", () => {
    selectEvent(" evt-1 ", [" doc:x ", "", "doc:x", "doc:y"], 2.9);
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: "evt-1",
      nodeIds: ["doc:x", "doc:y"],
      truncatedNodeIds: 2,
    });
    selectEvent("   ", ["doc:z"]);
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: "evt-1",
      nodeIds: ["doc:x", "doc:y"],
      truncatedNodeIds: 2,
    });
    selectEdge(" e1 ");
    expect(useViewStore.getState().selection).toEqual({ kind: "edge", id: "e1" });
    selectEdge("   ");
    expect(useViewStore.getState().selection).toEqual({ kind: "edge", id: "e1" });
  });

  it("rejects overlong local selection metadata ids", () => {
    const accepted = "e".repeat(SELECTION_METADATA_ID_MAX_CHARS);
    const rejected = `${accepted}x`;

    expect(normalizeSelectionMetadataId(` ${accepted} `)).toBe(accepted);
    expect(normalizeSelectionMetadataId(rejected)).toBeNull();

    selectEvent(accepted, ["doc:x"]);
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: accepted,
      nodeIds: ["doc:x"],
    });

    selectEvent(rejected, ["doc:y"]);
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: accepted,
      nodeIds: ["doc:x"],
    });

    selectEdge(rejected);
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: accepted,
      nodeIds: ["doc:x"],
    });
  });

  it("clears local event metadata when node selection takes over", async () => {
    selectEvent("evt-1", ["doc:x"]);
    await selectNode("doc:y");
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("clears local edge metadata when multi-node selection takes over", async () => {
    selectEdge("e1");
    await selectNodes(["doc:x", "doc:y"]);
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("selects the first carried node through canonical dashboard-state", async () => {
    useViewStore.getState().setScope(null);
    selectEvent("evt-old", ["doc:old"]);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(selectFirstNode([documentNodeId, "doc:other"], scope)).resolves.toBe(
      true,
    );

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("selects event-carried nodes through one dashboard and metadata seam", async () => {
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(
      selectEventNodes("commit:selection-test", [documentNodeId], scope),
    ).resolves.toBe(true);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
    expect(useViewStore.getState().selection).toEqual({
      kind: "event",
      id: "commit:selection-test",
      nodeIds: [documentNodeId],
    });
  });

  it("rejects malformed event metadata before dashboard node selection", async () => {
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(selectEventNodes("   ", [documentNodeId], scope)).resolves.toBe(false);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [],
    });
    expect(useViewStore.getState().selection).toBeNull();
  });

  it("does not retain event metadata without accepted dashboard node selection", async () => {
    useViewStore.getState().setScope(null);
    selectEvent("evt-stale", ["doc:old"]);

    await expect(selectEventNodes("commit:rejected", [documentNodeId])).resolves.toBe(
      false,
    );

    expect(useViewStore.getState().selection).toBeNull();
  });

  it("resolves inspector selection from local metadata or canonical node ids", () => {
    expect(resolveSelection("doc:selected", null)).toEqual({
      kind: "node",
      id: "doc:selected",
    });
    expect(resolveSelection("doc:selected", { kind: "edge", id: "e1" })).toEqual({
      kind: "edge",
      id: "e1",
    });
    expect(
      resolveSelection("doc:selected", {
        kind: "event",
        id: "evt-1",
        nodeIds: ["doc:x"],
      }),
    ).toEqual({ kind: "event", id: "evt-1", nodeIds: ["doc:x"] });
  });

  it("projects dashboard node selection into the scene ring and cross-region focus", () => {
    const { scene, commands } = captureScene();
    const sceneOriginatedRef = { current: false };

    projectDashboardSelectionToScene(
      scene,
      [" doc:x ", "", "doc:x", "doc:y"],
      "doc:x",
      sceneOriginatedRef,
    );

    expect(commands).toContainEqual({
      kind: "set-selected",
      ids: new Set(["doc:x", "doc:y"]),
    });
    expect(commands).toContainEqual({ kind: "focus-node", id: "doc:x" });
    expect(sceneOriginatedRef.current).toBe(false);
  });

  it("projects scene-originated dashboard selection without bouncing focus", () => {
    const { scene, commands } = captureScene();
    const sceneOriginatedRef = { current: true };

    projectDashboardSelectionToScene(scene, ["doc:x"], "doc:x", sceneOriginatedRef);

    expect(commands).toContainEqual({
      kind: "set-selected",
      ids: new Set(["doc:x"]),
    });
    expect(commands.filter((command) => command.kind === "focus-node")).toEqual([]);
    expect(sceneOriginatedRef.current).toBe(false);
  });

  it("pulses bounded selection node sets through the selection scene seam", () => {
    const { scene, commands } = captureScene();

    pulseSelectionNodes(scene, [" doc:x ", "", "doc:x", "doc:y"]);

    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set(["doc:x", "doc:y"]),
    });
  });

  it("does not emit an empty selection pulse", () => {
    const { scene, commands } = captureScene();

    pulseSelectionNodes(scene, []);

    expect(commands).toEqual([]);
  });

  it("selects a node and pulses a bounded visual set through one seam", async () => {
    const { scene, commands } = captureScene();
    useViewStore.getState().setScope(null);

    await expect(
      selectNodeAndPulse(
        scene,
        documentNodeId,
        [documentNodeId, "doc:neighbor"],
        scope,
      ),
    ).resolves.toBe(true);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [documentNodeId],
    });
    expect(useViewStore.getState().selection).toBeNull();
    expect(commands).toContainEqual({
      kind: "pulse",
      ids: new Set([documentNodeId, "doc:neighbor"]),
    });
  });

  it("does not pulse when the canonical dashboard selection is rejected", async () => {
    const { scene, commands } = captureScene();
    useViewStore.getState().setScope(null);
    await createLiveClient().patchDashboardState({ scope, selected_ids: [] });

    await expect(
      selectNodeAndPulse(scene, documentNodeId, [documentNodeId, "doc:neighbor"], {
        scope,
      }),
    ).resolves.toBe(false);

    await expect(createLiveClient().dashboardState(scope)).resolves.toMatchObject({
      selected_ids: [],
    });
    expect(useViewStore.getState().selection).toBeNull();
    expect(commands).toEqual([]);
  });
});
