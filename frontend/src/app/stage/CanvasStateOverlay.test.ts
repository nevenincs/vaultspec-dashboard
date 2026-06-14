import { afterEach, describe, expect, it } from "vitest";

import { engineClient, type GraphSlice } from "../../stores/server/engine";
import type { GraphSliceAvailability } from "../../stores/server/queries";
import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
import { resolveCanvasState } from "./CanvasStateOverlay";

// The node-canvas ADR "States" table, exercised as a pure resolver: every wire
// condition resolves to a designed state, never a raw error. These assertions
// derive their expectations from the ADR prose, not from any implementation run.

const HEALTHY: GraphSliceAvailability = {
  loading: false,
  degraded: false,
  degradedTiers: [],
  reasons: {},
};

const slice = (extra: Partial<GraphSlice> = {}): GraphSlice => ({
  nodes: [],
  edges: [],
  tiers: {},
  ...extra,
});

describe("resolveCanvasState (ADR States table)", () => {
  it("the empty/no-graph invitation dominates every other condition", () => {
    const state = resolveCanvasState({
      scope: "wt-main",
      granularity: "feature",
      stageSurface: "empty-invitation",
      // Even with a held slice and a truncation, empty wins.
      slice: slice({ truncated: { total_nodes: 9, returned_nodes: 5, reason: "x" } }),
      availability: HEALTHY,
    });
    expect(state).toEqual({ kind: "empty" });
  });

  it("awaits a scope when none is resolved yet", () => {
    expect(
      resolveCanvasState({
        scope: null,
        granularity: "feature",
        stageSurface: "normal",
        slice: null,
        availability: HEALTHY,
      }),
    ).toEqual({ kind: "awaiting-scope" });
  });

  it("loads the scope-appropriate view while the first keyframe is in flight", () => {
    expect(
      resolveCanvasState({
        scope: "wt-main",
        granularity: "feature",
        stageSurface: "normal",
        slice: null,
        availability: HEALTHY,
      }),
    ).toEqual({ kind: "loading-constellation" });
    expect(
      resolveCanvasState({
        scope: "wt-main",
        granularity: "document",
        stageSurface: "normal",
        slice: null,
        availability: HEALTHY,
      }),
    ).toEqual({ kind: "loading-document" });
  });

  it("surfaces an unknown tier as a DATA error, never a silent re-bucket", () => {
    const state = resolveCanvasState({
      scope: "wt-main",
      granularity: "feature",
      stageSurface: "normal",
      slice: slice(),
      availability: {
        loading: false,
        degraded: true,
        degradedTiers: ["semantic", "quantum"],
        reasons: {},
      },
    });
    expect(state).toEqual({ kind: "unknown-tier", tiers: ["quantum"] });
  });

  it("renders the capped subgraph plus a refine affordance when the ceiling fired", () => {
    const state = resolveCanvasState({
      scope: "wt-main",
      granularity: "document",
      stageSurface: "normal",
      slice: slice({
        nodes: [{ id: "a", kind: "plan" }],
        truncated: { total_nodes: 4200, returned_nodes: 2000, reason: "node ceiling" },
      }),
      availability: HEALTHY,
    });
    expect(state).toEqual({
      kind: "truncated",
      total: 4200,
      returned: 2000,
      reason: "node ceiling",
    });
  });

  it("renders an honestly-absent tier as non-blocking degradation, not a failure", () => {
    const state = resolveCanvasState({
      scope: "wt-main",
      granularity: "feature",
      stageSurface: "normal",
      slice: slice(),
      availability: {
        loading: false,
        degraded: true,
        degradedTiers: ["semantic"],
        reasons: { semantic: "rag down" },
      },
    });
    expect(state).toEqual({
      kind: "degraded",
      tiers: ["semantic"],
      reasons: { semantic: "rag down" },
    });
  });

  it("a known degraded tier is preferred over a present (null) truncation block", () => {
    // truncated:null must NOT trigger the truncated state.
    const state = resolveCanvasState({
      scope: "wt-main",
      granularity: "feature",
      stageSurface: "normal",
      slice: slice({ truncated: null }),
      availability: {
        loading: false,
        degraded: true,
        degradedTiers: ["temporal"],
        reasons: {},
      },
    });
    expect(state.kind).toBe("degraded");
  });

  it("is ok when a slice is held and every tier is available", () => {
    expect(
      resolveCanvasState({
        scope: "wt-main",
        granularity: "feature",
        stageSurface: "normal",
        slice: slice({ truncated: null }),
        availability: HEALTHY,
      }),
    ).toEqual({ kind: "ok" });
  });
});

// The mock-mirrors-live-wire-shape FIDELITY proof (HIGH-1): the `truncated` block
// is exercised end-to-end through the SAME client path the app uses — the mock
// engine serves the live shape, `engineClient.graphQuery` runs it through
// `adaptGraphSlice`, and `resolveCanvasState` over the ADAPTER-PRODUCED slice
// yields the truncated state. This proves the field survives the real transport
// + adapter, not just a hand-built object.
describe("truncated block fidelity through the real client path (HIGH-1)", () => {
  afterEach(() => {
    engineClient.useTransport((input, init) => fetch(input, init));
  });

  it("survives adaptGraphSlice and resolves to the truncated canvas state", async () => {
    const mock = new MockEngine();
    // Drive the engine's node ceiling: the mock now serves the live
    // `{total_nodes, returned_nodes, reason}` shape (committed setTruncated).
    mock.setTruncated(4200);
    engineClient.useTransport(mock.fetchImpl);

    // The exact call the Stage makes — through the real client + adapter.
    const adapted = await engineClient.graphQuery({
      scope: MOCK_SCOPE,
      granularity: "document",
    });

    // The wire `truncated` block survived adaptGraphSlice as the typed field.
    expect(adapted.truncated).toEqual({
      total_nodes: 4200,
      returned_nodes: 4200,
      reason: expect.stringContaining("node ceiling"),
    });

    // The consumer resolves the adapter-produced slice to the truncated state.
    const state = resolveCanvasState({
      scope: MOCK_SCOPE,
      granularity: "document",
      stageSurface: "normal",
      slice: adapted,
      availability: HEALTHY,
    });
    expect(state).toEqual({
      kind: "truncated",
      total: 4200,
      returned: 4200,
      reason: expect.stringContaining("node ceiling"),
    });
  });

  it("serves no truncated block (null) on an unbounded slice — ok state", async () => {
    const mock = new MockEngine();
    engineClient.useTransport(mock.fetchImpl);
    const adapted = await engineClient.graphQuery({
      scope: MOCK_SCOPE,
      granularity: "feature",
    });
    expect(adapted.truncated ?? null).toBeNull();
    const state = resolveCanvasState({
      scope: MOCK_SCOPE,
      granularity: "feature",
      stageSurface: "normal",
      slice: adapted,
      availability: HEALTHY,
    });
    expect(state).toEqual({ kind: "ok" });
  });
});
