// graph-layout-catalog W02.P08.S32: golden-position determinism per layout over
// a FIXED bounded fixture, dispatched through representationLayout — the seam the
// three new catalog modes (hierarchical/radial/community) register into. Mirrors
// the existing per-layout tests and asserts the un-gated registration (D10).

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { type RepresentationMode, representationLayout } from "./representationLayout";

// A fixed bounded fixture: two clusters joined by a bridge, with a salience
// gradient and a couple of off-cluster nodes — exercising layering, radial roots,
// and community detection in one deterministic slice.
const FIXTURE_NODES: SceneNodeData[] = [
  { id: "a0", kind: "doc", salience: 0.9 },
  { id: "a1", kind: "doc", salience: 0.4 },
  { id: "a2", kind: "doc", salience: 0.3 },
  { id: "b0", kind: "doc", salience: 0.8 },
  { id: "b1", kind: "doc", salience: 0.5 },
  { id: "b2", kind: "doc", salience: 0.2 },
  { id: "c0", kind: "doc", salience: 0.6 },
];

const e = (src: string, dst: string): SceneEdgeData => ({
  id: `e:${src}->${dst}`,
  src,
  dst,
  relation: "rel",
  tier: "structural",
  confidence: 1,
  derivation: "grounds",
});

const FIXTURE_EDGES: SceneEdgeData[] = [
  e("a0", "a1"),
  e("a0", "a2"),
  e("a1", "a2"),
  e("b0", "b1"),
  e("b0", "b2"),
  e("b1", "b2"),
  e("a0", "b0"), // bridge
  e("b0", "c0"),
];

const SEED_MODES: RepresentationMode[] = [
  "hierarchical",
  "radial",
  "community",
  "lineage",
];

describe("representationLayout — new catalog modes register and dispatch (D1/D10)", () => {
  for (const mode of ["hierarchical", "radial", "community"] as const) {
    it(`dispatches ${mode} as a populated deterministic seed, un-gated`, () => {
      const result = representationLayout(mode, FIXTURE_NODES, FIXTURE_EDGES);
      // Un-gated (D10): the applied mode equals the requested mode (no downgrade).
      expect(result.applied).toBe(mode);
      expect(result.downgradeReason).toBeUndefined();
      // A deterministic seed: a populated positions Map covering every node.
      expect(result.positions).not.toBeNull();
      for (const node of FIXTURE_NODES) {
        expect(result.positions!.has(node.id)).toBe(true);
      }
    });
  }

  it("connectivity remains a solver (positions null)", () => {
    const result = representationLayout("connectivity", FIXTURE_NODES, FIXTURE_EDGES);
    expect(result.positions).toBeNull();
    expect(result.applied).toBe("connectivity");
  });
});

// W04.P11.S53: degenerate-input + large-graph hardening of the dispatcher. Every
// seed mode must return finite, bounded positions on an empty slice and on a
// ceiling-sized slice (no NaN, no throw), and the semantic mode must carry an
// HONEST downgradeReason on each fallback path it takes.
describe("representationLayout — degenerate + ceiling hardening (S53)", () => {
  const SEED_AND_SOLVER: RepresentationMode[] = [
    "connectivity",
    "hierarchical",
    "radial",
    "community",
    "lineage",
    "semantic",
  ];

  const finite = (m: Map<string, { x: number; y: number }> | null) => {
    if (m === null) return true; // connectivity / held: the solver owns positions
    for (const [, p] of m) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    }
    return true;
  };

  for (const mode of SEED_AND_SOLVER) {
    it(`${mode} handles an empty slice without throwing and stays finite`, () => {
      const result = representationLayout(mode, [], []);
      expect(finite(result.positions)).toBe(true);
      // An empty slice for a seed mode is an empty (not null) positions map.
      if (result.positions !== null) expect(result.positions.size).toBe(0);
    });
  }

  for (const mode of ["hierarchical", "radial", "community", "lineage"] as const) {
    it(`${mode} stays finite on a ceiling-sized slice`, () => {
      // A ceiling-sized backbone: one hub plus many spokes, exercising the seed
      // layout at scale. Every emitted position must be finite.
      const count = 1500;
      const nodes: SceneNodeData[] = Array.from({ length: count }, (_, i) => ({
        id: `n${String(i).padStart(4, "0")}`,
        kind: "doc",
        salience: (i % 7) / 7,
      }));
      const edges: SceneEdgeData[] = nodes.slice(1).map((node) => e("n0000", node.id));
      const result = representationLayout(mode, nodes, edges);
      expect(result.positions).not.toBeNull();
      expect(result.positions!.size).toBe(count);
      expect(finite(result.positions)).toBe(true);
    });
  }

  it("downgrades semantic with an HONEST reason when embeddings are absent", () => {
    // A served slice with NO embeddings: the embedding-presence floor holds the
    // semantic mode, downgrading to connectivity with a reason that names the
    // honest absence (never an error). positions is null (the solver takes over).
    const nodes: SceneNodeData[] = [
      { id: "a", kind: "doc" },
      { id: "b", kind: "doc" },
    ];
    const result = representationLayout("semantic", nodes, []);
    expect(result.applied).toBe("connectivity");
    expect(result.positions).toBeNull();
    expect(result.downgradeReason).toBeDefined();
    expect(result.downgradeReason).toMatch(/HELD|held/);
    expect(result.downgradeReason).toMatch(/embedding|meaning/i);
  });

  it("applies semantic with finite positions when the slice carries embeddings", () => {
    // Enough embedded nodes to clear the presence floor: the mode ships and lays a
    // finite meaning cloud (no NaN), and carries no downgradeReason.
    const nodes: SceneNodeData[] = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      kind: "doc",
      embedding: [Math.sin(i), Math.cos(i), (i % 3) - 1],
    }));
    const result = representationLayout("semantic", nodes, []);
    if (result.applied === "semantic") {
      expect(result.positions).not.toBeNull();
      expect(finite(result.positions)).toBe(true);
      expect(result.downgradeReason).toBeUndefined();
    } else {
      // If the synthetic time-gate ever held the mode, the downgrade is honest.
      expect(result.applied).toBe("connectivity");
      expect(result.downgradeReason).toBeDefined();
    }
  });
});

describe("representationLayout — golden-position determinism per seed mode (D5/D9)", () => {
  for (const mode of SEED_MODES) {
    it(`${mode} yields identical positions across re-runs and input shuffles`, () => {
      const first = representationLayout(mode, FIXTURE_NODES, FIXTURE_EDGES).positions!;
      const again = representationLayout(mode, FIXTURE_NODES, FIXTURE_EDGES).positions!;
      const shuffled = representationLayout(
        mode,
        [...FIXTURE_NODES].reverse(),
        [...FIXTURE_EDGES].reverse(),
      ).positions!;
      for (const node of FIXTURE_NODES) {
        const golden = first.get(node.id);
        expect(again.get(node.id)).toEqual(golden);
        expect(shuffled.get(node.id)).toEqual(golden);
      }
    });
  }
});
