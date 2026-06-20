import { describe, expect, it } from "vitest";

import type { LineageArc, LineageNode } from "../../stores/server/engine";
import { DEFAULT_PX_PER_MS } from "../../stores/view/timeline";
import { PHASE_LANES, type PhaseLane } from "./phaseLanes";
import { MAX_TIMELINE_ARCS } from "./scrollStrip";
import { lineageToTemporalScene } from "./temporalScene";

function allVisible(): Record<PhaseLane, boolean> {
  return Object.fromEntries(PHASE_LANES.map((lane) => [lane, true])) as Record<
    PhaseLane,
    boolean
  >;
}

function doc(id: string, day: string, docType = "research"): LineageNode {
  return {
    id,
    doc_type: docType,
    phase: docType === "exec" ? "exec" : "research",
    dates: { created: day },
    title: id,
    degree: 3,
  };
}

function arc(src: string, dst: string): LineageArc {
  return {
    id: `edge:${src}->${dst}`,
    src,
    dst,
    relation: "references",
    tier: "declared",
    confidence: 1,
  };
}

describe("lineageToTemporalScene", () => {
  it("maps visible lineage nodes and self-consistent arcs to temporal scene data", () => {
    const nodes = [
      doc("doc:a", "2026-06-17", "research"),
      doc("doc:b", "2026-06-17", "exec"),
      doc("doc:c", "2026-06-18", "adr"),
      doc("doc:outside", "2026-07-01", "plan"),
    ];
    const scene = lineageToTemporalScene({
      nodes,
      arcs: [arc("doc:a", "doc:b"), arc("doc:a", "doc:outside")],
      range: {
        fromMs: Date.parse("2026-06-16T00:00:00Z"),
        toMs: Date.parse("2026-06-19T00:00:00Z"),
      },
      laneVisibility: allVisible(),
      pxPerMs: DEFAULT_PX_PER_MS,
      scrollOffset: 0,
      width: 800,
      height: 240,
    });

    expect(scene.nodes.map((node) => node.id).sort()).toEqual([
      "doc:a",
      "doc:b",
      "doc:c",
    ]);
    expect(scene.edges.map((edge) => edge.id)).toEqual(["edge:doc:a->doc:b"]);
    expect(scene.buckets.map((bucket) => [bucket.key, bucket.count])).toEqual([
      ["2026-06-17", 2],
      ["2026-06-18", 1],
    ]);
    expect(scene.bucketById.get("doc:a")?.key).toBe("2026-06-17");
    expect(scene.debug).toMatchObject({
      visibleNodeCount: 3,
      visibleEdgeCount: 1,
      bucketCount: 2,
      densestBucket: { key: "2026-06-17", count: 2 },
      viewport: { width: 800, height: 240 },
    });
    for (const node of scene.nodes) {
      expect(node.kind).toBe("document");
      expect(node.seedPosition).toBeDefined();
      expect(node.salience).toBeLessThanOrEqual(0.18);
      expect(node.temporal?.bucket).toMatch(/^2026-06-/);
    }
    expect(scene.edges[0]?.confidence).toBeLessThanOrEqual(0.18);
  });

  it("caps self-consistent arcs before sending them to the temporal canvas", () => {
    const nodes = [doc("doc:a", "2026-06-17"), doc("doc:b", "2026-06-17")];
    const arcs = Array.from({ length: MAX_TIMELINE_ARCS + 7 }, (_, i) => ({
      ...arc("doc:a", "doc:b"),
      id: `edge:${i}`,
    }));

    const scene = lineageToTemporalScene({
      nodes,
      arcs,
      range: {
        fromMs: Date.parse("2026-06-16T00:00:00Z"),
        toMs: Date.parse("2026-06-18T00:00:00Z"),
      },
      laneVisibility: allVisible(),
      pxPerMs: DEFAULT_PX_PER_MS,
      scrollOffset: 0,
      width: 800,
      height: 240,
    });

    expect(scene.edges).toHaveLength(MAX_TIMELINE_ARCS);
    expect(scene.edgeTruncated).toEqual({
      total: MAX_TIMELINE_ARCS + 7,
      returned: MAX_TIMELINE_ARCS,
    });
    expect(scene.debug.visibleEdgeCount).toBe(MAX_TIMELINE_ARCS);
  });
});
