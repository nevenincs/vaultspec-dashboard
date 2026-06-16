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
