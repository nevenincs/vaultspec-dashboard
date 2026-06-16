// graph-layout-catalog W02.P07: the community / clustered (Louvain) mode.
// Asserts the hand-rolled Louvain detects obvious clusters, the deterministic
// two-level placement co-locates members, the small-community merge policy, and
// the golden-position determinism contract (D8/D9).

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { communityLayout, detectCommunities } from "./communityLayout";

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
});
