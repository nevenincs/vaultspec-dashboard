// @vitest-environment happy-dom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SceneController } from "../../scene/sceneController";
import {
  ISLAND_ANCHORS_CAP,
  clearIslandAnchor,
  islandStyle,
  normalizeSceneAnchor,
  resetIslandAnchors,
  setIslandAnchor,
  useIslandAnchorStore,
  useNodeAnchor,
} from "./islandAnchors";
import { useViewStore } from "./viewStore";

afterEach(() => {
  cleanup();
  resetIslandAnchors();
});

describe("island anchor store", () => {
  it("normalizes ids and clears off-stage anchors", () => {
    setIslandAnchor(" doc:a ", { x: 1, y: 2, scale: 1 });

    expect(useIslandAnchorStore.getState().anchors).toEqual({
      "doc:a": { x: 1, y: 2, scale: 1 },
    });

    setIslandAnchor("doc:a", null);

    expect(useIslandAnchorStore.getState().anchors).toEqual({});
  });

  it("normalizes anchor payloads before storing or styling", () => {
    expect(normalizeSceneAnchor({ x: 1, y: 2, scale: 1.5 })).toEqual({
      x: 1,
      y: 2,
      scale: 1.5,
    });
    expect(normalizeSceneAnchor({ x: Number.NaN, y: 2, scale: 1 })).toBeNull();
    expect(normalizeSceneAnchor({ x: 1, y: Infinity, scale: 1 })).toBeNull();
    expect(normalizeSceneAnchor({ x: 1, y: 2, scale: "1" })).toBeNull();

    setIslandAnchor("doc:a", { x: 1, y: 2, scale: 1 });
    setIslandAnchor("doc:a", { x: Number.NaN, y: 2, scale: 1 });

    expect(useIslandAnchorStore.getState().anchors).toEqual({});
    expect(islandStyle({ x: 4, y: 8, scale: 99 })).toMatchObject({
      transform: "translate(4px, 8px) scale(1.25)",
    });
    expect(islandStyle({ x: 4, y: 8, scale: Number.NaN })).toEqual({
      display: "none",
    });
  });

  it("bounds retained anchors", () => {
    for (let index = 0; index < ISLAND_ANCHORS_CAP + 1; index += 1) {
      setIslandAnchor(`doc:${index}`, { x: index, y: index, scale: 1 });
    }

    const anchors = useIslandAnchorStore.getState().anchors;
    expect(Object.keys(anchors)).toHaveLength(ISLAND_ANCHORS_CAP);
    expect(anchors["doc:0"]).toBeUndefined();
    expect(anchors[`doc:${ISLAND_ANCHORS_CAP}`]).toEqual({
      x: ISLAND_ANCHORS_CAP,
      y: ISLAND_ANCHORS_CAP,
      scale: 1,
    });
  });

  it("subscribes to real scene anchor updates through the stores seam", () => {
    const scene = new SceneController();
    const { result, unmount } = renderHook(() => useNodeAnchor(scene, " doc:a "));

    expect(result.current).toBeNull();

    act(() => {
      scene.emitAnchor("doc:a", { x: 12, y: 34, scale: 1.5 });
    });

    expect(result.current).toEqual({ x: 12, y: 34, scale: 1.5 });
    expect(useIslandAnchorStore.getState().anchors["doc:a"]).toEqual({
      x: 12,
      y: 34,
      scale: 1.5,
    });

    act(() => {
      scene.emitAnchor("doc:a", null);
    });

    expect(result.current).toBeNull();
    expect(useIslandAnchorStore.getState().anchors["doc:a"]).toBeUndefined();

    act(() => {
      scene.emitAnchor("doc:a", { x: 1, y: 2, scale: 1 });
    });
    unmount();
    act(() => {
      scene.emitAnchor("doc:a", { x: 3, y: 4, scale: 1 });
    });

    expect(useIslandAnchorStore.getState().anchors["doc:a"]).toBeUndefined();
  });

  it("resets anchors on wholesale scope swaps", () => {
    setIslandAnchor("doc:previous", { x: 1, y: 2, scale: 1 });

    useViewStore.getState().setScope("next-scope");

    expect(useIslandAnchorStore.getState().anchors).toEqual({});
  });

  it("clears one anchor without disturbing the rest", () => {
    setIslandAnchor("doc:a", { x: 1, y: 2, scale: 1 });
    setIslandAnchor("doc:b", { x: 3, y: 4, scale: 1 });

    clearIslandAnchor("doc:a");

    expect(useIslandAnchorStore.getState().anchors).toEqual({
      "doc:b": { x: 3, y: 4, scale: 1 },
    });
  });
});
