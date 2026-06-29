// Circle sizing — visual prominence scales with CONNECTEDNESS (Issue #8).
//
// The binding canvas sizes each category circle by the node's connectedness: the
// engine-served total degree (reference edges in+out, summed across `degreeByTier`).
// More-connected nodes read as more prominent. The mapping is BOUNDED and MONOTONIC
// (a log of degree, normalized by a reference degree and clamped to the band) so a
// few mega-hubs don't dwarf the field. Degree is engine-served; the frontend only
// MAPS it to a radius (display-state-is-backend-served). Ordering: feature nodes by
// member count (their connectedness analog); document nodes by degree; SALIENCE is
// the graceful fallback when an origin serves a degree-of-interest scalar but no
// degree block; else the base. Salience ALSO still orders the DOI label cull (labels
// are a separate concern from size).
//
// These are pure-function assertions over the sizing source (`nodeWorldRadius` in
// appearance.ts, plus `labelPriority`/`ambientLabelFloor` in nodeVisualEncoding.ts);
// no GPU is reached.

import { describe, expect, it } from "vitest";

import type { SceneNodeData } from "../sceneController";
import { isLineageEdge } from "./edgeStyle";
import {
  SALIENCE_RADIUS_MAX,
  ambientLabelFloor,
  labelPriority,
} from "./nodeVisualEncoding";
// Live node sizing is appearance.nodeWorldRadius (the retired nodeAppearance.nodeRadius
// duplicate was removed); these salience-encoding assertions are relative/ratio-based so
// they hold against the live sizing source.
import { nodeWorldRadius } from "../three/appearance";

const node = (over: Partial<SceneNodeData>): SceneNodeData => ({
  id: "n",
  kind: "adr",
  ...over,
});

describe("connectedness -> circle size (engine-served degree)", () => {
  const deg = (d: number, over: Partial<SceneNodeData> = {}): number =>
    nodeWorldRadius(node({ degreeByTier: { structural: d }, ...over }));

  it("grows the circle monotonically with total degree (more connected = larger)", () => {
    const leaf = deg(0);
    const mid = deg(5);
    const hub = deg(80);
    expect(mid).toBeGreaterThan(leaf);
    expect(hub).toBeGreaterThan(mid);
  });

  it("sums degree across tiers (in+out reference edges)", () => {
    const oneTier = nodeWorldRadius(node({ degreeByTier: { structural: 10 } }));
    const split = nodeWorldRadius(
      node({ degreeByTier: { structural: 6, declared: 4 } }),
    );
    expect(split).toBeCloseTo(oneTier, 5); // 6 + 4 == 10 → same radius
  });

  it("seats an unconnected node at the base and caps the band at the maximum", () => {
    const base = nodeWorldRadius(node({})); // no degree, no salience
    expect(deg(0)).toBeCloseTo(base, 5);
    // A node at/above the reference connectedness reaches the documented ceiling.
    const saturated = deg(100000); // far above the reference degree → clamped
    expect(saturated / base).toBeCloseTo(SALIENCE_RADIUS_MAX, 5);
  });

  it("is bounded — a 2× more-connected node is LESS than 2× larger (log mapping)", () => {
    const base = nodeWorldRadius(node({}));
    const a = deg(8) - base;
    const b = deg(16) - base;
    expect(b).toBeGreaterThan(a); // still monotonic
    expect(b).toBeLessThan(a * 2); // sub-linear: hubs don't dwarf the field
  });

  it("sizes feature-convergence nodes by member count (their connectedness analog)", () => {
    const baseDoc = nodeWorldRadius(node({ kind: "document" }));
    const bigFeature = nodeWorldRadius(node({ kind: "feature", memberCount: 40 }));
    expect(bigFeature).toBeGreaterThan(baseDoc);
  });
});

describe("salience -> circle size (graceful fallback when no degree is served)", () => {
  // A node the wire carries with a degree-of-interest scalar but NO degree block
  // (e.g. a client-synthesized node) still sizes by salience, the prior encoding.
  it("grows monotonically with salience when degree is absent", () => {
    const low = nodeWorldRadius(node({ salience: 0.1 }));
    const mid = nodeWorldRadius(node({ salience: 0.5 }));
    const high = nodeWorldRadius(node({ salience: 0.95 }));
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("caps the fallback radius band at the documented maximum", () => {
    const base = nodeWorldRadius(node({ salience: 0 }));
    const top = nodeWorldRadius(node({ salience: 1 }));
    expect(top / base).toBeCloseTo(SALIENCE_RADIUS_MAX, 5);
  });

  it("clamps an out-of-range salience to the [0,1] band", () => {
    const atZero = nodeWorldRadius(node({ salience: 0 }));
    const atOne = nodeWorldRadius(node({ salience: 1 }));
    expect(nodeWorldRadius(node({ salience: -0.5 }))).toBe(atZero);
    expect(nodeWorldRadius(node({ salience: 1.5 }))).toBe(atOne);
  });

  it("served degree takes precedence over salience for the same node", () => {
    // A well-connected but low-salience node still reads large — connectedness wins.
    const connectedLowSalience = nodeWorldRadius(
      node({ degreeByTier: { structural: 200 }, salience: 0.05 }),
    );
    const isolatedHighSalience = nodeWorldRadius(node({ salience: 0.95 }));
    expect(connectedLowSalience).toBeGreaterThan(isolatedHighSalience);
  });
});

describe("salience -> label priority (DOI label cull)", () => {
  it("orders the ambient field by salience", () => {
    expect(labelPriority(node({ salience: 0.9 }))).toBeGreaterThan(
      labelPriority(node({ salience: 0.2 })),
    );
  });

  it("falls back to member-count priority for features without salience", () => {
    expect(labelPriority(node({ kind: "feature", memberCount: 30 }))).toBeGreaterThan(
      labelPriority(node({ kind: "exec" })),
    );
  });

  it("relaxes the ambient label floor as the field is zoomed in", () => {
    // Zoomed out (at the near threshold) the floor is highest; zoomed in it drops
    // to 0 so every near node labels.
    expect(ambientLabelFloor(0.6)).toBeGreaterThan(ambientLabelFloor(1.0));
    expect(ambientLabelFloor(1.0)).toBeGreaterThan(ambientLabelFloor(1.6));
    expect(ambientLabelFloor(1.6)).toBe(0);
  });
});

describe("derivation -> lineage classification (encoding map)", () => {
  it("recognizes pipeline-derivation edges as lineage edges", () => {
    expect(
      isLineageEdge({
        id: "e",
        src: "a",
        dst: "b",
        relation: "implements",
        tier: "declared",
        confidence: 1,
        derivation: "authorizes",
      }),
    ).toBe(true);
  });

  it("does not classify a tier-only edge as lineage", () => {
    expect(
      isLineageEdge({
        id: "e",
        src: "a",
        dst: "b",
        relation: "similar-to",
        tier: "semantic",
        confidence: 0.6,
      }),
    ).toBe(false);
  });
});
