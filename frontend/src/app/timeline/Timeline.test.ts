import { describe, expect, it } from "vitest";

import type { LineageNode } from "../../stores/server/engine";
import {
  bucketForSpan,
  eventKindLabel,
  humanInstant,
  intersectTimelineWindows,
  monthAxisLabels,
  monthTicks,
  temporalDebugText,
  temporalNodeAccessibleLabel,
  timelineDocumentCountText,
  timelineQueryWindow,
  timelineDotInputs,
} from "./Timeline";
import { DEFAULT_PX_PER_MS } from "../../stores/view/timeline";
import type { TemporalSceneResult } from "./temporalScene";

const DAY = 24 * 3600 * 1000;

describe("eventKindLabel (accessible event-kind prose)", () => {
  it("names each kind in human prose for the accessible label", () => {
    expect(eventKindLabel("commit")).toBe("commit");
    expect(eventKindLabel("doc-created")).toBe("document created");
    expect(eventKindLabel("doc-modified")).toBe("document modified");
    expect(eventKindLabel("plan-approved")).toBe("plan approved");
  });
});

describe("humanInstant (tabular time label)", () => {
  it("renders a date + minute label from an ISO instant", () => {
    expect(humanInstant("2026-02-01T09:30:45Z")).toBe("2026-02-01 09:30");
  });
});

describe("monthTicks", () => {
  it("includes the month containing the visible start so the first band is labelled", () => {
    expect(
      monthTicks(
        Date.parse("2026-04-03T00:00:00Z"),
        Date.parse("2026-06-18T00:00:00Z"),
      ),
    ).toEqual([
      Date.parse("2026-04-01T00:00:00Z"),
      Date.parse("2026-05-01T00:00:00Z"),
      Date.parse("2026-06-01T00:00:00Z"),
    ]);
  });

  it("places visible month labels in the Figma graph slots", () => {
    expect(
      monthAxisLabels(
        Date.parse("2026-04-03T00:00:00Z"),
        Date.parse("2026-06-18T00:00:00Z"),
        844,
      ),
    ).toEqual([
      { key: Date.parse("2026-04-01T00:00:00Z"), label: "Apr", x: 129 },
      { key: Date.parse("2026-05-01T00:00:00Z"), label: "May", x: 365 },
      { key: Date.parse("2026-06-01T00:00:00Z"), label: "Jun", x: 601 },
    ]);
  });
});

describe("temporal graph accessibility/debug labels", () => {
  const scene = {
    nodes: [{ id: "doc:a", kind: "document" }],
    edges: [],
    nodeById: new Map(),
    bucketById: new Map(),
    buckets: [{ key: "2026-06-17", count: 8, x: 10, y: 20, radius: 30, ids: [] }],
    truncated: { total: 1200, returned: 1000 },
    edgeTruncated: { total: 3500, returned: 3000 },
    debug: {
      range: {
        from: "2026-06-16T00:00:00.000Z",
        to: "2026-06-18T00:00:00.000Z",
      },
      viewport: { width: 800, height: 240 },
      visibleNodeCount: 1000,
      visibleEdgeCount: 23,
      bucketCount: 4,
      densestBucket: { key: "2026-06-17", count: 8 },
    },
  } satisfies TemporalSceneResult;

  it("summarizes an individual canvas node without aggregating the document away", () => {
    const node: LineageNode = {
      id: "doc:a",
      doc_type: "research",
      phase: "research",
      dates: { created: "2026-06-17T09:00:00Z" },
      title: "Temporal research",
      degree: 4,
    };

    expect(temporalNodeAccessibleLabel(node, 20, 3)).toBe(
      "Temporal research, research, 2026-06-17, 20 documents on this day, 3 joined nodes",
    );
  });

  it("reports temporal density, truncation, simulation, and degradation state", () => {
    expect(
      temporalDebugText(
        scene,
        {
          representationMode: { applied: "temporal", staticLayout: true },
          simulationState: { active: false, running: false, alpha: 0.125 },
          rendererLifecycle: "static-ready",
          droppedEdges: 2,
        },
        true,
      ),
    ).toEqual([
      "mode temporal static",
      "nodes 1000",
      "edges 23",
      "buckets 4",
      "densest 2026-06-17 8",
      "sim paused alpha 0.13",
      "engine static-ready",
      "dropped 2",
      "nodes shown 1000/1200",
      "edges shown 3000/3500",
      "degraded reconnecting",
    ]);
  });

  it("summarizes visible and total document counts without range or density labels", () => {
    expect(timelineDocumentCountText(601, 1000)).toBe(
      "601 visible of 1,000 total documents",
    );
  });
});

