import type { CSSProperties } from "react";
import { useEffect } from "react";
import { create } from "zustand";

import type { SceneAnchor, SceneController } from "../../scene/sceneController";
import { normalizeNodeId } from "../nodeIds";

/** Island base size in CSS px at camera scale 1. */
export const ISLAND_WIDTH_PX = 260;
/** Islands scale with the field but stay readable: clamp the CSS scale. */
export const ISLAND_MIN_SCALE = 0.75;
export const ISLAND_MAX_SCALE = 1.25;
export const ISLAND_ANCHORS_CAP = 128;

export type IslandAnchorMap = Record<string, SceneAnchor>;

interface IslandAnchorState {
  anchors: IslandAnchorMap;
  setAnchor: (id: unknown, anchor: unknown) => void;
  clearAnchor: (id: unknown) => void;
  resetForScope: () => void;
}

export function normalizeSceneAnchor(anchor: unknown): SceneAnchor | null {
  if (anchor === null || typeof anchor !== "object") return null;
  const value = anchor as Partial<SceneAnchor>;
  return typeof value.x === "number" &&
    Number.isFinite(value.x) &&
    typeof value.y === "number" &&
    Number.isFinite(value.y) &&
    typeof value.scale === "number" &&
    Number.isFinite(value.scale)
    ? { x: value.x, y: value.y, scale: value.scale }
    : null;
}

function withoutAnchor(anchors: IslandAnchorMap, id: string): IslandAnchorMap {
  if (!(id in anchors)) return anchors;
  const next = { ...anchors };
  delete next[id];
  return next;
}

function withAnchor(
  anchors: IslandAnchorMap,
  id: string,
  anchor: SceneAnchor | null,
): IslandAnchorMap {
  if (anchor === null) return withoutAnchor(anchors, id);

  const next: IslandAnchorMap = { ...anchors };
  if (!(id in next)) {
    const ids = Object.keys(next);
    if (ids.length >= ISLAND_ANCHORS_CAP) {
      delete next[ids[0]!];
    }
  }
  next[id] = anchor;
  return next;
}

export const useIslandAnchorStore = create<IslandAnchorState>((set) => ({
  anchors: {},
  setAnchor: (id, anchor) => {
    const nodeId = normalizeNodeId(id);
    if (nodeId === null) return;
    const normalizedAnchor = normalizeSceneAnchor(anchor);
    set((state) => {
      const anchors = withAnchor(state.anchors, nodeId, normalizedAnchor);
      return anchors === state.anchors ? state : { anchors };
    });
  },
  clearAnchor: (id) => {
    const nodeId = normalizeNodeId(id);
    if (nodeId === null) return;
    set((state) => {
      const anchors = withoutAnchor(state.anchors, nodeId);
      return anchors === state.anchors ? state : { anchors };
    });
  },
  resetForScope: () => set({ anchors: {} }),
}));

/** Pure style computation from an anchor: unit-testable without DOM. */
export function islandStyle(anchor: unknown): CSSProperties {
  const normalizedAnchor = normalizeSceneAnchor(anchor);
  if (!normalizedAnchor) return { display: "none" };
  const scale = Math.max(
    ISLAND_MIN_SCALE,
    Math.min(ISLAND_MAX_SCALE, normalizedAnchor.scale),
  );
  return {
    position: "absolute",
    left: 0,
    top: 0,
    width: `${ISLAND_WIDTH_PX}px`,
    transform: `translate(${normalizedAnchor.x}px, ${normalizedAnchor.y}px) scale(${scale})`,
    transformOrigin: "top left",
  };
}

export function setIslandAnchor(id: unknown, anchor: unknown): void {
  useIslandAnchorStore.getState().setAnchor(id, anchor);
}

export function clearIslandAnchor(id: unknown): void {
  useIslandAnchorStore.getState().clearAnchor(id);
}

export function resetIslandAnchors(): void {
  useIslandAnchorStore.getState().resetForScope();
}

export function useIslandAnchor(id: string | null): SceneAnchor | null {
  const nodeId = normalizeNodeId(id);
  return useIslandAnchorStore((state) =>
    nodeId === null ? null : (state.anchors[nodeId] ?? null),
  );
}

/** Subscribe to one node's screen anchor through the scene seam. */
export function useNodeAnchor(scene: SceneController, id: string): SceneAnchor | null {
  const nodeId = normalizeNodeId(id);
  const anchor = useIslandAnchor(nodeId);
  useEffect(() => {
    if (nodeId === null) return undefined;
    clearIslandAnchor(nodeId);
    const unsubscribe = scene.trackNode(nodeId, (nextAnchor) => {
      setIslandAnchor(nodeId, nextAnchor);
    });
    return () => {
      unsubscribe();
      clearIslandAnchor(nodeId);
    };
  }, [scene, nodeId]);
  return anchor;
}
