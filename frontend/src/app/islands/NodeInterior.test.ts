import { describe, expect, it } from "vitest";

import type { EngineNode } from "../../stores/server/engine";
import {
  LIFECYCLE_AXIS,
  arrangeLifecycleAxis,
  interiorSteps,
  lifecycleRank,
  stateMarkKey,
} from "./NodeInterior";

const node = (id: string, kind: string, extra?: Partial<EngineNode>): EngineNode => ({
  id,
  kind,
  ...extra,
});

describe("lifecycle axis (canonical layout, G3.e)", () => {
  it("ranks the five doc types in lifecycle order", () => {
    expect([...LIFECYCLE_AXIS].map(lifecycleRank)).toEqual([0, 1, 2, 3, 4]);
    expect(lifecycleRank("feature")).toBe(LIFECYCLE_AXIS.length);
  });

  it("arranges a feature's documents along the axis, dropping non-docs", () => {
    const arranged = arrangeLifecycleAxis([
      node("d", "audit"),
      node("f", "feature"),
      node("a", "research"),
      node("c", "exec"),
      node("b", "adr"),
      node("x", "code"),
    ]);
    expect(arranged.map((n) => n.kind)).toEqual(["research", "adr", "exec", "audit"]);
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
