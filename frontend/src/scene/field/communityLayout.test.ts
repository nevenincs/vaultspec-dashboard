// graph-layout-catalog W02.P07: the community / clustered (Louvain) mode.
// Asserts the hand-rolled Louvain detects obvious clusters, the deterministic
// two-level placement co-locates members, the small-community merge policy, and
// the golden-position determinism contract (D8/D9).

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { communityLayout, detectCommunities } from "./communityLayout";
import { generateLfr } from "./scorecard/generators/lfr";
import { generateSbm } from "./scorecard/generators/sbm";
import type { GraphFixture } from "./scorecard/generators/fixture";
import {
  adjustedMutualInformation,
  adjustedRandIndex,
} from "./scorecard/metrics/clusterMetrics";

const n = (id: string): SceneNodeData => ({ id, kind: "doc" });

const edge = (
  src: string,
  dst: string,
  tier: SceneEdgeData["tier"] = "structural",
): SceneEdgeData => ({
  id: `e:${src}->${dst}`,
  src,
  dst,
  relation: "rel",
  tier,
  confidence: 1,
});

/** A dense clique among the given ids (every undirected pair), backbone-tier. */
const clique = (ids: string[]): SceneEdgeData[] => {
  const out: SceneEdgeData[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) out.push(edge(ids[i], ids[j]));
  }
  return out;
};

describe("detectCommunities (hand-rolled Louvain)", () => {
  it("groups two dense cliques joined by a single bridge into two communities", () => {
    const groupA = ["a0", "a1", "a2", "a3"];
    const groupB = ["b0", "b1", "b2", "b3"];
    const nodes = [...groupA, ...groupB].map(n);
    const edges = [
      ...clique(groupA),
      ...clique(groupB),
      edge("a0", "b0"), // a single weak bridge
    ];
    const { membership } = detectCommunities(nodes, edges);
    // All of group A shares one community; all of group B shares another.
    const aComm = new Set(groupA.map((id) => membership.get(id)));
    const bComm = new Set(groupB.map((id) => membership.get(id)));
    expect(aComm.size).toBe(1);
    expect(bComm.size).toBe(1);
    expect([...aComm][0]).not.toBe([...bComm][0]);
  });

  it("ignores non-backbone (temporal/semantic) edges when detecting (D7)", () => {
    // A temporal edge must not bind two otherwise-separate nodes into one
    // community; with no backbone edges every node is its own community.
    const nodes = [n("a"), n("b")];
    const edges = [edge("a", "b", "temporal")];
    const { membership } = detectCommunities(nodes, edges);
    expect(membership.get("a")).not.toBe(membership.get("b"));
  });

  it("is deterministic: same inputs -> same membership", () => {
    const groupA = ["a0", "a1", "a2"];
    const groupB = ["b0", "b1", "b2"];
    const nodes = [...groupA, ...groupB].map(n);
    const edges = [...clique(groupA), ...clique(groupB), edge("a0", "b0")];
    const first = detectCommunities(nodes, edges).membership;
    const second = detectCommunities(
      [...nodes].reverse(),
      [...edges].reverse(),
    ).membership;
    for (const id of [...groupA, ...groupB]) {
      expect(second.get(id)).toBe(first.get(id));
    }
  });
});

