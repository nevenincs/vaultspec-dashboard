// Adversarial — LENS: contract-conformance of the live adapters / wire client.
//
// SUSPECT 4: adaptGraphSlice folds `meta_edges` into `edges` by blind
// concatenation: `[...edges, ...metaEdges.map(metaEdgeToEdge)]`. There is no
// de-duplication against ids already present in `edges`.
//
// The adapter's own header comment claims tolerance for an origin "that already
// inlined them [meta-edges]" passing through unchanged. metaEdgeToEdge mints a
// folded meta-edge id as `meta:${src}->${dst}`. So if `edges` ALREADY contains a
// folded meta-edge (id `meta:feature:a->feature:b`) AND `meta_edges` carries the
// SAME endpoint pair, the fold appends a SECOND edge bearing the identical id.
//
// Edge ids are a stable-key contract guarantee (engine.ts §2/§4; project rule
// `provenance-stable-keys-are-identity-bearing`): the GUI caches/diffs/animates
// by edge id, and id uniqueness within a slice is the precondition for that
// id-keyed bookkeeping. Two edges sharing one id in a single returned slice
// silently corrupts the consumer's id map.

import { describe, expect, it } from "vitest";

import { adaptGraphSlice } from "../server/liveAdapters";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

describe("adaptGraphSlice — folding meta_edges must not mint a duplicate edge id", () => {
  it("does not emit two edges sharing one id when a meta:-id is already inlined", () => {
    // An origin that already inlined the a<->b ribbon onto `edges` (exactly the
    // case the adapter comment says is tolerated) AND still carries it in the
    // separate meta_edges array.
    const body = {
      nodes: [
        { id: "feature:a", kind: "feature" },
        { id: "feature:b", kind: "feature" },
      ],
      edges: [
        {
          id: "meta:feature:a->feature:b",
          src: "feature:a",
          dst: "feature:b",
          relation: "related",
          tier: "structural",
          confidence: 1,
          meta: { count: 3, breakdown_by_tier: { structural: 3 } },
        },
      ],
      meta_edges: [
        {
          src: "feature:a",
          dst: "feature:b",
          src_feature: "a",
          dst_feature: "b",
          count: 3,
          breakdown_by_tier: { structural: 3 },
        },
      ],
      filter: {},
      tiers: TIERS,
    };

    const slice = adaptGraphSlice(body);

    // The returned slice must hold unique edge ids: an id-keyed consumer map
    // (GUI cache / diff clock) requires one edge per id.
    const ids = slice.edges.map((e) => e.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
