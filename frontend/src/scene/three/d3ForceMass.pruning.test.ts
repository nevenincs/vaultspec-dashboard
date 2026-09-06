import { type Force, type Simulation } from "d3-force";
import { describe, expect, it } from "vitest";
import { massCollide, withNodeMass } from "./d3ForceMass";
import {
  D3_FORCE_DEFAULTS,
  D3ForceSolver,
  type D3Link,
  type D3Node,
} from "./d3ForceSolver";
import { symmetricManyBody } from "./symmetricManyBody";

/** Exhaustive contact oracle. Enumerate each neighboring key's candidates in
 * descending input order, including repeated keys at extreme coordinates. */
function exhaustiveContact(
  masses: readonly number[],
  padding: number,
  strength: number,
  iterations: number,
): Force<D3Node, undefined> {
  let nodes: D3Node[] = [];
  let random = Math.random;
  const force: Force<D3Node, undefined> = () => {
    if (strength === 0 || nodes.length < 2) return;
    const radii = nodes.map((n) => Math.max(0, n.radius + padding));
    const diameter = Math.max(...radii) * 2;
    if (diameter === 0) return;
    for (let iteration = 0; iteration < iterations; iteration++) {
      const positions = nodes.map((n) => ({
        x: n.fx ?? (n.x ?? 0) + (n.vx ?? 0),
        y: n.fy ?? (n.y ?? 0) + (n.vy ?? 0),
      }));
      const cells = positions.map((p) => ({
        x: Math.floor(p.x / diameter),
        y: Math.floor(p.y / diameter),
      }));
      const keys = cells.map((p) => `${p.x},${p.y}`);
      for (let i = 0; i < nodes.length; i++) {
        for (let cx = -1; cx <= 1; cx++) {
          for (let cy = -1; cy <= 1; cy++) {
            const key = `${cells[i].x + cx},${cells[i].y + cy}`;
            for (let j = nodes.length - 1; j > i; j--) {
              if (keys[j] !== key) continue;
              const radius = radii[i] + radii[j];
              let dx = positions[j].x - positions[i].x;
              let dy = positions[j].y - positions[i].y;
              if (Math.abs(dx) >= radius || Math.abs(dy) >= radius) continue;
              const distance = Math.hypot(dx, dy);
              if (distance >= radius) continue;
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
              if (mobility === 0) continue;
              const impulse = ((radius - distance) * strength) / mobility;
              a.vx = (a.vx ?? 0) - dx * impulse * ax;
              a.vy = (a.vy ?? 0) - dy * impulse * ay;
              b.vx = (b.vx ?? 0) + dx * impulse * bx;
              b.vy = (b.vy ?? 0) + dy * impulse * by;
            }
          }
        }
      }
    }
  };
  force.initialize = (next, source) => {
    nodes = next;
    random = source;
  };
  return force;
}

function randomSource() {
  let state = 1;
  let calls = 0;
  return {
    next: () => {
      calls++;
      state = (Math.imul(state, 1664525) + 1013904223) | 0;
      return (state >>> 0) / 4294967296;
    },
    snapshot: () => ({ state, calls }),
  };
}

function contactNodes(): D3Node[] {
  return Array.from({ length: 54 }, (_, i) => {
    const x = i < 6 ? 0 : Math.sin(i * 1.234) * 80;
    const y = i < 6 ? 0 : Math.cos(i * 2.345) * 70;
    return {
      x,
      y,
      radius: 4 + (i % 17),
      vx: i < 6 ? 0 : Math.sin(i),
      vy: i < 6 ? 0 : Math.cos(i),
      fx: i % 5 === 4 ? null : x,
      fy: i % 7 === 5 ? null : y,
    };
  });
}

function compareContacts(input: D3Node[], iterations = 3, strength = 0.35) {
  const actual = structuredClone(input);
  const expected = structuredClone(input);
  const masses = input.map((_, i) => 1 + (i % 9));
  const sources = [randomSource(), randomSource()];
  const forces = [
    massCollide(masses, 0, strength, iterations),
    exhaustiveContact(masses, 0, strength, iterations),
  ];
  for (const [i, force] of forces.entries()) {
    force.initialize!([actual, expected][i], sources[i].next);
    force(0.3);
  }
  expect(actual).toEqual(expected);
  expect(sources[0].snapshot()).toEqual(sources[1].snapshot());
  return { nodes: actual, calls: sources[0].snapshot().calls };
}