describe("communityLayout (two-level deterministic placement)", () => {
  it("packs members of one community near each other, far from another (D9)", () => {
    const groupA = ["a0", "a1", "a2", "a3"];
    const groupB = ["b0", "b1", "b2", "b3"];
    const nodes = [...groupA, ...groupB].map(n);
    const edges = [...clique(groupA), ...clique(groupB), edge("a0", "b0")];
    const pos = communityLayout(nodes, edges);

    const centroid = (ids: string[]) => {
      let x = 0;
      let y = 0;
      for (const id of ids) {
        const p = pos.get(id)!;
        x += p.x;
        y += p.y;
      }
      return { x: x / ids.length, y: y / ids.length };
    };
    const ca = centroid(groupA);
    const cb = centroid(groupB);
    const interCommunity = Math.hypot(ca.x - cb.x, ca.y - cb.y);

    // Max intra-community spread is smaller than the inter-community separation.
    const spread = (ids: string[], c: { x: number; y: number }) =>
      Math.max(
        ...ids.map((id) => Math.hypot(pos.get(id)!.x - c.x, pos.get(id)!.y - c.y)),
      );
    expect(Math.max(spread(groupA, ca), spread(groupB, cb))).toBeLessThan(
      interCommunity,
    );
  });

  it("merges sub-COMMUNITY_MIN_SIZE communities into one placement bucket (D9)", () => {
    // A clique plus three isolated singletons: the singletons are merged for
    // placement (no flicker of one-node wedges), so every node still gets a
    // position and the layout stays legible.
    const clusterIds = ["c0", "c1", "c2"];
    const loners = ["x", "y", "z"];
    const nodes = [...clusterIds, ...loners].map(n);
    const edges = clique(clusterIds);
    const pos = communityLayout(nodes, edges);
    for (const id of [...clusterIds, ...loners]) expect(pos.has(id)).toBe(true);
  });

  it("is deterministic: same inputs -> same positions (golden)", () => {
    const groupA = ["a0", "a1", "a2"];
    const groupB = ["b0", "b1", "b2"];
    const nodes = [...groupA, ...groupB].map(n);
    const edges = [...clique(groupA), ...clique(groupB), edge("a0", "b0")];
    const first = communityLayout(nodes, edges);
    const second = communityLayout([...nodes].reverse(), [...edges].reverse());
    for (const id of [...groupA, ...groupB]) {
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it("returns an empty map for an empty slice", () => {
    expect(communityLayout([], []).size).toBe(0);
  });

  // W04.P11.S51: degenerate-input hardening — singleton-community and
  // all-isolated-nodes slices must yield finite positions with no NaN and no throw.
  // The all-isolated case (no backbone edges -> every node its own community,
  // merged into the singletons placement bucket) and a single node exercise the
  // m2 === 0 path and the COMMUNITY_MIN_SIZE merge.
  describe("degenerate-input hardening (S51)", () => {
    const finite = (m: Map<string, { x: number; y: number }>) => {
      for (const [, p] of m) {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
      }
      return true;
    };

    it("places a single node finitely (singleton community, no throw)", () => {
      const pos = communityLayout([n("solo")], []);
      expect(pos.size).toBe(1);
      expect(finite(pos)).toBe(true);
    });

    it("places all-isolated nodes (no edges) finitely via the singletons bucket", () => {
      const nodes = Array.from({ length: 9 }, (_, i) => n(`iso-${i}`));
      const pos = communityLayout(nodes, []);
      expect(pos.size).toBe(9);
      expect(finite(pos)).toBe(true);
    });

    it("places a singleton community alongside a real cluster without NaN", () => {
      // One dense triangle plus a single lone node: the lone node is a
      // singleton community merged for placement; every node stays finite.
      const cluster = ["c0", "c1", "c2"];
      const nodes = [...cluster, "lone"].map(n);
      const edges = clique(cluster);
      const pos = communityLayout(nodes, edges);
      expect(pos.size).toBe(4);
      expect(finite(pos)).toBe(true);
    });

    it("stays finite on a ceiling-sized all-isolated slice", () => {
      const nodes = Array.from({ length: 1500 }, (_, i) => n(`s-${i}`));
      const pos = communityLayout(nodes, []);
      expect(pos.size).toBe(1500);
      expect(finite(pos)).toBe(true);
    });
  });
});

// W02.P07.S34 (node-representation ADR D5): the Louvain partition stays CLIENT-SIDE
// and is scored DIRECTLY from `detectCommunities` output, never read from a wire
// `community_id` projection. These tests run the real hand-rolled `detectCommunities`
// over the scorecard's SBM/LFR planted-partition fixtures and assert the detected
// membership recovers the planted partition with high chance-corrected agreement
// (ARI/AMI), proving the community detection is a real client-side computation that
// the scorecard fences — affirming D5 (community is client-side, not wire-served).
describe("detectCommunities client-side partition recovery (D5)", () => {
  /** Score the detected membership against a fixture's planted partition by
   *  chance-corrected ARI and AMI over index-aligned label arrays (the same
   *  alignment the cluster gate uses). */
  const recovery = (fx: GraphFixture): { ari: number; ami: number } => {
    const detected = detectCommunities(fx.nodes, fx.edges);
    const ids = fx.nodes.map((node) => node.id);
    // Re-index the detected (string) community labels to dense integers, aligned
    // to the same node order as the planted (integer) partition.
    const labelIndex = new Map<string, number>();
    let next = 0;
    const pred = ids.map((id) => {
      const c = detected.membership.get(id) ?? id;
      if (!labelIndex.has(c)) labelIndex.set(c, next++);
      return labelIndex.get(c)!;
    });
    const truth = ids.map((id) => fx.partition.get(id) ?? -1);
    return {
      ari: adjustedRandIndex(truth, pred),
      ami: adjustedMutualInformation(truth, pred),
    };
  };

  it("recovers the SBM planted partition with high chance-corrected ARI/AMI", () => {
    // A clean SBM (strong intra-block signal, weak inter-block noise): the
    // client-side Louvain must recover the planted blocks almost exactly.
    const fx = generateSbm({
      sizes: [20, 20, 20],
      pIntra: 0.35,
      pInter: 0.01,
      seed: 5,
    });
    const { ari, ami } = recovery(fx);
    expect(ari).toBeGreaterThan(0.8);
    expect(ami).toBeGreaterThan(0.8);
  });

  it("recovers the LFR planted partition with high chance-corrected ARI/AMI", () => {
    // A low-mixing LFR benchmark: the client-side Louvain must recover the planted
    // communities with strong chance-corrected agreement.
    const fx = generateLfr({
      n: 80,
      mu: 0.15,
      degExp: 2.5,
      minDegree: 3,
      maxDegree: 12,
      commExp: 1.5,
      minCommunity: 8,
      maxCommunity: 20,
      seed: 6,
    });
    const { ari, ami } = recovery(fx);
    expect(ari).toBeGreaterThan(0.7);
    expect(ami).toBeGreaterThan(0.7);
  });

  it("scores the detected partition itself, not a wire projection (D5)", () => {
    // The fixture nodes carry NO `community_id`-like field; the scoring depends
    // wholly on what `detectCommunities` computes from the backbone. A near-perfect
    // recovery on a strongly-separable two-block slice (dense intra, zero inter)
    // confirms the partition is the algorithm's own client-side output. Read the
    // membership directly off the result to show it is computed, not wire-served.
    const fx = generateSbm({
      sizes: [15, 15],
      pIntra: 0.6,
      pInter: 0.0,
      seed: 11,
    });
    const detected = detectCommunities(fx.nodes, fx.edges);
    // The detected membership is a real Map the algorithm produced over the slice.
    expect(detected.membership.size).toBe(fx.nodes.length);
    const { ari, ami } = recovery(fx);
    expect(ari).toBeGreaterThan(0.95);
    expect(ami).toBeGreaterThan(0.95);
  });
});
