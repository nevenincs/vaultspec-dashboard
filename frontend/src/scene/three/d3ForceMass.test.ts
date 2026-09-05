import { forceManyBody, forceSimulation } from "d3-force";
import { describe, expect, it } from "vitest";
import { massCollide, withNodeMass } from "./d3ForceMass";
import type { D3Node } from "./d3ForceSolver";

describe("consistent force mass", () => {
  it("scales only the repulsion impulse and preserves preexisting momentum", () => {
    const nodes: D3Node[] = [
      { x: 0, y: 0, vx: 2, vy: 3, radius: 4 },
      { x: 10, y: 10, vx: -1, vy: -2, radius: 4 },
    ];
    const sim = forceSimulation(nodes).stop();
    const force = withNodeMass(forceManyBody<D3Node>().strength(-10).theta(0), [3, 1]);
    sim.force("charge", force);
    force(1);
    expect(nodes[0].vx).toBeCloseTo(2 - 0.5 / 3, 8);
    expect(nodes[1].vx).toBeCloseTo(-0.5, 8);
    expect(3 * nodes[0].vx! + nodes[1].vx!).toBeCloseTo(5, 8);
    expect(3 * nodes[0].vy! + nodes[1].vy!).toBeCloseTo(7, 8);
  });

  it("shares contact by inverse mass, independent of rendered radius", () => {
    const nodes: D3Node[] = [
      { x: 0, y: 0, radius: 20 },
      { x: 10, y: 0, radius: 4 },
    ];
    const sim = forceSimulation(nodes).stop().velocityDecay(0);
    sim.force("collide", massCollide([3, 1], 0, 1, 1));
    sim.tick();
    expect(nodes[0].x).toBeCloseTo(-3.5, 8);
    expect(nodes[1].x).toBeCloseTo(20.5, 8);
    expect(3 * nodes[0].vx! + nodes[1].vx!).toBeCloseTo(0, 8);
  });

  it.each([false, true])(
    "resolves contact against a pinned obstacle (reverse=%s)",
    (reverse) => {
      const fixed: D3Node = { x: 0, y: 0, fx: 0, fy: 0, radius: 20 };
      const moving: D3Node = { x: 10, y: 0, radius: 4 };
      const nodes = reverse ? [moving, fixed] : [fixed, moving];
      const sim = forceSimulation(nodes).stop().velocityDecay(0);
      sim.force("collide", massCollide(reverse ? [1, 3] : [3, 1], 0, 1, 1));
      sim.tick();
      expect(fixed.x).toBe(0);
      expect(fixed.vx).toBe(0);
      expect(moving.x).toBeCloseTo(24, 8);
    },
  );

  it("finds contacts across negative grid boundaries and leaves distant bodies alone", () => {
    const nodes: D3Node[] = [
      { x: -1, y: -1, radius: 4 },
      { x: 1, y: 1, radius: 4 },
      { x: 0, y: 100, radius: 4 },
    ];
    const sim = forceSimulation(nodes).stop().velocityDecay(0);
    sim.force("collide", massCollide([1, 1, 1], 0, 1, 1));
    sim.tick();
    expect(
      Math.hypot(nodes[1].x! - nodes[0].x!, nodes[1].y! - nodes[0].y!),
    ).toBeCloseTo(8, 8);
    expect(nodes[2].x).toBe(0);
    expect(nodes[2].y).toBe(100);
  });

  it("separates coincident bodies deterministically without adding momentum", () => {
    function run() {
      const nodes: D3Node[] = [
        { x: 0, y: 0, radius: 4 },
        { x: 0, y: 0, radius: 4 },
      ];
      const sim = forceSimulation(nodes).stop().velocityDecay(0);
      sim.force("collide", massCollide([1, 1], 0, 1, 1));
      sim.tick();
      return nodes;
    }
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    expect(a[0].x! + a[1].x!).toBeCloseTo(0, 8);
    expect(a[0].y! + a[1].y!).toBeCloseTo(0, 8);
    expect(Math.hypot(a[1].x! - a[0].x!, a[1].y! - a[0].y!)).toBeCloseTo(8, 8);
  });
});
