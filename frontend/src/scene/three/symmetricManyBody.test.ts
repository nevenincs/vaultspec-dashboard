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
