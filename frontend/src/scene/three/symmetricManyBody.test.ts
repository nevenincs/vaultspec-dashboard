import { forceManyBody, forceSimulation, type Force } from "d3-force";
import { describe, expect, it } from "vitest";
import type { D3Node } from "./d3ForceSolver";
import { symmetricManyBody } from "./symmetricManyBody";

function evaluate(
  nodes: D3Node[],
  force: Force<D3Node, undefined>,
  alpha = 1,
): D3Node[] {
  forceSimulation(nodes).stop().force("charge", force);
  force(alpha);
  return nodes;
}

function irregularNodes(count: number): D3Node[] {
  return Array.from({ length: count }, (_, i) => ({
    x: Math.sin(i * 1.234) * (40 + i * 0.7) + (i % 3) * 200,
    y: Math.cos(i * 2.345) * (30 + i * 0.3) + (i % 5) * 130,
    radius: 4,
  }));
}

describe("symmetric many-body charge", () => {
  it.each([0, 0.5, 2])(
    "pruning preserves free outputs and coincidence RNG exactly at theta %s",
    (theta) => {
      for (const coincident of [false, true]) {
        const nodes = irregularNodes(193).map((n, i) => {
          const x = coincident && i % 7 < 3 ? 0 : n.x!;
          const y = coincident && i % 7 < 3 ? 0 : n.y!;
          return {
            ...n,
            x,
            y,
            vx: Math.sin(i),
            vy: Math.cos(i),
            fx: i % 17 === 0 ? null : x,
            fy: i % 19 === 0 ? null : y,
          };
        });
        // Charge geometry ignores pins. Removing them gives the same production
        // traversal without fixed-region pruning, not a second force algorithm.
        const unpruned = nodes.map((n) => ({ ...n, fx: null, fy: null }));
        const calls = [0, 0];
        for (const [index, input] of [nodes, unpruned].entries()) {
          let seed = 1;
          const force = symmetricManyBody(-120, 10, 400, theta);
          force.initialize!(input, () => {
            calls[index]++;
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            return (seed >>> 0) / 4294967296;
          });
          force(0.3);
        }
        expect(calls[0]).toBe(calls[1]);
        if (coincident) expect(calls[0]).toBeGreaterThan(0);
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].fx == null || nodes[i].fy == null) {
            expect(nodes[i].vx).toBe(unpruned[i].vx);
            expect(nodes[i].vy).toBe(unpruned[i].vy);
          }
        }
      }
    },
  );

  it.each([
    { dx: 3, dy: 4, min: 1, max: 400, charge: -120 },
    { dx: 3, dy: 4, min: 1, max: Infinity, charge: -120 },
    { dx: 3, dy: 4, min: 10, max: Infinity, charge: -120 },
    { dx: 1e100, dy: 1e100, min: 0, max: Infinity, charge: -1e-200 },
    { dx: 1e150, dy: 1e150, min: 0, max: Infinity, charge: -1e-23 },
    { dx: 1e-160, dy: 1e-160, min: 0, max: Infinity, charge: -1 },
    { dx: 1e-200, dy: 1e-200, min: 1, max: Infinity, charge: -120 },
    { dx: 1e200, dy: 1e200, min: 1, max: Infinity, charge: -120 },
    { dx: 1e200, dy: 1e200, min: 1, max: 1.5e200, charge: -120 },
    { dx: 1e-200, dy: 1e-200, min: 1, max: 1.5e-200, charge: -120 },
  ])("retains robust unit-direction arithmetic for $dx / $dy", (config) => {
    const { dx, dy, min, max, charge } = config;
    const squared = dx * dx + dy * dy;
    const distance =
      squared > 0 && Number.isFinite(squared) ? Math.sqrt(squared) : Math.hypot(dx, dy);
    const magnitude = charge / Math.max(distance, min);
    const expected = [(dx / distance) * magnitude, (dy / distance) * magnitude];
    const nodes = evaluate(
      [
        { x: 0, y: 0, radius: 4 },
        { x: dx, y: dy, radius: 4 },
      ],
      symmetricManyBody(charge, min, max, 0),
    );
    for (const [axis, actual] of [nodes[0].vx!, nodes[0].vy!].entries()) {
      expect(Number.isFinite(actual)).toBe(true);
      expect(actual).not.toBe(0);
      expect(Math.abs((actual - expected[axis]) / expected[axis])).toBeLessThan(1e-14);
    }
  });

  it("rechecks arithmetic safety when alpha crosses extreme coefficient ranges", () => {
    const nodes: D3Node[] = [
      { x: 0, y: 0, radius: 4 },
      { x: 20, y: 30, radius: 4 },
    ];
    const force = symmetricManyBody(-120, 10, 400, 0);
    force.initialize!(nodes, Math.random);
    const distance = Math.sqrt(20 * 20 + 30 * 30);
    for (const alpha of [1, 1e-310, 1e305, 0.5]) {
      for (const n of nodes) n.vx = n.vy = 0;
      force(alpha);
      const magnitude = (-120 * alpha) / distance;
      const expected = [(20 / distance) * magnitude, (30 / distance) * magnitude];
      for (const [axis, actual] of [nodes[0].vx!, nodes[0].vy!].entries()) {
        expect(Number.isFinite(actual)).toBe(true);
        expect(actual).not.toBe(0);
        expect(Math.abs(actual - expected[axis])).toBeLessThanOrEqual(
          Math.abs(expected[axis]) * 1e-14 + 4 * Number.MIN_VALUE,
        );
      }
    }
  });

  it("keeps cutoff rounding identical within a few ulps of the boundary", () => {
    for (const max of [0.1, 10, Math.sqrt(2), 1e-160, 1e160]) {
      for (const offset of [-2, -1, 0, 1, 2]) {
        const dx = max * (1 + offset * Number.EPSILON);
        const squared = dx * dx;
        const distance =
          squared > 0 && Number.isFinite(squared) ? Math.sqrt(squared) : Math.hypot(dx);
        const nodes = evaluate(
          [
            { x: 0, y: 0, radius: 4 },
            { x: dx, y: 0, radius: 4 },
          ],
          symmetricManyBody(-10, 0, max, 0),
        );
        expect(nodes[0].vx === 0).toBe(distance >= max);
      }
    }
  });

  it.each([-10, 10])(
    "exchanges the analytical pair impulse for charge %s",
    (charge) => {
      const nodes = evaluate(
        [
          { x: 0, y: 0, radius: 4 },
          { x: 3, y: 4, radius: 4 },
        ],
        symmetricManyBody(charge, 1, Infinity, 0.5),
        0.5,
      );
      expect(nodes[0].vx).toBeCloseTo((charge * 0.5 * 3) / 25, 12);
      expect(nodes[0].vy).toBeCloseTo((charge * 0.5 * 4) / 25, 12);
      expect(nodes[1].vx).toBe(-nodes[0].vx!);
      expect(nodes[1].vy).toBe(-nodes[0].vy!);
    },
  );

  it("softens nearby charge and does not perturb distinct axis-aligned nodes", () => {
    const nodes = evaluate(
      [
        { x: 0, y: 0, radius: 4 },
        { x: 2, y: 0, radius: 4 },
      ],
      symmetricManyBody(-10, 5, Infinity, 0.5),
    );
    expect(nodes[0].vx).toBe(-2);
    expect(nodes[1].vx).toBe(2);
    expect(nodes[0].vy).toBe(0);
    expect(nodes[1].vy).toBe(0);
  });

  it("excludes pairs at the cutoff and includes pairs just inside it", () => {
    for (const distance of [9.999, 10, 10.001]) {
      const nodes = evaluate(
        [
          { x: 0, y: 0, radius: 4 },
          { x: distance, y: 0, radius: 4 },
        ],
        symmetricManyBody(-10, 1, 10, 0.5),
      );
      expect(nodes[0].vx).toBeCloseTo(distance < 10 ? -10 / distance : 0, 12);
      expect(nodes[1].vx).toBe(-nodes[0].vx! || 0);
    }
  });

  it("descends cells that straddle the distance cutoff even at a coarse theta", () => {
    const positions: D3Node[] = Array.from({ length: 16 }, (_, i) => ({
      x: i < 8 ? 0 : i < 12 ? 9 : 11,
      y: (i % 8) * 0.001,
      radius: 4,
    }));
    const exact = evaluate(
      structuredClone(positions),
      symmetricManyBody(-10, 1, 10, 0),
    );
    const coarse = evaluate(positions, symmetricManyBody(-10, 1, 10, 100));
    expect(coarse).toEqual(exact);
  });

  it("matches d3 exact charge for distinct non-axis-aligned coordinates", () => {
    const positions = irregularNodes(75);
    const expected = evaluate(
      structuredClone(positions),
      forceManyBody<D3Node>().strength(-120).distanceMin(5).distanceMax(300).theta(0),
      0.7,
    );
    const actual = evaluate(positions, symmetricManyBody(-120, 5, 300, 0), 0.7);
    for (let i = 0; i < actual.length; i++) {
      expect(actual[i].vx).toBeCloseTo(expected[i].vx!, 11);
      expect(actual[i].vy).toBeCloseTo(expected[i].vy!, 11);
    }
  });

  it.each([0.5, 1])("preserves total impulse and torque at theta %s", (theta) => {
    const positions = irregularNodes(193);
    const exact = evaluate(
      structuredClone(positions),
      symmetricManyBody(-120, 1, Infinity, 0),
    );
    const approximate = evaluate(
      positions,
      symmetricManyBody(-120, 1, Infinity, theta),
    );
    let px = 0;
    let py = 0;
    let torque = 0;
    let squaredError = 0;
    let squaredForce = 0;
    for (let i = 0; i < approximate.length; i++) {
      const n = approximate[i];
      px += n.vx!;
      py += n.vy!;
      torque += n.x! * n.vy! - n.y! * n.vx!;
      squaredError += (n.vx! - exact[i].vx!) ** 2 + (n.vy! - exact[i].vy!) ** 2;
      squaredForce += exact[i].vx! ** 2 + exact[i].vy! ** 2;
    }
    expect(Math.abs(px)).toBeLessThan(1e-10);
    expect(Math.abs(py)).toBeLessThan(1e-10);
    expect(Math.abs(torque)).toBeLessThan(1e-7);
    expect(squaredError).toBeGreaterThan(0);
    expect(Math.sqrt(squaredError / squaredForce)).toBeLessThan(
      theta === 0.5 ? 0.025 : 0.1,
    );
  });

  it("separates coincident nodes reproducibly without creating momentum", () => {
    const positions: D3Node[] = Array.from({ length: 20 }, () => ({
      x: 0,
      y: 0,
      radius: 4,
    }));
    const first = evaluate(
      structuredClone(positions),
      symmetricManyBody(-120, 1, 300, 0.5),
    );
    const second = evaluate(positions, symmetricManyBody(-120, 1, 300, 0.5));
    expect(first).toEqual(second);
    expect(Math.abs(first.reduce((sum, n) => sum + n.vx!, 0))).toBeLessThan(1e-10);
    expect(Math.abs(first.reduce((sum, n) => sum + n.vy!, 0))).toBeLessThan(1e-10);
    expect(first.some((n) => Math.hypot(n.vx!, n.vy!) > 0)).toBe(true);
  });

  it("handles a constant coincidence random source", () => {
    const nodes: D3Node[] = [
      { x: 0, y: 0, radius: 4 },
      { x: 0, y: 0, radius: 4 },
    ];
    const force = symmetricManyBody(-10, 1, 300, 0.5);
    force.initialize!(nodes, () => 0.5);
    force(1);
    expect(nodes[0].vx).toBe(-10);
    expect(nodes[1].vx).toBe(10);
    expect(nodes[0].vy).toBe(0);
    expect(nodes[1].vy).toBe(0);
  });

  it("keeps impulses finite when coordinate squares overflow or underflow", () => {
    const nodes: D3Node[] = Array.from({ length: 40 }, (_, i) => ({
      x: (i % 2 ? -1 : 1) * 10 ** ((i - 20) * 10),
      y: (i % 3 ? -1 : 1) * 10 ** ((i - 20) * 10),
      radius: 4,
    }));
    evaluate(nodes, symmetricManyBody(-120, 1, Infinity, 0.5));
    for (const n of nodes) {
      expect(Number.isFinite(n.vx)).toBe(true);
      expect(Number.isFinite(n.vy)).toBe(true);
    }
  });

  it("rebuilds accumulators each tick and resizes on initialization", () => {
    const nodes = irregularNodes(40);
    const force = symmetricManyBody(-120, 1, 300, 0.5);
    evaluate(nodes, force);
    const first = nodes.map((n) => [n.vx!, n.vy!]);
    force(1);
    for (let i = 0; i < nodes.length; i++) {
      expect(nodes[i].vx).toBeCloseTo(2 * first[i][0], 10);
      expect(nodes[i].vy).toBeCloseTo(2 * first[i][1], 10);
    }
    const replacement: D3Node[] = [
      { x: 0, y: 0, radius: 4 },
      { x: 10, y: 0, radius: 4 },
    ];
    evaluate(replacement, force);
    expect(replacement[0].vx).toBe(-12);
    expect(replacement[1].vx).toBe(12);
    force.initialize!([], Math.random);
    expect(() => force(1)).not.toThrow();
  });
});
