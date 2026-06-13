// Adversarial — LENS: contract-conformance of the live adapters / wire client.
//
// SUSPECT 2: metaEdgeToEdge synthesizes the edge id as the *string*
//   `meta:${src}->${dst}`
// with no escaping of the endpoint names. The synthesized id is the edge's
// STABLE KEY (liveAdapters.ts comment: "a stable identity-bearing id from the
// endpoint pair (provenance-stable, re-derives identically)"; engine.ts §2/§4;
// project rule `provenance-stable-keys-are-identity-bearing`: identity must be
// NON-COLLIDING). Because the separator "->" is also a legal substring of a
// node id, two DISTINCT meta-edges (a distinct (src,dst) pair) can collapse to
// one id. The GUI caches/animates/time-travels by id (contract §2), so a
// collision silently maps two ribbons onto one — a provenance-stable-keys
// violation.
//
// Reachability: the wire `src`/`dst` are arbitrary engine-synthesized node ids.
// The engine already mints ids carrying ":" (`feature:{tag}`) and the structural
// corpus mints ids carrying "->" (e.g. `e:doc:a->doc:b:declares` in
// fixtures/corpus.ts). A node whose id embeds "->" is therefore not exotic; the
// adapter must keep two distinct endpoint pairs on two distinct ids regardless.

import { describe, expect, it } from "vitest";

import { metaEdgeToEdge } from "../server/liveAdapters";
import type { WireMetaEdge } from "../server/engine";

const wire = (src: string, dst: string): WireMetaEdge => ({
  src,
  dst,
  src_feature: src.replace(/^feature:/, ""),
  dst_feature: dst.replace(/^feature:/, ""),
  count: 1,
  breakdown_by_tier: { structural: 1 },
});

describe("metaEdgeToEdge — synthesized id must be a non-colliding stable key", () => {
  it("keeps two DISTINCT endpoint pairs on two DISTINCT ids", () => {
    // Two genuinely different meta-edges:
    //   A: src = "feature:x->y", dst = "feature:z"
    //   B: src = "feature:x",    dst = "y->feature:z"
    // Both flatten to the same naive string id "meta:feature:x->y->feature:z".
    const a = metaEdgeToEdge(wire("feature:x->y", "feature:z"));
    const b = metaEdgeToEdge(wire("feature:x", "y->feature:z"));

    // The endpoint pairs are demonstrably distinct entities…
    expect([a.src, a.dst]).not.toEqual([b.src, b.dst]);

    // …so their stable keys (ids) MUST differ. A colliding id means the GUI's
    // id-keyed cache/diff conflates two ribbons (provenance-stable-keys).
    expect(a.id).not.toBe(b.id);
  });
});
