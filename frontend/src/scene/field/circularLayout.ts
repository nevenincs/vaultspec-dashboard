// Circular/radial alternative layout (graph-quality plan P01.S03).
//
// Places N nodes evenly on a circle of radius proportional to sqrt(N) —
// a fast O(N) arrangement that provides an instantly-readable alternative
// to the force-directed layout for small graphs and for the first-impression
// "burst" before FA2 warms up. Scene-layer module: framework-free by design.

import type { NodePosition } from "../positionCache";

/** Base radius at N=1; actual radius = BASE * sqrt(N). */
const BASE_RADIUS = 200;

/**
 * Arrange nodeIds evenly on a circle. Returns a Map keyed by node id with
 * the (x, y) world position for each node. The radius scales with sqrt(N)
 * so the circle stays roughly constant in visual density as the graph grows.
 */
export function circularArrange(nodeIds: readonly string[]): Map<string, NodePosition> {
  const n = nodeIds.length;
  const out = new Map<string, NodePosition>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(nodeIds[0], { x: 0, y: 0 });
    return out;
  }
  const radius = BASE_RADIUS * Math.sqrt(n);
  const step = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) {
    const angle = i * step - Math.PI / 2; // start at top
    out.set(nodeIds[i], {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return out;
}
