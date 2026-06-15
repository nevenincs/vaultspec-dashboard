// graph-representation W02.P05.S20: the lineage derivation-DAG layout — axis
// ordering along the PROV chain, longest-path layering, dangling-stub honesty,
// and holding-lane placement for nodes with no derivation edge.

import { describe, expect, it } from "vitest";

import type { SceneEdgeData, SceneNodeData } from "../sceneController";
import { LINEAGE_COL_SPACING, LINEAGE_HOLDING_X, lineageLayout } from "./lineageLayout";

const n = (id: string, kind = "doc"): SceneNodeData => ({ id, kind });
const lineageEdge = (src: string, dst: string, derivation: string): SceneEdgeData => ({
  id: `e:${src}->${dst}`,
  src,
  dst,
  relation: "rel",
  tier: "declared",
  confidence: 1,
  derivation,
});

describe("lineageLayout", () => {
  it("orders the derivation chain left-to-right by axis depth", () => {
    // research -grounds-> adr -authorizes-> plan -generated-by-> exec
    const nodes = [n("research"), n("adr"), n("plan"), n("exec")];
    const edges = [
      lineageEdge("research", "adr", "grounds"),
      lineageEdge("adr", "plan", "authorizes"),
      lineageEdge("plan", "exec", "generated-by"),
    ];
    const pos = lineageLayout(nodes, edges);
    expect(pos.get("research")!.x).toBeLessThan(pos.get("adr")!.x);
    expect(pos.get("adr")!.x).toBeLessThan(pos.get("plan")!.x);
    expect(pos.get("plan")!.x).toBeLessThan(pos.get("exec")!.x);
    // The chain is four columns deep.
    expect(pos.get("exec")!.depth).toBe(3);
  });

  it("marks an incomplete chain as a dangling stub, never fabricating an edge", () => {
    // The plan derives from an adr that is NOT in the slice.
    const nodes = [n("plan"), n("exec")];
    const edges = [
      lineageEdge("adr-missing", "plan", "authorizes"),
      lineageEdge("plan", "exec", "generated-by"),
    ];
    const pos = lineageLayout(nodes, edges);
    expect(pos.get("plan")!.dangling).toBe(true);
    // The exec's parent (plan) IS present, so it is not itself dangling.
    expect(pos.get("exec")!.dangling).toBe(false);
    // No position exists for the missing adr (no fabricated node).
    expect(pos.has("adr-missing")).toBe(false);
  });

  it("places nodes with no derivation edge in the holding lane, off the spine", () => {
    const nodes = [n("adr"), n("code"), n("commit")];
    const edges = [lineageEdge("research", "adr", "grounds")];
    // research is not in the slice; adr is dangling but on-spine.
    const pos = lineageLayout(nodes, edges);
    expect(pos.get("adr")!.onSpine).toBe(true);
    expect(pos.get("code")!.onSpine).toBe(false);
    expect(pos.get("code")!.x).toBe(LINEAGE_HOLDING_X);
    expect(pos.get("commit")!.onSpine).toBe(false);
  });

  it("is deterministic and stable across re-runs (mental-map preservation)", () => {
    const nodes = [n("a"), n("b"), n("c")];
    const edges = [
      lineageEdge("a", "b", "grounds"),
      lineageEdge("b", "c", "authorizes"),
    ];
    const first = lineageLayout(nodes, edges);
    const second = lineageLayout(nodes, edges);
    for (const id of ["a", "b", "c"]) {
      expect(second.get(id)).toEqual(first.get(id));
    }
  });

  it("is cycle-safe: a derivation cycle does not loop forever", () => {
    const nodes = [n("x"), n("y")];
    const edges = [lineageEdge("x", "y", "grounds"), lineageEdge("y", "x", "grounds")];
    const pos = lineageLayout(nodes, edges);
    expect(pos.has("x")).toBe(true);
    expect(pos.has("y")).toBe(true);
  });

  it("spaces columns by the documented column spacing", () => {
    const nodes = [n("a"), n("b")];
    const edges = [lineageEdge("a", "b", "grounds")];
    const pos = lineageLayout(nodes, edges);
    expect(pos.get("b")!.x - pos.get("a")!.x).toBe(LINEAGE_COL_SPACING);
  });
});
