import { describe, expect, it } from "vitest";

import {
  ARC_TIERS,
  type ArcInput,
  type ArcPoint,
  arcLabel,
  arcPath,
  arcTreatment,
  confidenceBucket,
  incidentArcIds,
  incidentResolvedArcs,
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

describe("incidentArcIds (the focused node's 1-hop edge identities)", () => {
  const arcs: ArcInput[] = [
    arc({ id: "incident-out", src: "h", dst: "x" }),
    arc({ id: "incident-in", src: "y", dst: "h" }),
    arc({ id: "far", src: "y", dst: "z" }),
  ];

  it("returns exactly the arcs touching the node (src OR dst)", () => {
    expect([...incidentArcIds(arcs, "h")].sort()).toEqual([
      "incident-in",
      "incident-out",
    ]);
  });

  it("returns an empty set when no node is focused (the marks-only default)", () => {
    expect(incidentArcIds(arcs, null).size).toBe(0);
  });
});

describe("incidentResolvedArcs (the on-demand relations overlay)", () => {
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

  it("draws NO arcs when no node is focused (marks-only default)", () => {
    expect(incidentResolvedArcs(arcs, positionOf, null)).toHaveLength(0);
  });

  it("draws ONLY the focused node's incident arcs, resolved with path + treatment", () => {
    const resolved = incidentResolvedArcs(arcs, positionOf, "h");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].id).toBe("incident");
    // The arc resolves to its bowed cubic path and its tier treatment.
    expect(resolved[0].path).toContain("C");
    expect(resolved[0].treatment.tier).toBe("declared");
    // The unrelated far arc is NOT drawn — relations are scoped to the focus.
    expect(resolved.some((a) => a.id === "far")).toBe(false);
  });

  it("drops an incident arc whose other endpoint is not positioned (no dangling arc)", () => {
    const dangling: ArcInput[] = [arc({ id: "e1", src: "h", dst: "ghost" })];
    expect(incidentResolvedArcs(dangling, positionOf, "h")).toHaveLength(0);
  });

  it("resolves both an outgoing and an incoming incident arc of the focus", () => {
    const both: ArcInput[] = [
      arc({ id: "out", src: "h", dst: "x" }),
      arc({ id: "in", src: "y", dst: "h" }),
    ];
    const resolved = incidentResolvedArcs(both, positionOf, "h").map((a) => a.id);
    expect(resolved.sort()).toEqual(["in", "out"]);
  });
});

describe("arcLabel (derivation > relation > tier for hover/a11y)", () => {
  it("prefers the derivation label, then relation, then a tier fallback", () => {
    expect(
      arcLabel(arc({ id: "1", derivation: "grounds", relation: "mentions" })),
    ).toBe("grounds");
    expect(arcLabel(arc({ id: "2", relation: "mentions" }))).toBe("mentions");
    expect(arcLabel(arc({ id: "3", tier: "temporal" }))).toBe("temporal link");
  });
});
