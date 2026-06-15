import { describe, expect, it } from "vitest";

import {
  ARC_TIERS,
  BUNDLE_STRENGTH,
  type ArcInput,
  type ArcPoint,
  arcLabel,
  arcPath,
  arcTreatment,
  bundledArcs,
  bundledPath,
  bundledWithHoverUnbundle,
  confidenceBucket,
  disparityFilter,
  groupByContainment,
  incidentArcIds,
  rawArcs,
  resolveArcs,
} from "./arcs";

const at =
  (positions: Record<string, ArcPoint>) =>
  (id: string): ArcPoint | undefined =>
    positions[id];

function arc(partial: Partial<ArcInput> & { id: string }): ArcInput {
  return {
    src: "a",
    dst: "b",
    tier: "declared",
    confidence: 1,
    ...partial,
  };
}

describe("arc treatment per tier (S36, tier-as-treatment vocabulary)", () => {
  it("declared draws a solid inked line in the declared tier token", () => {
    const t = arcTreatment("declared", 1);
    expect(t.style).toBe("solid");
    expect(t.dash).toBe("");
    expect(t.stroke).toBe("--color-tier-declared");
  });

  it("structural draws a solid line in the status hue, by state", () => {
    expect(arcTreatment("structural", 1, "resolved").stroke).toBe(
      "--color-state-active",
    );
    expect(arcTreatment("structural", 1, "stale").stroke).toBe("--color-state-stale");
    expect(arcTreatment("structural", 1, "broken").stroke).toBe("--color-state-broken");
    expect(arcTreatment("structural", 1).style).toBe("solid");
  });

  it("temporal draws a DOTTED line (the only dashed treatment)", () => {
    const t = arcTreatment("temporal", 1);
    expect(t.style).toBe("dotted");
    expect(t.dash).not.toBe("");
    expect(t.stroke).toBe("--color-tier-temporal");
  });

  it("semantic draws a wide faint HAZE in the semantic tier token", () => {
    const t = arcTreatment("semantic", 1);
    expect(t.style).toBe("haze");
    expect(t.stroke).toBe("--color-tier-semantic");
    // The haze is wider than a solid stroke and far fainter.
    expect(t.widthPx).toBeGreaterThan(arcTreatment("declared", 1).widthPx);
    expect(t.opacity).toBeLessThan(arcTreatment("declared", 1).opacity);
  });

  it("carries confidence as a lightness bucket, NOT as opacity alone", () => {
    // Higher confidence => a fuller (higher) lightness bucket on every tier; the
    // bucket is the confidence channel the stage uses, mirrored here.
    expect(confidenceBucket(0)).toBe(0);
    expect(confidenceBucket(1)).toBe(3);
    expect(arcTreatment("temporal", 0.1).lightnessBucket).toBeLessThan(
      arcTreatment("temporal", 0.9).lightnessBucket,
    );
  });

  it("covers exactly the four wire tiers", () => {
    expect([...ARC_TIERS]).toEqual(["declared", "structural", "temporal", "semantic"]);
  });
});

describe("arc geometry (S36, bowed left-to-right-and-down read)", () => {
  it("returns a cubic path connecting the two endpoints", () => {
    const p = arcPath({ x: 0, y: 0 }, { x: 100, y: 22 });
    expect(p.startsWith("M 0 0 C")).toBe(true);
    expect(p.endsWith("100 22")).toBe(true);
  });

  it("bows DOWN into a later (lower) lane and UP into an earlier (upper) lane", () => {
    // Flowing to a lower lane (dy>0): control y's are BELOW the endpoints.
    const down = arcPath({ x: 0, y: 0 }, { x: 100, y: 40 });
    const downCy = Number(down.split(/\s+/)[5]); // first control point y
    expect(downCy).toBeGreaterThan(0);
    // Flowing to an upper lane (dy<0): control y's are ABOVE the endpoints.
    const up = arcPath({ x: 0, y: 40 }, { x: 100, y: 0 });
    const upCy = Number(up.split(/\s+/)[5]);
    expect(upCy).toBeLessThan(40);
  });
});

