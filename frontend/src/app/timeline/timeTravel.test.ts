import { describe, expect, it } from "vitest";

import { EngineClient } from "../../stores/server/engine";
import { engineClientSource } from "../../stores/server/timeTravelSource";
import { MockEngine } from "../../testing/mockEngine";
import type { SceneEdgeData, SceneNodeData } from "../../scene/sceneController";
import {
  KEYFRAME_BACK_MARGIN_MS,
  TimeTravelDriver,
  isTimeTravel,
  mapDelta,
  opsDisabledFor,
} from "./timeTravel";

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
  const driver = new TimeTravelDriver(engineClientSource(counting), "wt-main", {
    pushSlice: (nodes, edges, at) => pushes.push({ nodes, edges, at }),
  });
  return { mock, driver, pushes, fetchCount: () => fetches };
}

// Time-travel honesty predicates (S61): the ONE honesty reading off the shared
// `timelineMode`. Both predicates are pure functions of that single mode — no
// surface re-derives "are we time travelling?" and no disable is guessed from a
// transport state. These assert the single-truth contract directly.
describe("time-travel honesty predicates (S61)", () => {
  it("isTimeTravel reads the shared mode, not a transport state", () => {
    expect(isTimeTravel({ kind: "live" })).toBe(false);
    expect(isTimeTravel({ kind: "time-travel", at: Date.now() })).toBe(true);
  });

  it("opsDisabledFor disables operational verbs in any time-travel mode", () => {
    // History is read-only: time-travel disables ops; live never does. The
    // disable is the same single mode reading, never guessed from an error.
    expect(opsDisabledFor({ kind: "live" })).toBe(false);
    expect(opsDisabledFor({ kind: "time-travel", at: 0 })).toBe(true);
    expect(opsDisabledFor({ kind: "time-travel", at: Date.now() })).toBe(true);
  });

  it("ops-disable tracks time-travel exactly (the disable IS the mode)", () => {
    // The disable predicate is congruent with the time-travel predicate, so
    // there is no third state where one says travelling and the other not.
    for (const mode of [
      { kind: "live" } as const,
      { kind: "time-travel", at: 1 } as const,
    ]) {
      expect(opsDisabledFor(mode)).toBe(isTimeTravel(mode));
    }
  });
});

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
});
