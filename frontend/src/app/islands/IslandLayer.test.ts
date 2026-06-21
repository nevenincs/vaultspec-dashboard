import { describe, expect, it } from "vitest";

import { setDwelledHoverNodeId, setHoveredNodeId } from "../../stores/view/selection";
import { useViewStore } from "../../stores/view/viewStore";
import {
  ISLAND_MAX_SCALE,
  ISLAND_MIN_SCALE,
  islandStyle,
} from "../../stores/view/islandAnchors";

describe("islandStyle", () => {
  it("hides islands without an anchor (node off stage)", () => {
    expect(islandStyle(null)).toEqual({ display: "none" });
  });

  it("positions via transform from the anchor", () => {
    const style = islandStyle({ x: 12, y: 34, scale: 1 });
    expect(style.transform).toBe("translate(12px, 34px) scale(1)");
    expect(style.position).toBe("absolute");
  });

  it("clamps the readable scale band", () => {
    expect(islandStyle({ x: 0, y: 0, scale: 0.1 })!.transform).toContain(
      `scale(${ISLAND_MIN_SCALE})`,
    );
    expect(islandStyle({ x: 0, y: 0, scale: 8 })!.transform).toContain(
      `scale(${ISLAND_MAX_SCALE})`,
    );
  });
});

describe("viewStore opened nodes", () => {
  it("opens once and closes by id", () => {
    const { openNode, closeNode } = useViewStore.getState();
    openNode("n1");
    openNode("n1");
    openNode("n2");
    expect(useViewStore.getState().openedIds).toEqual(["n1", "n2"]);
    closeNode("n1");
    expect(useViewStore.getState().openedIds).toEqual(["n2"]);
    closeNode("n2");
  });
});

describe("viewStore hover-card dwell", () => {
  it("stores hover-card dwell state centrally and clears it with hover-out", () => {
    setHoveredNodeId("n-hover");
    setDwelledHoverNodeId("n-hover");

    expect(useViewStore.getState().hoveredId).toBe("n-hover");
    expect(useViewStore.getState().dwelledHoverId).toBe("n-hover");

    setHoveredNodeId(null);

    expect(useViewStore.getState().hoveredId).toBeNull();
    expect(useViewStore.getState().dwelledHoverId).toBeNull();
  });

  it("prunes stale hover-card dwell ids when the graph model drops a node", () => {
    setHoveredNodeId("n-stale");
    setDwelledHoverNodeId("n-stale");

    useViewStore.getState().pruneNodeAffordances(["n-other"]);

    expect(useViewStore.getState().hoveredId).toBeNull();
    expect(useViewStore.getState().dwelledHoverId).toBeNull();
  });
});
