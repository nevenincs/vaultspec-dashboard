import { describe, expect, it } from "vitest";

import { EngineClient } from "../../stores/server/engine";
import { MockEngine } from "../../testing/mockEngine";
import type { SceneEdgeData, SceneNodeData } from "../../scene/sceneController";
import { KEYFRAME_BACK_MARGIN_MS, TimeTravelDriver, mapDelta } from "./timeTravel";

function harness() {
  const mock = new MockEngine();
  let fetches = 0;
  const counting = new EngineClient({
    baseUrl: "/api",
    fetchImpl: (input, init) => {
      fetches += 1;
      return mock.fetchImpl(input, init);
    },
  });
  const pushes: {
    nodes: SceneNodeData[];
    edges: SceneEdgeData[];
    at: number | "live";
  }[] = [];
  const driver = new TimeTravelDriver(counting, "wt-main", {
    pushSlice: (nodes, edges, at) => pushes.push({ nodes, edges, at }),
  });
  return { mock, driver, pushes, fetchCount: () => fetches };
}

describe("mapDelta", () => {
  it("maps wire deltas onto the seam shape preserving the clock", () => {
    const mapped = mapDelta({
      op: "add",
      node: { id: "feature:a", kind: "feature", degree_by_tier: { declared: 2 } },
      t: 123,
      seq: 7,
    });
    expect(mapped).toMatchObject({ op: "add", t: 123, seq: 7 });
    expect(mapped.node?.degreeByTier).toEqual({ declared: 2 });
  });
});

describe("TimeTravelDriver", () => {
  it("re-keyframes on first scrub, then scrubs locally with zero fetches", async () => {
    const { mock, driver, pushes, fetchCount } = harness();
    const mid = mock.timeline[Math.floor(mock.timeline.length / 2)].ts;
    await driver.scrubTo(mid);
    const afterLoad = fetchCount();
    expect(afterLoad).toBe(2); // asof + diff
    expect(pushes.at(-1)?.at).toBe(mid);
    expect(pushes.at(-1)?.nodes.some((n) => n.kind === "feature")).toBe(true);

    // Scrub around inside the loaded range: pure local replay.
    await driver.scrubTo(mid + 3600_000);
    await driver.scrubTo(mid - 3600_000);
    expect(fetchCount()).toBe(afterLoad);
    expect(pushes.length).toBe(3);
  });

  it("re-keyframes on a jump outside the loaded range", async () => {
    const { mock, driver, fetchCount } = harness();
    const late = mock.timeline.at(-1)!.ts;
    await driver.scrubTo(late);
    const afterFirst = fetchCount();
    // Jump far before the keyframe anchor: outside the held range.
    await driver.scrubTo(late - KEYFRAME_BACK_MARGIN_MS - 24 * 3600_000);
    expect(fetchCount()).toBe(afterFirst + 2);
  });

  it("replays state as of T: progress is time-dependent", async () => {
    const { mock, driver, pushes } = harness();
    const early = mock.timeline[2].ts;
    await driver.scrubTo(early);
    const earlySlice = pushes.at(-1)!;
    const late = mock.timeline.at(-1)!.ts;
    await driver.scrubTo(late);
    const lateSlice = pushes.at(-1)!;
    expect(lateSlice.nodes.length).toBeGreaterThan(earlySlice.nodes.length);
  });

  it("splices live deltas on the same clock and extends the range", async () => {
    const { mock, driver } = harness();
    const late = mock.timeline.at(-1)!.ts;
    await driver.scrubTo(late);
    const next = (driver.lastSeq ?? 0) + 1;
    driver.spliceLive([
      {
        op: "add",
        node: { id: "doc:fresh", kind: "exec" },
        t: late + 1000,
        seq: next,
      },
    ]);
    expect(driver.lastSeq).toBe(next);
  });
});