describe("resolveArcs drops dangling arcs (S37, no dangling arc draws)", () => {
  const positionOf = at({ a: { x: 0, y: 0 }, b: { x: 50, y: 22 } });

  it("resolves an arc whose both endpoints are positioned", () => {
    const resolved = resolveArcs([arc({ id: "e1" })], positionOf);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("e1");
    expect(resolved[0].path).toContain("C");
  });

  it("drops an arc with a missing endpoint (not in range / lane hidden)", () => {
    const resolved = resolveArcs(
      [arc({ id: "e1", src: "a", dst: "ghost" })],
      positionOf,
    );
    expect(resolved).toHaveLength(0);
  });
});

describe("rawArcs under the client cap (S37, the v1 working surface)", () => {
  const positions: Record<string, ArcPoint> = {};
  for (let i = 0; i < 10; i++) positions[`n${i}`] = { x: i * 10, y: 0 };
  const positionOf = at(positions);
  const many: ArcInput[] = [];
  for (let i = 0; i < 9; i++)
    many.push(arc({ id: `e${i}`, src: `n${i}`, dst: `n${i + 1}` }));

  it("caps the resolved arcs and reports how many were dropped", () => {
    const capped = rawArcs(many, positionOf, 4);
    expect(capped.items).toHaveLength(4);
    expect(capped.dropped).toBe(5);
  });

  it("returns all arcs when under the cap", () => {
    const capped = rawArcs(many, positionOf, 100);
    expect(capped.items).toHaveLength(9);
    expect(capped.dropped).toBe(0);
  });
});

describe("disparity filter (S38, thin weak tiers to the significant subset)", () => {
  const arcs: ArcInput[] = [
    arc({ id: "d", tier: "declared", confidence: 0.1 }),
    arc({ id: "s", tier: "structural", confidence: 0.1 }),
    arc({ id: "t-weak", tier: "temporal", confidence: 0.2 }),
    arc({ id: "t-strong", tier: "temporal", confidence: 0.9 }),
    arc({ id: "m-weak", tier: "semantic", confidence: 0.2 }),
    arc({ id: "m-strong", tier: "semantic", confidence: 0.9 }),
  ];

  it("never thins declared or structural (framework-named lineage)", () => {
    const kept = disparityFilter(arcs, 0.5).map((a) => a.id);
    expect(kept).toContain("d");
    expect(kept).toContain("s");
  });

  it("drops weak temporal/semantic arcs below the confidence floor", () => {
    const kept = disparityFilter(arcs, 0.5).map((a) => a.id);
    expect(kept).not.toContain("t-weak");
    expect(kept).not.toContain("m-weak");
    expect(kept).toContain("t-strong");
    expect(kept).toContain("m-strong");
  });
});

describe("HEB grouping + bundled geometry (S38)", () => {
  it("groups arcs by their containment key, insertion-ordered", () => {
    const groups = groupByContainment(
      [arc({ id: "1" }), arc({ id: "2" }), arc({ id: "3" })],
      (a) => (a.id === "3" ? "g2" : "g1"),
    );
    expect([...groups.keys()]).toEqual(["g1", "g2"]);
    expect(groups.get("g1")!.map((a) => a.id)).toEqual(["1", "2"]);
  });

  it("bundledPath pulls control points toward the meeting point by strength", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 0 };
    const meet = { x: 50, y: 100 };
    const strong = bundledPath(from, to, meet, 1);
    // At full strength both control points sit AT the meeting point.
    expect(strong).toContain("C 50 100 50 100");
    const straight = bundledPath(from, to, meet, 0);
    // At zero strength control points stay at the endpoints (a straight cubic).
    expect(straight).toContain("C 0 0 100 0");
  });

  it("BUNDLE_STRENGTH is a strong pull in (0,1]", () => {
    expect(BUNDLE_STRENGTH).toBeGreaterThan(0.5);
    expect(BUNDLE_STRENGTH).toBeLessThanOrEqual(1);
  });
});

