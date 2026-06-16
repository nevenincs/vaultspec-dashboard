// Regression (backend-hardening campaign, finding selection-01): a stage-
// originated no-op deselect must consume the scene-origin suppression flag so
// it cannot leak onto — and swallow the focus of — the next genuine
// cross-region selection (G2.b "selecting anywhere focuses everywhere").

import { beforeEach, describe, expect, it } from "vitest";

import type { SceneCommand, SceneFieldRenderer } from "../../scene/sceneController";
import { SceneController } from "../../scene/sceneController";
import {
  bindSelectionToScene,
  focusFromWalk,
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

describe("selection scene-origin flag (G2.b)", () => {
  beforeEach(() => {
    useViewStore.getState().select(null);
  });

  it("does not swallow the next cross-region focus after a stage no-op deselect", () => {
    const { scene, commands } = captureScene();
    const off = bindSelectionToScene(scene);

    // Stage deselect while already cleared: select(null) keeps `selection`
    // referentially === the prior null, so the subscriber early-returns. The
    // pending scene-origin suppression must still be consumed there.
    selectFromScene(null);

    // A genuine cross-region selection MUST focus the field.
    selectNode("feature:c");
    expect(commands).toContainEqual({ kind: "focus-node", id: "feature:c" });

    off();
  });

  it("still suppresses the focus bounce on a genuine stage-originated selection", () => {
    const { scene, commands } = captureScene();
    const off = bindSelectionToScene(scene);

    // A real stage selection must NOT bounce focus back to where the user is
    // already pointing — the focus suppression still holds. (The SELECTED ring
    // still follows via set-selected; only the camera focus is suppressed.)
    selectFromScene("feature:x");
    expect(commands.filter((c) => c.kind === "focus-node")).toEqual([]);
    expect(commands).toContainEqual({
      kind: "set-selected",
      ids: new Set(["feature:x"]),
    });

    off();
  });
});

describe("focusFromWalk: keyboard walk re-centers instantly (HIGH-2)", () => {
  beforeEach(() => {
    useViewStore.getState().select(null);
  });

  it("issues exactly one focus-node with animate:false and no animated bounce", () => {
    const { scene, commands } = captureScene();
    const off = bindSelectionToScene(scene);

    // Walking to a node must INSTANTLY re-center it (animate:false) so it never
    // strays off-screen — and must NOT also trigger the binding's animated
    // follow (a double focus-node). The walk owns the camera move.
    focusFromWalk(scene, "feature:walked");
    // Exactly one focus-node (the instant re-center), no animated bounce. The
    // SELECTED ring also follows via set-selected — the walk's focus is the
    // single camera move asserted here.
    expect(commands.filter((c) => c.kind === "focus-node")).toEqual([
      { kind: "focus-node", id: "feature:walked", animate: false },
    ]);
    expect(commands).toContainEqual({
      kind: "set-selected",
      ids: new Set(["feature:walked"]),
    });
    // The shared selection is updated so every region honors it.
    expect(useViewStore.getState().selectedId).toBe("feature:walked");

    off();
  });

  it("a clearing walk (null) deselects without commanding a focus", () => {
    const { scene, commands } = captureScene();
    const off = bindSelectionToScene(scene);

    useViewStore.getState().select("feature:held");
    commands.length = 0; // ignore the cross-region focus + ring from the seed
    focusFromWalk(scene, null);
    // A clearing walk deselects: no focus-node, and the ring set clears.
    expect(commands.filter((c) => c.kind === "focus-node")).toEqual([]);
    expect(commands).toContainEqual({ kind: "set-selected", ids: new Set() });
    expect(useViewStore.getState().selectedId).toBeNull();

    off();
  });
});
