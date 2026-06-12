import { describe, expect, it } from "vitest";

import { useViewStore } from "../../stores/view/viewStore";
import { ISLAND_MAX_SCALE, ISLAND_MIN_SCALE, islandStyle } from "./IslandLayer";

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

describe("viewStore discovery pinning (G3.c, session-only)", () => {
  it("pins candidates once and unpins by id", () => {
    const edge = {
      id: "cand-1",
      src: "a",
      dst: "b",
      relation: "similar-to",
      tier: "semantic" as const,
      confidence: 0.6,
    };
    const { pinDiscovery, unpinDiscovery } = useViewStore.getState();
    pinDiscovery(edge);
    pinDiscovery(edge);
    expect(useViewStore.getState().pinnedDiscoveries).toHaveLength(1);
    unpinDiscovery("cand-1");
    expect(useViewStore.getState().pinnedDiscoveries).toHaveLength(0);
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
