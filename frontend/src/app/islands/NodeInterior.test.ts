import { describe, expect, it } from "vitest";

import type { EngineNode, NodeDetail } from "../../stores/server/engine";
import {
  FEATURE_LIFECYCLE_AXIS,
  arrangeFeatureLifecycleAxis,
  deriveFeatureLifecycleView,
  featureLifecycleRank,
} from "../../stores/server/queries";
import {
  deriveNodeInteriorView,
  interiorSteps,
  stateMarkKey,
} from "../../stores/view/nodeInterior";

const node = (id: string, kind: string, extra?: Partial<EngineNode>): EngineNode => ({
  id,
  kind,
  ...extra,
});

describe("lifecycle axis (canonical layout, G3.e)", () => {
  it("ranks the five doc types in lifecycle order", () => {
    expect([...FEATURE_LIFECYCLE_AXIS].map(featureLifecycleRank)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(featureLifecycleRank("feature")).toBe(FEATURE_LIFECYCLE_AXIS.length);
  });

  it("arranges a feature's documents along the axis, dropping non-docs", () => {
    const arranged = arrangeFeatureLifecycleAxis([
      node("d", "audit"),
      node("f", "feature"),
      node("a", "research"),
      node("c", "exec"),
      node("b", "adr"),
      node("x", "code"),
    ]);
    expect(arranged.map((n) => n.kind)).toEqual(["research", "adr", "exec", "audit"]);
  });

  it("derives the feature lifecycle loading and ready views", () => {
    expect(deriveFeatureLifecycleView(undefined)).toEqual({
      state: "loading",
      docs: [],
    });

    expect(
      deriveFeatureLifecycleView([
        node("b", "adr"),
        node("x", "code"),
        node("a", "research"),
      ]),
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
        node("p#S02", "step", { title: "S02", lifecycle: { state: "active" } }),
        node("p#S01", "step", { title: "S01", lifecycle: { state: "complete" } }),
        node("p", "plan"),
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
    node: { id: "doc:plan", kind: "plan", title: "Plan" },
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

  it("projects loading and unavailable copy from node-detail state", () => {
    expect(
      deriveNodeInteriorView("doc:plan", {
        state: "loading",
        detail: null,
        node: null,
      }),
    ).toMatchObject({
      state: "loading",
      message: "unfolding…",
      messageClassName: "mt-fg-1 text-label text-ink-faint",
    });

    expect(
      deriveNodeInteriorView("doc:plan", {
        state: "unavailable",
        detail: null,
        node: null,
      }),
    ).toMatchObject({
      state: "unavailable",
      message: "interior unavailable",
      messageClassName:
        "mt-fg-1 flex items-center gap-fg-1 text-label text-state-broken",
      iconSize: 14,
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
      node: { id: "doc:adr", kind: "adr", title: "ADR" },
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
