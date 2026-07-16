import { describe, expect, it } from "vitest";

import type { EngineNode, NodeDetail } from "../../stores/server/engine";
import {
  FEATURE_LIFECYCLE_AXIS,
  arrangeFeatureLifecycleAxis,
  deriveFeatureLifecycleView,
  featureLifecycleDocType,
  featureLifecycleRank,
} from "../../stores/server/queries";
import {
  deriveNodeInteriorView,
  interiorSteps,
  stateMarkKey,
} from "../../stores/view/nodeInterior";

function documentNode(
  id: string,
  docType: string,
  extra?: Partial<EngineNode>,
): EngineNode {
  return { id, kind: "Document", doc_type: docType, ...extra };
}

describe("lifecycle axis (canonical layout, G3.e)", () => {
  it("ranks the five doc types in lifecycle order", () => {
    expect([...FEATURE_LIFECYCLE_AXIS].map(featureLifecycleRank)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(featureLifecycleRank("feature")).toBe(FEATURE_LIFECYCLE_AXIS.length);
  });

  it("arranges a feature's documents along the axis, dropping non-docs", () => {
    const arranged = arrangeFeatureLifecycleAxis(
      [
        documentNode("d", "audit"),
        { id: "f", kind: "Feature" },
        documentNode("a", "research"),
        documentNode("c", "exec"),
        documentNode("b", "adr"),
        documentNode("x", "private_type"),
        { id: "legacy", kind: "adr" },
      ],
      "en",
    );
    expect(arranged.map((node) => node.doc_type)).toEqual([
      "research",
      "adr",
      "exec",
      "audit",
    ]);
    expect(arranged.map((node) => node.id)).not.toContain("legacy");
    expect(featureLifecycleDocType(documentNode("known", "plan"))).toBe("plan");
    expect(featureLifecycleDocType(documentNode("unknown", "private_type"))).toBeNull();
  });

  it("derives the feature lifecycle loading and ready views", () => {
    expect(deriveFeatureLifecycleView(undefined, "en")).toEqual({
      state: "loading",
      docs: [],
    });

    expect(
      deriveFeatureLifecycleView(
        [
          documentNode("b", "adr"),
          documentNode("x", "private_type"),
          documentNode("a", "research"),
        ],
        "en",
      ),
    ).toMatchObject({
      state: "ready",
      docs: [{ id: "a" }, { id: "b" }],
    });
  });
});

describe("interiorSteps", () => {
  it("orders steps canonically with check state", () => {
    const steps = interiorSteps({
      nodes: [
        { id: "p#S02", kind: "step", title: "S02", lifecycle: { state: "active" } },
        {
          id: "p#S01",
          kind: "step",
          title: "S01",
          lifecycle: { state: "complete" },
        },
        { id: "private-step-id", kind: "step", title: "private-step-id" },
        { id: "missing-title-id", kind: "step" },
        documentNode("p", "plan"),
      ],
      edges: [],
      tiers: {},
    });
    expect(steps).toEqual([
      { id: "p#S01", title: "S01", done: true },
      { id: "p#S02", title: "S02", done: false },
    ]);
  });

  it("is empty without an interior", () => {
    expect(interiorSteps(undefined)).toEqual([]);
  });
});

describe("deriveNodeInteriorView", () => {
  const detail: NodeDetail = {
    node: documentNode("doc:plan", "plan", { title: "Plan" }),
    tiers: {},
  };

  it("routes synthesized feature nodes to the lifecycle interior", () => {
    expect(
      deriveNodeInteriorView("feature:state", {
        state: "idle",
        detail: null,
        node: null,
      }),
    ).toEqual({ state: "feature" });
  });

  it("projects loading and unavailable descriptors from node-detail state", () => {
    expect(
      deriveNodeInteriorView("doc:plan", {
        state: "loading",
        detail: null,
        node: null,
      }),
    ).toMatchObject({
      state: "loading",
      message: { key: "graph:islands.states.loading" },
    });

    expect(
      deriveNodeInteriorView("doc:plan", {
        state: "unavailable",
        detail: null,
        node: null,
      }),
    ).toMatchObject({
      state: "unavailable",
      message: { key: "graph:islands.states.unavailable" },
    });
  });

  it("projects ready node detail to the plan or summary branch", () => {
    expect(
      deriveNodeInteriorView("doc:plan", {
        state: "ready",
        detail,
        node: detail.node,
      }),
    ).toEqual({ state: "plan", detail });

    const summaryDetail: NodeDetail = {
      node: documentNode("doc:adr", "adr", { title: "ADR" }),
      tiers: {},
    };
    expect(
      deriveNodeInteriorView("doc:adr", {
        state: "ready",
        detail: summaryDetail,
        node: summaryDetail.node,
      }),
    ).toEqual({ state: "summary", node: summaryDetail.node });
  });
});

describe("stateMarkKey (grayscale-safe lifecycle mark resolution)", () => {
  it("resolves the five canonical lifecycle states to a mark key", () => {
    for (const s of ["active", "complete", "archived", "broken", "stale"]) {
      expect(stateMarkKey(s)).toBe(s);
    }
  });

  it("returns null for an unknown or absent state (no mark, never a guess)", () => {
    expect(stateMarkKey("in-progress")).toBeNull();
    expect(stateMarkKey(undefined)).toBeNull();
  });
});
