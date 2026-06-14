// graph-representation W02.P04.S17: the salience -> size + label-priority
// encoding (graph-representation ADR encoding map). Size is monotonic in salience
// for every species; label priority orders the ambient field by salience; the
// member-count rule is the honest fallback only when salience is absent.

import { describe, expect, it } from "vitest";

import type { SceneNodeData } from "../sceneController";
import { isLineageEdge } from "./edgeMeshes";
import { SALIENCE_RADIUS_MAX, labelPriority, nodeRadius } from "./nodeSprites";

const node = (over: Partial<SceneNodeData>): SceneNodeData => ({
  id: "n",
  kind: "adr",
  ...over,
});

describe("salience -> size encoding (graph-representation)", () => {
  it("makes radius monotonically increase with salience for any species", () => {
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

  it("drives size for non-feature species too (salience supersedes member-count)", () => {
    // An ADR with high salience reads larger than a low-salience feature node:
    // salience is the size signal, not the species.
    const bigAdr = nodeRadius(node({ kind: "adr", salience: 0.95 }));
    const smallFeature = nodeRadius(
      node({ kind: "feature", salience: 0.1, memberCount: 5 }),
    );
    expect(bigAdr).toBeGreaterThan(smallFeature);
  });

  it("falls back to the member-count rule only when salience is absent", () => {
    const baseAdr = nodeRadius(node({ kind: "adr" }));
    const bigFeature = nodeRadius(node({ kind: "feature", memberCount: 40 }));
    // Without salience, a many-member feature is larger than a base species.
    expect(bigFeature).toBeGreaterThan(baseAdr);
  });
});

describe("salience -> label priority (graph-representation)", () => {
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
});

describe("derivation -> lineage classification (graph-representation)", () => {
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