describe("ordered pinned-contact pruning", () => {
  it.each(["x", "y"] as const)(
    "retains contact at both movable-boundary equalities on the %s axis",
    (axis) => {
      for (const reverse of [false, true]) {
        const fixed = reverse ? 9 : 7;
        const moving = reverse ? 7 : 9;
        const nodes: D3Node[] =
          axis === "x"
            ? [
                { x: fixed, y: 0, fx: fixed, fy: 0, radius: 4 },
                { x: moving, y: 0, fy: 0, radius: 4 },
              ]
            : [
                { x: 0, y: fixed, fx: 0, fy: fixed, radius: 4 },
                { x: 0, y: moving, fx: 0, radius: 4 },
              ];
        const result = compareContacts(nodes, 1, 1);
        expect(result.nodes[1][axis === "x" ? "vx" : "vy"]).not.toBe(0);
      }
    },
  );

  it("keeps distant fixed coincidence draws interleaved with movable draws", () => {
    const nodes: D3Node[] = [-1000, 0, 1000, 200, -1000, 0, 1000, 200].map((x, i) => ({
      x,
      y: 0,
      radius: 4,
      fx: i % 2 === 0 ? x : null,
      fy: i % 2 === 0 ? 0 : null,
    }));
    for (const input of [nodes, [...nodes].reverse()]) {
      expect(compareContacts(input).calls).toBe(8);
    }
  });

  it("retains own-cell random draws with no movable cells", () => {
    const nodes: D3Node[] = [-1000, 0, 1000, -1000, 0, 1000].map((x) => ({
      x,
      y: 0,
      fx: x,
      fy: 0,
      radius: 4,
    }));
    expect(compareContacts(nodes).calls).toBe(9);
  });

  it("recomputes movable bounds after contact crosses a grid cell", () => {
    const result = compareContacts(
      [
        { x: 16, y: 0, fx: 16, fy: 0, radius: 4 },
        { x: 1, y: 0, fx: 1, fy: 0, radius: 4 },
        { x: 7, y: 0, radius: 4 },
      ],
      2,
      1,
    );
    expect(result.nodes[2].vx).toBe(1);
  });

  it("preserves a wide movable box spanning unrelated fixed cells", () => {
    const nodes: D3Node[] = [-1000, 0, 1000, -1000, 0, 1000].map((x) => ({
      x,
      y: 0,
      fx: x === 0 ? x : null,
      fy: x === 0 ? 0 : null,
      radius: 4,
    }));
    expect(compareContacts(nodes).calls).toBeGreaterThan(0);
  });

  it("falls back for aliased fixed cells even when there are no movers", () => {
    const nodes: D3Node[] = Array.from({ length: 2 }, () => ({
      x: 1e30,
      y: 1e30,
      fx: 1e30,
      fy: 1e30,
      radius: 4,
    }));
    expect(compareContacts(nodes, 2).calls).toBe(18);
  });

  it.each([1, 3])(
    "matches exhaustive outputs and RNG over %s iterations",
    (iterations) => {
      for (const reverse of [false, true]) {
        const actual = contactNodes();
        if (reverse) actual.reverse();
        const expected = structuredClone(actual);
        const masses = actual.map((_, i) => 1 + (i % 9));
        const sources = [randomSource(), randomSource()];
        const forces = [
          massCollide(masses, 3, 0.35, iterations),
          exhaustiveContact(masses, 3, 0.35, iterations),
        ];
        for (const [i, force] of forces.entries()) {
          force.initialize!([actual, expected][i], sources[i].next);
          force(0.3);
        }
        expect(actual).toEqual(expected);
        expect(sources[0].snapshot()).toEqual(sources[1].snapshot());
        expect(sources[0].snapshot().calls).toBeGreaterThan(0);
      }
    },
  );

  it("preserves repeated coincidence draws when neighboring grid keys alias", () => {
    const actual: D3Node[] = [
      { x: 1e30, y: 1e30, fx: 1e30, fy: 1e30, radius: 4 },
      { x: 1e30, y: 1e30, fx: 1e30, fy: 1e30, radius: 4 },
      { x: 1e30, y: 1e30, radius: 4 },
    ];
    const expected = structuredClone(actual);
    const sources = [randomSource(), randomSource()];
    const forces = [
      massCollide([1, 2, 3], 0, 0.35, 2),
      exhaustiveContact([1, 2, 3], 0, 0.35, 2),
    ];
    for (const [i, force] of forces.entries()) {
      force.initialize!([actual, expected][i], sources[i].next);
      force(1);
    }
    expect(actual).toEqual(expected);
    expect(sources[0].snapshot()).toEqual(sources[1].snapshot());
    expect(sources[0].snapshot().calls).toBe(54);
  });

  it("refreshes radius and mass invariants when initialized again", () => {
    const nodes: D3Node[] = [
      { x: 0, y: 0, radius: 2 },
      { x: 8, y: 0, radius: 2 },
    ];
    const masses = [1, 1];
    const force = massCollide(masses, 0, 1, 1);
    force.initialize!(nodes, Math.random);
    force(1);
    expect(nodes[0].vx ?? 0).toBe(0);
    nodes[0].radius = 10;
    masses[0] = 3;
    force.initialize!(nodes, Math.random);
    force(1);
    expect(nodes[0].vx).toBe(-1);
    expect(nodes[1].vx).toBe(3);
    force.initialize!([], Math.random);
    expect(() => force(1)).not.toThrow();
  });
});

