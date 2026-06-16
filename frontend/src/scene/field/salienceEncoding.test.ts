// Circle salience sizing — the engine-served degree-of-interest encoding
// (graph/Hero 85:2, graph/Node-items 83:2; figma-parity-reconciliation
// W03.P07.S44).
//
// The binding canvas sizes each category circle by the node's SALIENCE: the
// engine-served degree-of-interest scalar in [0,1] (a CPU projection over
// personalized PageRank, betweenness, k-core, recency, and lifecycle, attached
// to the graph node payload — graph-compute-is-cpu). Size is the importance
// field made visible; it is monotonic in salience for EVERY species and capped at
// the documented band. Salience ALSO orders the DOI label cull. The member-count
// rule is the honest fallback only when the origin does not serve salience.
//
// These are pure-function assertions over the sizing source (`nodeRadius`,
// `labelPriority`, `ambientLabelFloor` in `nodeSprites.ts`); no GPU is reached.

import { describe, expect, it } from "vitest";

import type { SceneNodeData } from "../sceneController";
import { isLineageEdge } from "./edgeMeshes";
import {
  SALIENCE_RADIUS_MAX,
  ambientLabelFloor,
  labelPriority,
  nodeRadius,
} from "./nodeSprites";

const node = (over: Partial<SceneNodeData>): SceneNodeData => ({
  id: "n",
  kind: "adr",
  ...over,
});

describe("salience -> circle size (engine-served degree-of-interest)", () => {
  it("grows the circle monotonically with salience for any species", () => {
    const low = nodeRadius(node({ salience: 0.1 }));
    const mid = nodeRadius(node({ salience: 0.5 }));
    const high = nodeRadius(node({ salience: 0.95 }));
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("caps the salience radius band at the documented maximum", () => {
    const base = nodeRadius(node({ salience: 0 }));
    const top = nodeRadius(node({ salience: 1 }));
    expect(top / base).toBeCloseTo(SALIENCE_RADIUS_MAX, 5);
  });

  it("clamps an out-of-range salience to the [0,1] band", () => {
    // A degree-of-interest value the engine could in theory emit slightly out of
    // band must not blow the circle past the documented cap, nor shrink it below
    // the base. (Defensive: salience is engine-served and should be in [0,1].)
    const atZero = nodeRadius(node({ salience: 0 }));
    const atOne = nodeRadius(node({ salience: 1 }));
    expect(nodeRadius(node({ salience: -0.5 }))).toBe(atZero);
    expect(nodeRadius(node({ salience: 1.5 }))).toBe(atOne);
  });

  it("lets salience drive size for non-feature species too (supersedes member-count)", () => {
    // A high-salience ADR reads larger than a low-salience feature node: salience
    // is the size signal, not the species — the importance field is what scales.
    const bigAdr = nodeRadius(node({ kind: "adr", salience: 0.95 }));
    const smallFeature = nodeRadius(
      node({ kind: "feature", salience: 0.1, memberCount: 5 }),
    );
    expect(bigAdr).toBeGreaterThan(smallFeature);
  });

  it("falls back to the member-count rule only when salience is absent", () => {
    const baseAdr = nodeRadius(node({ kind: "adr" }));
    const bigFeature = nodeRadius(node({ kind: "feature", memberCount: 40 }));
    // Without salience, a many-member feature is larger than a base species; every
    // non-feature species without salience keeps the base radius (shape carries
    // type, not size).
    expect(bigFeature).toBeGreaterThan(baseAdr);
    expect(nodeRadius(node({ kind: "exec" }))).toBe(baseAdr);
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
