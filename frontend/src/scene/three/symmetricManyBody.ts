import type { Force } from "d3-force";
import type { D3Node } from "./d3ForceSolver";

/** Uniform charge with symmetric cell-cell approximation. Cell impulses are
 * propagated once, so accepting a distant pair never walks its descendants.
 * Inertial mass is applied by the caller, independently of charge geometry.
 * Storage is bounded by 2N-1 cells; coincident/near-field pairs remain O(N²). */
export function symmetricManyBody(
  charge: number,
  distanceMin: number,
  distanceMax: number,
  theta: number,
): Force<D3Node, undefined> {
  let nodes: D3Node[] = [];
  let random = Math.random;
  let order = new Int32Array(0);
  let x = new Float64Array(0);
  let y = new Float64Array(0);
  let start = new Int32Array(0);
  let end = new Int32Array(0);
  let left = new Int32Array(0);
  let right = new Int32Array(0);
  let minX = new Float64Array(0);
  let minY = new Float64Array(0);
  let maxX = new Float64Array(0);
  let maxY = new Float64Array(0);
  let centerX = new Float64Array(0);
  let centerY = new Float64Array(0);
  let size = new Float64Array(0);
  let forceX = new Float64Array(0);
  let forceY = new Float64Array(0);
  let cells = 0;
  let chargeAlpha = 0;
  let impulseX = 0;
  let impulseY = 0;
  const minimum = Math.abs(distanceMin);
  const maximum = Math.abs(distanceMax);
  const maximum2 = maximum * maximum;
  const accuracy = Math.abs(theta);
  const accuracy2 = accuracy * accuracy;

  const apply: Force<D3Node, undefined> = (alpha) => {
    if (nodes.length < 2 || charge === 0 || alpha === 0 || maximum === 0) return;
    chargeAlpha = charge * alpha;
    for (let i = 0; i < nodes.length; i++) {
      order[i] = i;
      x[i] = nodes[i].x ?? 0;
      y[i] = nodes[i].y ?? 0;
    }
    cells = 0;
    build(0, nodes.length, 0);
    visit(0, 0);
    // Build order guarantees that parents precede both children.
    for (let c = 0; c < cells; c++) {
      if (left[c] >= 0) {
        forceX[left[c]] += forceX[c];
        forceY[left[c]] += forceY[c];
        forceX[right[c]] += forceX[c];
        forceY[right[c]] += forceY[c];
      } else {
        for (let i = start[c]; i < end[c]; i++) {
          const n = nodes[order[i]];
          n.vx = (n.vx ?? 0) + forceX[c];
          n.vy = (n.vy ?? 0) + forceY[c];
        }
      }
    }
  };

  function build(lo: number, hi: number, depth: number): number {
    const c = cells++;
    start[c] = lo;
    end[c] = hi;
    left[c] = right[c] = -1;
    forceX[c] = forceY[c] = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let cx = 0;
    let cy = 0;
    const weight = 1 / (hi - lo);
    for (let i = lo; i < hi; i++) {
      const n = order[i];
      x0 = Math.min(x0, x[n]);
      y0 = Math.min(y0, y[n]);
      x1 = Math.max(x1, x[n]);
      y1 = Math.max(y1, y[n]);
      cx += x[n] * weight;
      cy += y[n] * weight;
    }
    minX[c] = x0;
    minY[c] = y0;
    maxX[c] = x1;
    maxY[c] = y1;
    centerX[c] = cx;
    centerY[c] = cy;
    size[c] = Math.max(x1 - x0, y1 - y0);
    // A depth cap bounds recursion for coordinates spanning extreme exponents.
    if (hi - lo <= 8 || size[c] === 0 || depth >= 64) return c;
    const coordinates = x1 - x0 >= y1 - y0 ? x : y;
    const midpoint = coordinates === x ? x0 / 2 + x1 / 2 : y0 / 2 + y1 / 2;
    let split = lo;
    for (let i = lo; i < hi; i++) {
      if (coordinates[order[i]] < midpoint) {
        const n = order[split];
        order[split++] = order[i];
        order[i] = n;
      }
    }
    if (split === lo || split === hi) return c;
    left[c] = build(lo, split, depth + 1);
    right[c] = build(split, hi, depth + 1);
    return c;
  }

  function visit(a: number, b: number): void {
    if (a === b) {
      if (left[a] >= 0) {
        visit(left[a], left[a]);
        visit(left[a], right[a]);
        visit(right[a], right[a]);
      } else {
        for (let i = start[a]; i < end[a]; i++) {
          for (let j = i + 1; j < end[a]; j++) pair(order[i], order[j]);
        }
      }
      return;
    }

    let whollyInside = true;
    if (maximum !== Infinity) {
      const gapX = Math.max(0, minX[a] - maxX[b], minX[b] - maxX[a]);
      const gapY = Math.max(0, minY[a] - maxY[b], minY[b] - maxY[a]);
      const farX = Math.max(Math.abs(maxX[a] - minX[b]), Math.abs(minX[a] - maxX[b]));
      const farY = Math.max(Math.abs(maxY[a] - minY[b]), Math.abs(minY[a] - maxY[b]));
      if (Number.isFinite(maximum2) && maximum2 > 0) {
        if (gapX * gapX + gapY * gapY >= maximum2) return;
        whollyInside = farX * farX + farY * farY < maximum2;
      } else {
        if (Math.hypot(gapX, gapY) >= maximum) return;
        whollyInside = Math.hypot(farX, farY) < maximum;
      }
    }

    const dx = centerX[b] - centerX[a];
    const dy = centerY[b] - centerY[a];
    const width = size[a] + size[b];
    if (
      whollyInside &&
      accuracy > 0 &&
      width * width < accuracy2 * (dx * dx + dy * dy) &&
      impulse(dx, dy)
    ) {
      // Each member receives the opposite cell's charge. The two total
      // impulses cancel, even when cells contain different numbers of nodes.
      forceX[a] += impulseX * (end[b] - start[b]);
      forceY[a] += impulseY * (end[b] - start[b]);
      forceX[b] -= impulseX * (end[a] - start[a]);
      forceY[b] -= impulseY * (end[a] - start[a]);
      return;
    }
    if (left[a] < 0 && left[b] < 0) {
      for (let i = start[a]; i < end[a]; i++) {
        for (let j = start[b]; j < end[b]; j++) pair(order[i], order[j]);
      }
    } else if (left[b] < 0 || (left[a] >= 0 && size[a] >= size[b])) {
      visit(left[a], b);
      visit(right[a], b);
    } else {
      visit(a, left[b]);
      visit(a, right[b]);
    }
  }

  function impulse(dx: number, dy: number): boolean {
    const squared = dx * dx + dy * dy;
    let distance =
      squared > 0 && Number.isFinite(squared) ? Math.sqrt(squared) : Math.hypot(dx, dy);
    if (distance >= maximum || !Number.isFinite(distance)) return false;
    if (distance === 0) {
      // A single draw belongs to the pair; axis-aligned distinct nodes need
      // no jiggle. The fallback also handles a constant random source of 0.5.
      dx = (random() - 0.5) * 1e-6;
      dy = (random() - 0.5) * 1e-6;
      if (dx === 0 && dy === 0) dx = 1e-6;
      distance = Math.hypot(dx, dy);
    }
    // Unit direction times softened magnitude avoids squaring coordinates,
    // which can overflow or underflow for otherwise finite node positions.
    const magnitude = chargeAlpha / Math.max(distance, minimum);
    impulseX = (dx / distance) * magnitude;
    impulseY = (dy / distance) * magnitude;
    return true;
  }

  function pair(i: number, j: number): void {
    if (!impulse(x[j] - x[i], y[j] - y[i])) return;
    const a = nodes[i];
    const b = nodes[j];
    a.vx = (a.vx ?? 0) + impulseX;
    a.vy = (a.vy ?? 0) + impulseY;
    b.vx = (b.vx ?? 0) - impulseX;
    b.vy = (b.vy ?? 0) - impulseY;
  }

  apply.initialize = (next, nextRandom) => {
    nodes = next;
    random = nextRandom;
    const capacity = Math.max(0, 2 * nodes.length - 1);
    order = new Int32Array(nodes.length);
    x = new Float64Array(nodes.length);
    y = new Float64Array(nodes.length);
    start = new Int32Array(capacity);
    end = new Int32Array(capacity);
    left = new Int32Array(capacity);
    right = new Int32Array(capacity);
    minX = new Float64Array(capacity);
    minY = new Float64Array(capacity);
    maxX = new Float64Array(capacity);
    maxY = new Float64Array(capacity);
    centerX = new Float64Array(capacity);
    centerY = new Float64Array(capacity);
    size = new Float64Array(capacity);
    forceX = new Float64Array(capacity);
    forceY = new Float64Array(capacity);
  };
  return apply;
}
