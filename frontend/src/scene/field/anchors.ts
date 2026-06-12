// Screen-space anchor driving for DOM islands (W01.P04.S14, ADR G6.a, RL-4).
//
// The hybrid pattern's bridge: opened nodes render as DOM islands above the
// GPU field, positioned through `trackNode` subscriptions on the seam. The
// AnchorDriver recomputes tracked nodes' screen anchors on every camera
// change and layout frame and dispatches only actual changes — per-frame
// polling never crosses into React (the subscription form exists precisely
// to keep it out). Scene-layer module: framework-free by design.

import type { SceneAnchor } from "../sceneController";

export interface AnchorSources {
  /** Node ids with at least one island subscription (seam-side registry). */
  trackedIds(): Iterable<string>;
  /** Current world position for a node, if it is on stage. */
  positionOf(id: string): { x: number; y: number } | undefined;
  /** World → screen projection (the camera). */
  worldToScreen(wx: number, wy: number): { x: number; y: number };
  /** Current camera scale — islands scale with the field. */
  scale(): number;
  /** Seam dispatch (SceneController.emitAnchor). */
  emitAnchor(id: string, anchor: SceneAnchor | null): void;
}

/** Anchors closer than this (px / scale units) are considered unchanged. */
export const ANCHOR_EPSILON = 0.25;

export function anchorsEqual(
  a: SceneAnchor | null,
  b: SceneAnchor | null,
  epsilon = ANCHOR_EPSILON,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.scale - b.scale) < epsilon
  );
}

export class AnchorDriver {
  private sources: AnchorSources;
  private last = new Map<string, SceneAnchor | null>();

  constructor(sources: AnchorSources) {
    this.sources = sources;
  }

  /**
   * Recompute all tracked anchors and dispatch changes. Call on camera
   * change and on each layout position frame — the two things that move a
   * node on screen. Nodes that left the stage dispatch null once.
   */
  update(): void {
    const scale = this.sources.scale();
    const seen = new Set<string>();
    for (const id of this.sources.trackedIds()) {
      seen.add(id);
      const world = this.sources.positionOf(id);
      const anchor: SceneAnchor | null = world
        ? { ...this.sources.worldToScreen(world.x, world.y), scale }
        : null;
      const prev = this.last.get(id);
      if (prev !== undefined && anchorsEqual(prev, anchor)) continue;
      this.last.set(id, anchor);
      this.sources.emitAnchor(id, anchor);
    }
    // Ids no longer tracked need no dispatch (their subscriptions are gone),
    // but their memo must drop so a re-track starts fresh.
    for (const id of [...this.last.keys()]) {
      if (!seen.has(id)) this.last.delete(id);
    }
  }
}