describe("timelineQueryWindow (viewport crop sanitized by data bounds)", () => {
  it("intersects the visible viewport with the canonical crop range and corpus bounds", () => {
    const window = timelineQueryWindow(
      {
        fromMs: Date.parse("2026-06-10T00:00:00Z"),
        toMs: Date.parse("2026-06-20T00:00:00Z"),
      },
      {
        fromMs: Date.parse("2026-06-12T00:00:00Z"),
        toMs: Date.parse("2026-06-18T00:00:00Z"),
      },
      { from: "2026-06-14", to: "2026-06-30" },
    );

    expect(window).toEqual({
      fromMs: Date.parse("2026-06-14T00:00:00Z"),
      toMs: Date.parse("2026-06-18T00:00:00Z"),
      empty: false,
    });
  });

  it("marks a viewport outside the data window empty instead of widening it", () => {
    const window = timelineQueryWindow(
      {
        fromMs: Date.parse("2026-05-01T00:00:00Z"),
        toMs: Date.parse("2026-05-02T00:00:00Z"),
      },
      {
        fromMs: Date.parse("2026-06-12T00:00:00Z"),
        toMs: Date.parse("2026-06-18T00:00:00Z"),
      },
      { from: "2026-06-12", to: "2026-06-18" },
    );

    expect(window.empty).toBe(true);
    expect(window.fromMs).toBe(Date.parse("2026-06-12T00:00:00Z"));
    expect(window.toMs).toBe(window.fromMs);
  });

  it("orders reversed ranges before intersecting them", () => {
    expect(
      intersectTimelineWindows(
        {
          fromMs: Date.parse("2026-06-20T00:00:00Z"),
          toMs: Date.parse("2026-06-10T00:00:00Z"),
        },
        {
          fromMs: Date.parse("2026-06-12T00:00:00Z"),
          toMs: Date.parse("2026-06-18T00:00:00Z"),
        },
      ),
    ).toEqual({
      fromMs: Date.parse("2026-06-12T00:00:00Z"),
      toMs: Date.parse("2026-06-18T00:00:00Z"),
      empty: false,
    });
  });
});

describe("timelineDotInputs (foreground Figma timeline grammar)", () => {
  it("projects only in-range visible-lane nodes to packed dot inputs", () => {
    const nodes: LineageNode[] = [
      {
        id: "doc:research",
        doc_type: "research",
        phase: "research",
        dates: { created: "2026-06-17T00:00:00Z" },
        degree: 1,
      },
      {
        id: "doc:exec",
        doc_type: "exec",
        phase: "exec",
        dates: { created: "2026-06-17T00:00:00Z" },
        degree: 1,
      },
      {
        id: "doc:outside",
        doc_type: "plan",
        phase: "plan",
        dates: { created: "2026-07-01T00:00:00Z" },
        degree: 1,
      },
    ];

    const inputs = timelineDotInputs(
      nodes,
      {
        fromMs: Date.parse("2026-06-16T00:00:00Z"),
        toMs: Date.parse("2026-06-18T00:00:00Z"),
      },
      {
        research: true,
        adr: true,
        plan: true,
        exec: false,
        review: true,
        codify: false,
      },
      DEFAULT_PX_PER_MS,
      0,
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ id: "doc:research", group: 0 });
    expect(Number.isFinite(inputs[0]!.x)).toBe(true);
  });
});

describe("zoom = aggregation (G4.a)", () => {
  it("buckets coarse spans engine-side and resolves raw marks at fine zoom", () => {
    expect(bucketForSpan(2 * DAY)).toBe("raw");
    expect(bucketForSpan(30 * DAY)).toBe("1h");
    expect(bucketForSpan(200 * DAY)).toBe("1d");
  });
});
