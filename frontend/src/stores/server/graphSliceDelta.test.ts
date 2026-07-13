// @vitest-environment happy-dom
// Graph-slice delta reconcile (graph-slice-delta ADR D4): the id-keyed node/edge
// merge and the patch/full-drain/noop decision are pure and deterministic; the
// reconcile enumerates active document-slice observers, patches via the SHARED
// identity guard, and floors the fallback sweep. The live end-to-end delta wire is
// exercised by the engine route tests.

import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { liveTransport } from "../../testing/liveClient";
import {
  engineClient,
  type EngineEdge,
  type EngineNode,
  type GraphSlice,
  type GraphSliceDeltaResponse,
} from "./engine";
import { engineKeys } from "./queries";
import {
  mergeGraphSliceDelta,
  planGraphSliceReconcile,
  reconcileGraphSlice,
} from "./graphSync";

afterEach(() => engineClient.useTransport(liveTransport));

const node = (id: string, extra: Record<string, unknown> = {}): EngineNode =>
  ({ id, ...extra }) as unknown as EngineNode;
const edge = (id: string): EngineEdge => ({ id }) as unknown as EngineEdge;

function slice(
  nodeIds: string[],
  edgeIds: string[],
  over: Partial<GraphSlice> = {},
): GraphSlice {
  return {
    nodes: nodeIds.map((id) => node(id)),
    edges: edgeIds.map(edge),
    tiers: {},
    generation: 4,
    slice_token: "tok-a",
    ...over,
  } as GraphSlice;
}

const delta = (over: Partial<GraphSliceDeltaResponse>): GraphSliceDeltaResponse => ({
  generation: 5,
  tiers: {},
  ...over,
});

// A tiers block whose declared tier is still mid-build (the "Still loading links…"
// sentinel: unavailable with a reason naming a build).
const BUILDING_TIERS = {
  declared: { available: false, reason: "building declared links" },
} as unknown as GraphSlice["tiers"];

describe("mergeGraphSliceDelta (id-keyed node + edge merge)", () => {
  it("adds, removes, and replaces nodes and edges at the new generation", () => {
    const held = slice(["n1", "n2"], ["e1", "e2"]);
    const merged = mergeGraphSliceDelta(
      held,
      delta({
        generation: 5,
        changed_nodes: [node("n1", { title: "A2" }), node("n3")],
        removed_node_ids: ["n2"],
        changed_edges: [edge("e3")],
        removed_edge_ids: ["e2"],
      }),
    );
    expect(merged.nodes.map((n) => n.id).sort()).toEqual(["n1", "n3"]);
    // n1 is the replacement (carries the new title).
    expect(merged.nodes.find((n) => n.id === "n1")).toMatchObject({ title: "A2" });
    expect(merged.edges.map((e) => e.id).sort()).toEqual(["e1", "e3"]);
    expect(merged.generation).toBe(5);
    // The opaque token rides through (same params, new generation).
    expect(merged.slice_token).toBe("tok-a");
  });

  it("carries the delta's truncated block and tiers", () => {
    const merged = mergeGraphSliceDelta(
      slice(["n1"], []),
      delta({
        generation: 5,
        changed_nodes: [],
        removed_node_ids: [],
        truncated: { total_nodes: 9000, returned_nodes: 2000, reason: "ceiling" },
      }),
    );
    expect(merged.truncated).toEqual({
      total_nodes: 9000,
      returned_nodes: 2000,
      reason: "ceiling",
    });
  });
});

describe("planGraphSliceReconcile (patch / full-drain / noop)", () => {
  it("patches a held slice from a small delta", () => {
    const action = planGraphSliceReconcile(
      slice(["n1", "n2", "n3"], []),
      delta({ generation: 5, changed_nodes: [node("n4")], removed_node_ids: [] }),
    );
    expect(action.kind).toBe("patch");
    if (action.kind === "patch") {
      expect(action.value.nodes.map((n) => n.id).sort()).toEqual([
        "n1",
        "n2",
        "n3",
        "n4",
      ]);
    }
  });

  it("full-drains on full_required", () => {
    expect(
      planGraphSliceReconcile(slice(["n1"], []), delta({ full_required: true })).kind,
    ).toBe("full-drain");
  });

  it("full-drains when the delta touches more than half the held node set (guard #3)", () => {
    // Held 4 nodes; a delta of 3 touched nodes is > half → not worth patching.
    const action = planGraphSliceReconcile(
      slice(["n1", "n2", "n3", "n4"], []),
      delta({
        generation: 5,
        changed_nodes: [node("n5"), node("n6")],
        removed_node_ids: ["n1"],
      }),
    );
    expect(action.kind).toBe("full-drain");
  });

  it("is a noop when the generation is unchanged and no building tier cleared", () => {
    expect(
      planGraphSliceReconcile(
        slice(["n1"], [], { generation: 4 }),
        delta({ generation: 4, changed_nodes: [], removed_node_ids: [] }),
      ).kind,
    ).toBe("noop");
  });

  it("refreshes tiers on the SAME generation when a held building tier cleared (banner-flip guard)", () => {
    // A fold that flips building→ready without bumping the generation must still
    // clear the banner: same generation, held building, delta tiers ready → patch tiers.
    const action = planGraphSliceReconcile(
      slice(["n1"], [], { generation: 4, tiers: BUILDING_TIERS }),
      delta({ generation: 4, changed_nodes: [], removed_node_ids: [], tiers: {} }),
    );
    expect(action.kind).toBe("patch");
    if (action.kind === "patch") {
      expect(action.value.tiers).toEqual({});
      expect(action.value.generation).toBe(4);
    }
  });

  it("stays a noop on the same generation while the tier is STILL building", () => {
    expect(
      planGraphSliceReconcile(
        slice(["n1"], [], { generation: 4, tiers: BUILDING_TIERS }),
        delta({
          generation: 4,
          changed_nodes: [],
          removed_node_ids: [],
          tiers: BUILDING_TIERS,
        }),
      ).kind,
    ).toBe("noop");
  });
});