describe("bundled vs raw is gated; raw stays the fallback (S37/S38)", () => {
  const positions: Record<string, ArcPoint> = {
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    c: { x: 50, y: 22 },
  };
  const positionOf = at(positions);
  const arcs: ArcInput[] = [
    arc({ id: "e1", src: "a", dst: "b", tier: "declared", confidence: 1 }),
    arc({ id: "e2", src: "a", dst: "c", tier: "temporal", confidence: 0.9 }),
  ];

  it("raw arcs use the bowed path; bundled arcs use the meeting-point path", () => {
    const raw = rawArcs(arcs, positionOf, 100).items;
    const bundled = bundledArcs(arcs, positionOf, () => "feat", {
      minConfidence: 0.5,
      max: 100,
    }).items;
    // Both produce the same arc identities (gating preserves the set)…
    expect(raw.map((a) => a.id).sort()).toEqual(bundled.map((a) => a.id).sort());
    // …but the geometry differs: bundled routes through the centroid.
    const rawE1 = raw.find((a) => a.id === "e1")!;
    const bunE1 = bundled.find((a) => a.id === "e1")!;
    expect(rawE1.path).not.toBe(bunE1.path);
  });

  it("bundling respects the cap exactly like raw (never raises the ceiling)", () => {
    const capped = bundledArcs(arcs, positionOf, () => "feat", {
      minConfidence: 0,
      max: 1,
    });
    expect(capped.items).toHaveLength(1);
    expect(capped.dropped).toBe(1);
  });
});

describe("un-bundle-on-hover (S39, the bundling-legibility affordance)", () => {
  const positions: Record<string, ArcPoint> = {
    h: { x: 0, y: 0 },
    x: { x: 100, y: 22 },
    y: { x: 50, y: 44 },
    z: { x: 150, y: 44 },
  };
  const positionOf = at(positions);
  const arcs: ArcInput[] = [
    arc({ id: "incident", src: "h", dst: "x", tier: "declared", confidence: 1 }),
    arc({ id: "far", src: "y", dst: "z", tier: "declared", confidence: 1 }),
  ];

  it("incidentArcIds returns the arcs touching the hovered node", () => {
    expect([...incidentArcIds(arcs, "h")]).toEqual(["incident"]);
    expect(incidentArcIds(arcs, null).size).toBe(0);
  });

  it("renders the hovered node's incident arcs RAW and the rest bundled", () => {
    const hovered = bundledWithHoverUnbundle(arcs, positionOf, () => "feat", "h", {
      minConfidence: 0,
      max: 100,
    }).items;
    const rawIncident = resolveArcs(
      arcs.filter((a) => a.id === "incident"),
      positionOf,
    )[0];
    const incidentRendered = hovered.find((a) => a.id === "incident")!;
    // The incident arc is drawn with its RAW (bowed) path, not the bundled path.
    expect(incidentRendered.path).toBe(rawIncident.path);
    // The far arc is still present (bundled), so the rest never hides.
    expect(hovered.some((a) => a.id === "far")).toBe(true);
  });

  it("at rest (no hover) adds no raw arcs — it is exactly the bundled set", () => {
    const atRest = bundledWithHoverUnbundle(arcs, positionOf, () => "feat", null, {
      minConfidence: 0,
      max: 100,
    }).items;
    const bundled = bundledArcs(arcs, positionOf, () => "feat", {
      minConfidence: 0,
      max: 100,
    }).items;
    expect(atRest.map((a) => a.id).sort()).toEqual(bundled.map((a) => a.id).sort());
  });
});

describe("arcLabel (S39, derivation > relation > tier for hover/a11y)", () => {
  it("prefers the derivation label, then relation, then a tier fallback", () => {
    expect(
      arcLabel(arc({ id: "1", derivation: "grounds", relation: "mentions" })),
    ).toBe("grounds");
    expect(arcLabel(arc({ id: "2", relation: "mentions" }))).toBe("mentions");
    expect(arcLabel(arc({ id: "3", tier: "temporal" }))).toBe("temporal link");
  });
});
