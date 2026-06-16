import { describe, expect, it } from "vitest";

import { SceneGraphModel } from "../graphModel";
import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import {
  RECEDE_ALPHA,
  SELECTED_RING_RECEDE_FLOOR,
  computeEgo,
  selectedRingAlpha,
} from "./egoHighlight";

const node = (id: string): SceneNodeData => ({ id, kind: "feature" });
const edge = (id: string, src: string, dst: string): SceneEdgeData => ({
  id,
  src,
  dst,
  relation: "related",
  tier: "declared",
  confidence: 1,
});

describe("computeEgo", () => {
  const model = new SceneGraphModel();
  model.setData(
    [node("a"), node("b"), node("c"), node("d")],
    [edge("e1", "a", "b"), edge("e2", "a", "c"), edge("e3", "c", "d")],
  );

  it("lifts the node, its 1-hop neighbors, and incident edges only", () => {
    const ego = computeEgo(model, "a");
    expect(ego.nodeIds).toEqual(new Set(["a", "b", "c"]));
    expect(ego.edgeIds).toEqual(new Set(["e1", "e2"]));
  });

  it("lifts an isolated node alone", () => {
    const ego = computeEgo(model, "d");
    expect(ego.nodeIds).toEqual(new Set(["d", "c"]));
    expect(ego.edgeIds).toEqual(new Set(["e3"]));
  });

  it("recede stays a dim, not a hide", () => {
    expect(RECEDE_ALPHA).toBeGreaterThan(0);
    expect(RECEDE_ALPHA).toBeLessThan(0.5);
  });
});

describe("selectedRingAlpha — the single persistent selection accent", () => {
  it("is full when no ego is held (the plain selected state)", () => {
    expect(selectedRingAlpha(false, false)).toBe(1);
    expect(selectedRingAlpha(false, true)).toBe(1);
  });

  it("is full when the selected node is itself the lifted ego", () => {
    expect(selectedRingAlpha(true, true)).toBe(1);
  });

  it("holds a legibility floor — never the deep body recede — when outside a held ego", () => {
    const alpha = selectedRingAlpha(true, false);
    expect(alpha).toBe(SELECTED_RING_RECEDE_FLOOR);
    // The selection stays clearly visible: well above the body recede so the
    // user never loses where their selection is.
    expect(alpha).toBeGreaterThan(RECEDE_ALPHA);
    expect(alpha).toBeLessThan(1);
  });
});