describe("reconcileGraphSlice (active-observer patch + floored fallback)", () => {
  const scope = "wt-graph";
  const key = engineKeys.graph(
    scope,
    {},
    undefined,
    "document",
    "status",
    null,
    "vault",
  );

  /** Mount an ACTIVE observer for `key` so the reconcile's `type:"active"` find hits
   *  it. Seeds the held slice first with `staleTime: Infinity` so the subscribe does
   *  not refetch (the observer stays enabled → active, but serves the seed).
   *  Returns an unsubscribe. */
  function mountActive(client: QueryClient, held: GraphSlice): () => void {
    client.setQueryData(key, held);
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn: () => held,
      staleTime: Infinity,
      gcTime: Infinity,
    });
    const unsub = observer.subscribe(() => {});
    return unsub;
  }

  function deltaTransport(body: object) {
    engineClient.useTransport(async (input, init) => {
      if (input.includes("/graph/query/delta")) {
        return new Response(JSON.stringify({ data: body, tiers: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return liveTransport(input, init);
    });
  }

  it("patches the held slice from a small delta and never sweeps", async () => {
    const client = new QueryClient();
    // 4 held nodes so a 2-touch delta stays under the guard-#3 half-set threshold.
    const unsub = mountActive(
      client,
      slice(["n1", "n2", "n3", "n4"], ["e1"], { generation: 4 }),
    );
    deltaTransport({
      since: 4,
      generation: 5,
      changed_nodes: [node("n5")],
      removed_node_ids: ["n2"],
      changed_edges: [],
      removed_edge_ids: [],
    });
    let swept = 0;
    await reconcileGraphSlice(client, scope, () => (swept += 1));
    const patched = client.getQueryData<GraphSlice>(key);
    expect(patched?.generation).toBe(5);
    expect(patched?.nodes.map((n) => n.id).sort()).toEqual(["n1", "n3", "n4", "n5"]);
    expect(swept).toBe(0);
    unsub();
  });

  it("floors the fallback sweep on a full_required delta", async () => {
    const client = new QueryClient();
    const unsub = mountActive(client, slice(["n1"], [], { generation: 4 }));
    deltaTransport({ generation: 5, full_required: true });
    let swept = 0;
    await reconcileGraphSlice(client, scope, () => (swept += 1));
    expect(swept).toBe(1);
    unsub();
  });

  it("refuses the patch and falls back to sweep when the held slice changed mid-fetch (lost-update guard)", async () => {
    const client = new QueryClient();
    const unsub = mountActive(
      client,
      slice(["n1", "n2", "n3", "n4"], ["e1"], { generation: 4 }),
    );
    // A concurrent write lands WHILE the delta is in flight: the transport swaps the
    // cached slice to a different object before the reconcile writes. The shared
    // identity guard (getQueryData === held) must then refuse the stale patch and
    // fall back to the floored sweep rather than clobber the newer value.
    engineClient.useTransport(async (input, init) => {
      if (input.includes("/graph/query/delta")) {
        client.setQueryData(
          key,
          slice(["n1", "n2", "n3", "n4"], ["e1"], { generation: 7 }),
        );
        return new Response(
          JSON.stringify({
            data: {
              since: 4,
              generation: 5,
              changed_nodes: [node("n5")],
              removed_node_ids: ["n2"],
              changed_edges: [],
              removed_edge_ids: [],
            },
            tiers: {},
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return liveTransport(input, init);
    });
    let swept = 0;
    await reconcileGraphSlice(client, scope, () => (swept += 1));
    // The newer concurrent value survives; the stale gen-5 patch is refused.
    expect(client.getQueryData<GraphSlice>(key)?.generation).toBe(7);
    expect(swept).toBe(1);
    unsub();
  });

  it("full-drains a document observer that has no baseline (no generation/token)", async () => {
    const client = new QueryClient();
    // Held slice WITHOUT generation/slice_token → not a delta baseline.
    const unsub = mountActive(client, {
      nodes: [node("n1")],
      edges: [],
      tiers: {},
    } as GraphSlice);
    let swept = 0;
    await reconcileGraphSlice(client, scope, () => (swept += 1));
    expect(swept).toBe(1);
    unsub();
  });
});