describe("force pruning through solver lifecycle", () => {
  it("preserves multi-tick reflow, drag, release and wake integration exactly", () => {
    const count = 36;
    const edges = Array.from({ length: count - 1 }, (_, i) => ({
      source: Math.floor(i / 3),
      target: i + 1,
    }));
    const masses = new Array<number>(count).fill(0);
    for (const e of edges) {
      masses[e.source]++;
      masses[e.target]++;
    }
    const radii = Array.from({ length: count }, (_, i) => 4 + (i % 7));
    const params = { ...D3_FORCE_DEFAULTS, collideIterations: 3 };
    const solvers = [
      new D3ForceSolver(count, edges, radii, params),
      new D3ForceSolver(count, edges, radii, params),
    ];
    const sources = [randomSource(), randomSource()];
    const simulations = solvers.map(
      (solver) => (solver as unknown as { sim: Simulation<D3Node, D3Link> }).sim,
    );
    const unpruned = symmetricManyBody(-120, 10, 400, params.chargeTheta);
    let referenceNodes: D3Node[] = [];
    const charge: Force<D3Node, undefined> = (alpha) => {
      const pins = referenceNodes.map((n) => [n.fx, n.fy]);
      for (const n of referenceNodes) n.fx = n.fy = null;
      try {
        unpruned(alpha);
      } finally {
        referenceNodes.forEach((n, i) => {
          [n.fx, n.fy] = pins[i];
        });
      }
    };
    charge.initialize = (nodes, random) => {
      referenceNodes = nodes;
      unpruned.initialize!(nodes, random);
    };
    simulations[1].force("charge", withNodeMass(charge, masses));
    simulations[1].force("collide", exhaustiveContact(masses, 3, 0.35, 3));
    for (const [i, solver] of solvers.entries()) {
      simulations[i].randomSource(sources[i].next);
      solver.seed((n) => (n < 6 ? { x: 0, y: 0 } : { x: n * 8, y: (n % 5) * 11 }));
      solver.prewarmReflow((n) => n % 7 === 5, 0.3, 0);
    }
    try {
      for (let tick = 0; tick < 90; tick++) {
        for (const solver of solvers) {
          if (tick === 15) solver.setDrag(7, 56, 22);
          if (tick === 16) solver.setDrag(7, 140, 22);
          if (tick === 30) solver.clearDrag();
          if (tick === 55) solver.reheatGentle(0.1);
        }
        expect(solvers[0].tick()).toEqual(solvers[1].tick());
        expect(sources[0].snapshot()).toEqual(sources[1].snapshot());
        for (let i = 0; i < count; i++) {
          expect(solvers[0].position(i)).toEqual(solvers[1].position(i));
        }
      }
    } finally {
      for (const solver of solvers) solver.dispose();
    }
  });
});
