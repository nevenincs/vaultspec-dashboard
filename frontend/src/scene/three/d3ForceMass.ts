import type { Force } from "d3-force";
import type { D3Node } from "./d3ForceSolver";

/** Convert a unit-mass force's impulse to acceleration without rescaling
 * velocity contributed by earlier forces. Mass matches d3's link-degree bias. */
export function withNodeMass(
  force: Force<D3Node, undefined>,
  masses: readonly number[],
): Force<D3Node, undefined> {
  let nodes: D3Node[] = [];
  let beforeX = new Float64Array(0);
  let beforeY = new Float64Array(0);
  const apply: Force<D3Node, undefined> = (alpha) => {
    for (let i = 0; i < nodes.length; i++) {
      beforeX[i] = nodes[i].vx ?? 0;
      beforeY[i] = nodes[i].vy ?? 0;
    }
    force(alpha);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.vx = beforeX[i] + ((n.vx ?? 0) - beforeX[i]) / masses[i];
      n.vy = beforeY[i] + ((n.vy ?? 0) - beforeY[i]) / masses[i];
    }
  };
  apply.initialize = (next, random) => {
    nodes = next;
    beforeX = new Float64Array(nodes.length);
    beforeY = new Float64Array(nodes.length);
    force.initialize?.(nodes, random);
  };
  return apply;
}

/** Circle geometry and inertial mass are independent. Each contact exchanges
 * equal and opposite mass-weighted impulses; fixed coordinates have no mobility.
 * A diameter-sized grid limits candidates to adjacent cells, including vertical
 * chains. Storage is O(nodes); fully overlapping circles still cost O(nodes²). */
export function massCollide(
  masses: readonly number[],
  padding: number,
  strength: number,
  iterations: number,
): Force<D3Node, undefined> {
  let nodes: D3Node[] = [];
  let random = Math.random;
  let x = new Float64Array(0);
  let y = new Float64Array(0);
  let radii = new Float64Array(0);
  let cellX = new Float64Array(0);
  let cellY = new Float64Array(0);
  let next = new Int32Array(0);
  // Rebuilt per iteration, with at most one cell entry per node.
  const heads = new Map<string, number>();

  const apply: Force<D3Node, undefined> = () => {
    if (strength === 0 || nodes.length < 2) return;
    let diameter = 0;
    for (let i = 0; i < nodes.length; i++) {
      radii[i] = Math.max(0, nodes[i].radius + padding);
      diameter = Math.max(diameter, radii[i] * 2);
    }
    if (diameter === 0) return;
    for (let iteration = 0; iteration < iterations; iteration++) {
      heads.clear();
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        x[i] = n.fx ?? (n.x ?? 0) + (n.vx ?? 0);
        y[i] = n.fy ?? (n.y ?? 0) + (n.vy ?? 0);
        cellX[i] = Math.floor(x[i] / diameter);
        cellY[i] = Math.floor(y[i] / diameter);
        const key = `${cellX[i]},${cellY[i]}`;
        next[i] = heads.get(key) ?? -1;
        heads.set(key, i);
      }
      for (let i = 0; i < nodes.length; i++) {
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const key = `${cellX[i] + dx},${cellY[i] + dy}`;
            for (let j = heads.get(key) ?? -1; j >= 0; j = next[j]) {
              if (j <= i) continue;
              resolveContact(i, j);
            }
          }
        }
      }
    }
  };

  function resolveContact(i: number, j: number): void {
    const radius = radii[i] + radii[j];
    let dx = x[j] - x[i];
    let dy = y[j] - y[i];
    if (Math.abs(dx) >= radius || Math.abs(dy) >= radius) return;
    const distance = Math.hypot(dx, dy);
    if (distance >= radius) return;
    if (distance === 0) {
      const angle = random() * 2 * Math.PI;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    } else {
      dx /= distance;
      dy /= distance;
    }
    const a = nodes[i];
    const b = nodes[j];
    const ax = a.fx == null ? 1 / masses[i] : 0;
    const ay = a.fy == null ? 1 / masses[i] : 0;
    const bx = b.fx == null ? 1 / masses[j] : 0;
    const by = b.fy == null ? 1 / masses[j] : 0;
    const mobility = dx * dx * (ax + bx) + dy * dy * (ay + by);
    if (mobility === 0) return;
    const impulse = ((radius - distance) * strength) / mobility;
    a.vx = (a.vx ?? 0) - dx * impulse * ax;
    a.vy = (a.vy ?? 0) - dy * impulse * ay;
    b.vx = (b.vx ?? 0) + dx * impulse * bx;
    b.vy = (b.vy ?? 0) + dy * impulse * by;
  }

  apply.initialize = (nextNodes, nextRandom) => {
    nodes = nextNodes;
    random = nextRandom;
    x = new Float64Array(nodes.length);
    y = new Float64Array(nodes.length);
    radii = new Float64Array(nodes.length);
    cellX = new Float64Array(nodes.length);
    cellY = new Float64Array(nodes.length);
    next = new Int32Array(nodes.length);
    heads.clear();
  };
  return apply;
}
