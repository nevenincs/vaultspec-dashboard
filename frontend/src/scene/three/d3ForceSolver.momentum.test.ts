import { describe, expect, it } from "vitest";
import { D3_FORCE_DEFAULTS, D3ForceSolver, type D3ForceParams } from "./d3ForceSolver";

const seed = [
  { x: 0, y: 0 },
  { x: 80, y: 15 },
  { x: -40, y: 70 },
  { x: -25, y: -65 },
];
const edges = [1, 2, 3].map((target) => ({ source: 0, target }));

function centroid(solver: D3ForceSolver, start = 0, count = solver.count) {
  let x = 0;
  let y = 0;
  const totalMass = count === 4 ? 6 : count;
  for (let i = start; i < start + count; i++) {
    const p = solver.position(i)!;
    // The star's hub has three incident links; its leaves (and isolated nodes)
    // have unit mass. This fixture's physical center is not its point average.
    const mass = count === 4 && i === start ? 3 : 1;
    x += (p.x * mass) / totalMass;
    y += (p.y * mass) / totalMass;
  }
  return { x, y };
}

const activeParams = (over: Partial<D3ForceParams> = {}): D3ForceParams => ({
  ...D3_FORCE_DEFAULTS,
  centerStrength: 0,
  alphaDecay: 0,
  chargeTheta: 0,
  ...over,
});

describe("active cluster momentum", () => {
  it("preserves momentum at production approximation accuracy on an irregular tree", () => {
    const count = 80;
    const links = Array.from({ length: count - 1 }, (_, i) => ({
      source: Math.floor(i / 3),
      target: i + 1,
    }));
    const masses = new Array<number>(count).fill(0);
    for (const link of links) {
      masses[link.source]++;
      masses[link.target]++;
    }
    const totalMass = masses.reduce((sum, mass) => sum + mass, 0);
    const solver = new D3ForceSolver(
      count,
      links,
      Array.from({ length: count }, (_, i) => 4 + (i % 17)),
      activeParams({ chargeTheta: D3_FORCE_DEFAULTS.chargeTheta }),
    );
    function center() {
      let x = 0;
      let y = 0;
      for (let i = 0; i < count; i++) {
        const p = solver.position(i)!;
        x += (p.x * masses[i]) / totalMass;
        y += (p.y * masses[i]) / totalMass;
      }
      return { x, y };
    }
    solver.reheatGentle(1);
    const before = center();
    for (let tick = 0; tick < 500; tick++) {
      solver.tick();
      const after = center();
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1e-8);
    }
    expect(solver.alpha()).toBe(1);
    solver.dispose();
  });

  it.each([
    { name: "springs", charge: 0, collideStrength: 0 },
    { name: "springs and exact repulsion", collideStrength: 0 },
    {
      name: "mixed-radius contact",
      charge: -180,
      collidePadding: 20,
      collideStrength: 0.8,
    },
  ])("$name cannot propel an isolated cluster", ({ name: _name, ...over }) => {
    const solver = new D3ForceSolver(4, edges, [20, 4, 7, 12], activeParams(over));
    solver.seed((i) => seed[i]);
    solver.reheatGentle(1);
    const before = centroid(solver);
    let movement = 0;
    for (let tick = 0; tick < 200; tick++) {
      movement += solver.tick().meanDisplacement;
      const after = centroid(solver);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1e-8);
    }
    expect(movement).toBeGreaterThan(1);
    expect(solver.alpha()).toBe(1);
    expect(solver.isSettled()).toBe(false);
    solver.dispose();
  });

  it("preserves each disconnected cluster, not just their combined centroid", () => {
    const solver = new D3ForceSolver(
      8,
      [...edges, ...edges.map((e) => ({ source: e.source + 4, target: e.target + 4 }))],
      [20, 4, 7, 12, 20, 4, 7, 12],
      activeParams({ charge: -180, collidePadding: 20, collideStrength: 0.8 }),
    );
    solver.seed((i) => ({
      x: seed[i % 4].x + (i < 4 ? -2000 : 2000),
      y: seed[i % 4].y,
    }));
    solver.reheatGentle(1);
    const before = [centroid(solver, 0, 4), centroid(solver, 4, 4)];
    for (let tick = 0; tick < 200; tick++) solver.tick();
    for (const [index, start] of [0, 4].entries()) {
      const after = centroid(solver, start, 4);
      expect(
        Math.hypot(after.x - before[index].x, after.y - before[index].y),
      ).toBeLessThan(1e-8);
    }
    solver.dispose();
  });

  it("separates unequal circles without moving their midpoint", () => {
    const solver = new D3ForceSolver(
      2,
      [],
      [20, 4],
      activeParams({ charge: 0, collidePadding: 0 }),
    );
    solver.seed((i) => ({ x: i * 10, y: 0 }));
    solver.reheatGentle(1);
    for (let tick = 0; tick < 100; tick++) solver.tick();
    expect(centroid(solver).x).toBeCloseTo(5, 8);
    const a = solver.position(0)!;
    const b = solver.position(1)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(23.99);
    solver.dispose();
  });
});
