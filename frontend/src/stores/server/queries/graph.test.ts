// @vitest-environment happy-dom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { liveScope, liveTransport } from "../../../testing/liveClient";
import { EngineError, engineClient } from "../engine";
import type {
  EngineEdge,
  GraphFilter,
  GraphSlice,
  NodeDetail,
  TiersBlock,
} from "../engine";
import {
  dashboardStateSessionIdentity,
  deriveGraphSliceAvailability,
  deriveInspectorNeighborTierView,
  deriveNodeDetailView,
  deriveSalienceSliceView,
  engineKeys,
  isAddressableNode,
  normalizeGraphSliceRequestIdentity,
  normalizeNodeNeighborDepth,
  normalizeNodeScopedRequestIdentity,
  useContentView,
  useGraphSlice,
  useGraphSliceAvailability,
  useNodeContent,
  useNodeDetail,
  useNodeEvidence,
  useNodeNeighbors,
  useNodeNeighborsBulk,
  useProgressiveGraphSlice,
  useReadTime,
  useSalienceSliceView,
  useTimelineLineageView,
} from "./index";
import { ENGINE_WAIT } from "../../../testing/timing";
import {
  dashboardState,
  graphSlice,
  sessionState,
  testQueryClient,
  wrapper,
} from "./testFixtures";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

describe("isAddressableNode (feature-node 404 guard)", () => {
  it("excludes synthesized feature aggregates and null, includes real graph nodes", () => {
    // The default constellation view selects/hovers/expands FEATURE nodes, whose
    // ids the engine 404s on /nodes/{id}, /evidence, /neighbors (they are not
    // stored graph nodes). The node-detail hooks gate on this so the default view
    // never fires those doomed requests (no 404 storm, no false `degraded`).
    expect(isAddressableNode("feature:dashboard-optimization")).toBe(false);
    expect(isAddressableNode("feature:dashboard-rag-manager")).toBe(false);
    expect(isAddressableNode(null)).toBe(false);
    // Real, resolvable graph nodes stay addressable.
    expect(isAddressableNode("doc:2026-06-16-graph-viz-quality-research")).toBe(true);
    expect(isAddressableNode("doc:anything")).toBe(true);
  });
});

describe("deriveNodeDetailView (node-detail surface state)", () => {
  const detail: NodeDetail = {
    node: { id: "doc:ready", kind: "plan", title: "Ready" },
    tiers: {
      declared: { available: true },
      structural: { available: true },
      temporal: { available: true },
      semantic: { available: true },
    },
  };

  it("returns idle when the node detail read is disabled", () => {
    expect(deriveNodeDetailView(undefined, false, false, false)).toEqual({
      state: "idle",
      detail: null,
      node: null,
    });
  });

  it("returns loading while an enabled read is pending", () => {
    expect(deriveNodeDetailView(undefined, true, false, true)).toEqual({
      state: "loading",
      detail: null,
      node: null,
    });
  });

  it("returns unavailable for transport errors or malformed node payloads", () => {
    expect(deriveNodeDetailView(undefined, false, true, true)).toEqual({
      state: "unavailable",
      detail: null,
      node: null,
    });
    expect(
      deriveNodeDetailView({ tiers: detail.tiers } as NodeDetail, false, false, true),
    ).toEqual({
      state: "unavailable",
      detail: null,
      node: null,
    });
  });

  it("returns ready with the resolved node detail", () => {
    expect(deriveNodeDetailView(detail, false, false, true)).toEqual({
      state: "ready",
      detail,
      node: detail.node,
    });
  });
});

describe("node-scoped query cache boundaries", () => {
  const detail: NodeDetail = {
    node: { id: "doc:ready", kind: "plan", title: "Ready" },
    tiers: {},
  };

  it("normalizes node-scoped query identity before keying node-family reads", () => {
    expect(normalizeNodeScopedRequestIdentity(" scope-a ", " doc:ready ", 2.8)).toEqual(
      {
        scope: "scope-a",
        nodeId: "doc:ready",
        depth: 2,
      },
    );
    expect(
      normalizeNodeScopedRequestIdentity({ scope: "scope-a" }, { id: "doc:ready" }, 0),
    ).toEqual({
      scope: null,
      nodeId: null,
      depth: 1,
    });
    expect(normalizeNodeNeighborDepth(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("does not expose cached node detail when no scope or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.node("", "doc:ready"), detail);
    client.setQueryData(engineKeys.node("scope-a", "feature:state"), detail);
    client.setQueryData(engineKeys.node("scope-a", "doc:ready"), detail);

    const noScope = renderHook(() => useNodeDetail("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeDetail("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useNodeDetail("doc:ready", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });

  it("does not expose cached node neighbors when no scope or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.neighbors("", "doc:ready", 1), graphSlice());
    client.setQueryData(
      engineKeys.neighbors("scope-a", "feature:state", 1),
      graphSlice(),
    );
    client.setQueryData(engineKeys.neighbors("scope-a", "doc:ready", 1), graphSlice());

    const noScope = renderHook(() => useNodeNeighbors("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeNeighbors("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedNode = renderHook(
      () => useNodeNeighbors({ id: "doc:ready" }, "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedNode.result.current.data).toBeUndefined();
  });

  it("does not expose cached bulk node neighbors when entries are disabled", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.neighbors("", "doc:ready", 1), graphSlice());
    client.setQueryData(
      engineKeys.neighbors("scope-a", "feature:state", 1),
      graphSlice(),
    );
    client.setQueryData(engineKeys.neighbors("scope-a", "doc:ready", 1), graphSlice());

    const noScope = renderHook(() => useNodeNeighborsBulk(["doc:ready"], null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(
      () => useNodeNeighborsBulk(["feature:state"], "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedNode = renderHook(
      () => useNodeNeighborsBulk([{ id: "doc:ready" }], "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current[0]?.data).toBeUndefined();
    expect(featureNode.result.current[0]?.data).toBeUndefined();
    expect(malformedNode.result.current[0]?.data).toBeUndefined();
  });

  it("does not expose cached node evidence when no scope or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.evidence("", "doc:ready"), { commits: [] });
    client.setQueryData(engineKeys.evidence("scope-a", "feature:state"), {
      commits: [],
    });
    client.setQueryData(engineKeys.evidence("scope-a", "doc:ready"), { commits: [] });

    const noScope = renderHook(() => useNodeEvidence("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeEvidence("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedScope = renderHook(
      () => useNodeEvidence("doc:ready", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedScope.result.current.data).toBeUndefined();
  });

  it("does not expose cached node content when no node, no scope, or no addressable node is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.content("", "doc:ready"), { text: "cached" });
    client.setQueryData(engineKeys.content("scope-a", ""), { text: "cached" });
    client.setQueryData(engineKeys.content("scope-a", "feature:state"), {
      text: "cached",
    });
    client.setQueryData(engineKeys.content("scope-a", "doc:ready"), {
      text: "cached",
    });

    const noScope = renderHook(() => useNodeContent("doc:ready", null), {
      wrapper: wrapper(client),
    });
    const noNode = renderHook(() => useNodeContent(null, "scope-a"), {
      wrapper: wrapper(client),
    });
    const featureNode = renderHook(() => useNodeContent("feature:state", "scope-a"), {
      wrapper: wrapper(client),
    });
    const malformedNode = renderHook(
      () => useNodeContent({ id: "doc:ready" }, "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );

    expect(noScope.result.current.data).toBeUndefined();
    expect(noNode.result.current.data).toBeUndefined();
    expect(featureNode.result.current.data).toBeUndefined();
    expect(malformedNode.result.current.data).toBeUndefined();
  });

  it("normalizes content-view identity before deriving viewer loading state", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.content("scope-a", "doc:ready"), {
      path: ".vault/plan/ready.md",
      blob_hash: "hash-ready",
      language_hint: "markdown",
      text: "cached reader text",
      truncated: null,
      tiers: { structural: { available: true } },
    });

    const trimmed = renderHook(() => useContentView(" doc:ready ", " scope-a "), {
      wrapper: wrapper(client),
    });
    const malformedNode = renderHook(
      () => useContentView({ id: "doc:ready" }, "scope-a"),
      {
        wrapper: wrapper(client),
      },
    );
    const malformedScope = renderHook(
      () => useContentView("doc:ready", { scope: "scope-a" }),
      {
        wrapper: wrapper(client),
      },
    );

    expect(trimmed.result.current).toMatchObject({
      loading: false,
      available: true,
      path: ".vault/plan/ready.md",
      text: "cached reader text",
    });
    expect(malformedNode.result.current).toMatchObject({
      loading: false,
      available: false,
      text: "",
    });
    expect(malformedScope.result.current).toMatchObject({
      loading: false,
      available: false,
      text: "",
    });
  });

  it("derives read time through the normalized content-view seam", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.content("scope-a", "doc:ready"), {
      text: "one two three",
      truncated: null,
      tiers: { structural: { available: true } },
    });

    const trimmed = renderHook(() => useReadTime(" doc:ready ", " scope-a "), {
      wrapper: wrapper(client),
    });
    const malformed = renderHook(() => useReadTime({ id: "doc:ready" }, "scope-a"), {
      wrapper: wrapper(client),
    });

    expect(trimmed.result.current).toEqual({
      minutes: 1,
      atLeast: false,
      words: 3,
    });
    expect(malformed.result.current).toEqual({
      minutes: 0,
      atLeast: false,
      words: 0,
    });
  });
});

describe("deriveInspectorNeighborTierView (right-rail inspector edges)", () => {
  const edge = (
    id: string,
    tier: EngineEdge["tier"],
    meta?: EngineEdge["meta"],
  ): EngineEdge => ({
    id,
    src: "doc:a",
    dst: `doc:${id}`,
    relation: "relates",
    tier,
    confidence: 0.8,
    ...(meta ? { meta } : {}),
  });

  it("groups neighbor edges by canonical tier order and excludes meta-edges", () => {
    const view = deriveInspectorNeighborTierView([
      edge("declared-1", "declared"),
      edge("structural-meta", "structural", {
        count: 2,
        breakdown_by_tier: { structural: 2 },
      }),
      edge("temporal-1", "temporal"),
    ]);

    expect(view.tierKeys).toEqual(["declared", "temporal"]);
    expect([...view.tiers.keys()]).toEqual(view.tierKeys);
    expect(view.tiers.get("declared")?.map((item) => item.id)).toEqual(["declared-1"]);
    expect(view.tiers.get("temporal")?.map((item) => item.id)).toEqual(["temporal-1"]);
    expect(view.tiers.has("structural")).toBe(false);
  });

  it("returns an empty stable surface when no neighbor slice has served", () => {
    const view = deriveInspectorNeighborTierView(undefined);

    expect(view.tierKeys).toEqual([]);
    expect([...view.tiers.entries()]).toEqual([]);
  });
});

describe("deriveGraphSliceAvailability (nav-controls descent, contract §2)", () => {
  const allUp: TiersBlock = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports no degradation and carries the loading flag through verbatim", () => {
    const idle = deriveGraphSliceAvailability(allUp, false);
    expect(idle.loading).toBe(false);
    expect(idle.degraded).toBe(false);
    expect(idle.degradedTiers).toEqual([]);
    const busy = deriveGraphSliceAvailability(allUp, true);
    expect(busy.loading).toBe(true);
    expect(busy.degraded).toBe(false);
  });

  it("treats a tier marked unavailable as degraded and carries its reason", () => {
    const a = deriveGraphSliceAvailability(
      { ...allUp, semantic: { available: false, reason: "rag service down" } },
      false,
    );
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["semantic"]);
    expect(a.reasons.semantic).toBe("rag service down");
  });

  it("treats a tier ABSENT from the block as degraded (absence ≠ availability)", () => {
    const partial: TiersBlock = {
      declared: { available: true },
      structural: { available: true },
    };
    const a = deriveGraphSliceAvailability(partial, false);
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["temporal", "semantic"]);
    expect(a.reasons).toEqual({});
  });

  it("returns the no-degradation default for a wholly absent block, preserving loading", () => {
    // A missing block is the query's ERROR/idle state, not every-tier-degraded;
    // the loading flag still flows through so the descent can show a busy cue
    // while the first slice is in flight (no served block yet).
    const a = deriveGraphSliceAvailability(undefined, true);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
    expect(a.loading).toBe(true);
  });

  it("does not issue duplicate graph requests when availability reads filter and lens changes", async () => {
    const scope = await liveScope();
    const graphRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/graph/query")) {
        graphRequests.push(input);
      }
      return liveTransport(input, init);
    });

    function useGraphWithAvailability(params: {
      filter?: GraphFilter;
      lens: "status" | "design";
    }) {
      const slice = useGraphSlice(
        scope,
        params.filter,
        undefined,
        "document",
        params.lens,
        null,
      );
      const availability = useGraphSliceAvailability(slice, true);
      return { slice, availability };
    }

    const client = testQueryClient();
    const { result, rerender } = renderHook(useGraphWithAvailability, {
      wrapper: wrapper(client),
      initialProps: { lens: "status" },
    });

    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true), ENGINE_WAIT);
    expect(result.current.availability.loading).toBe(false);
    expect(graphRequests).toHaveLength(1);

    rerender({ lens: "status", filter: { doc_types: ["plan"] } });
    await waitFor(() => expect(graphRequests).toHaveLength(2), ENGINE_WAIT);
    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true), ENGINE_WAIT);

    rerender({ lens: "design", filter: { doc_types: ["plan"] } });
    await waitFor(() => expect(graphRequests).toHaveLength(3), ENGINE_WAIT);
    await waitFor(() => expect(result.current.slice.isSuccess).toBe(true), ENGINE_WAIT);
  });

  it("forwards the canonical filter to the lineage wire on the same client path (unified-filter-plane D3)", async () => {
    // The timeline narrows by the canonical filter exactly as the graph does: the
    // active facet rides the SAME client path (engineClient.lineage) the app uses,
    // so a captured live request proves the wire shape (mock-mirrors-live-wire-shape).
    // No facet active -> no `filter=` param (the full set, one cache entry); a facet
    // active -> the URL-encoded JSON filter on the wire, a new bounded query.
    const scope = await liveScope();
    const lineageRequests: string[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/graph/lineage")) lineageRequests.push(input);
      return liveTransport(input, init);
    });

    const client = testQueryClient();
    const { result, rerender } = renderHook(
      (filter?: string) => useTimelineLineageView(scope, {}, filter),
      { wrapper: wrapper(client), initialProps: undefined as string | undefined },
    );

    await waitFor(() => expect(result.current.loading).toBe(false), ENGINE_WAIT);
    expect(lineageRequests).toHaveLength(1);
    expect(lineageRequests[0]).not.toContain("filter=");

    rerender(JSON.stringify({ doc_types: ["plan"] }));
    await waitFor(() => expect(lineageRequests).toHaveLength(2), ENGINE_WAIT);
    expect(lineageRequests[1]).toContain("filter=");
    expect(decodeURIComponent(lineageRequests[1]!)).toContain('"doc_types":["plan"]');
  });
});

describe("the lens-keyed graph query cache", () => {
  it("keys the graph query on the active lens so a lens switch is a re-query", () => {
    const statusKey = engineKeys.graph("s", undefined, undefined, "document", "status");
    const designKey = engineKeys.graph("s", undefined, undefined, "document", "design");
    expect(statusKey).not.toEqual(designKey);
    expect(statusKey).toContain("status");
    expect(designKey).toContain("design");
  });

  it("keys the graph query on the focus node so a focus change is a re-query", () => {
    const noFocus = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      null,
    );
    const focused = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      "doc:x",
    );
    expect(noFocus).not.toEqual(focused);
    expect(focused).toContain("doc:x");
  });

  it("the omitted lens/focus keys to the status, no-focus default", () => {
    const omitted = engineKeys.graph("s");
    const explicit = engineKeys.graph(
      "s",
      undefined,
      undefined,
      "document",
      "status",
      null,
    );
    expect(omitted).toEqual(explicit);
  });

  it("normalizes graph slice query identity before keying the central graph read", () => {
    expect(
      normalizeGraphSliceRequestIdentity(
        " wt-1 ",
        {
          tiers: { structural: false },
          date_range: { from: "2026-06-01", to: "2026-06-30" },
          text: " graph ",
        },
        " HEAD ",
        "feature",
        "design",
        " doc:plan ",
      ),
    ).toEqual({
      scope: "wt-1",
      filter: {
        tiers: { structural: false },
        date_range: { from: "2026-06-01", to: "2026-06-30" },
        text: "graph",
      },
      asOf: "HEAD",
      granularity: "feature",
      lens: "design",
      focus: "doc:plan",
      corpus: "vault",
    });

    expect(
      normalizeGraphSliceRequestIdentity(
        { scope: "wt-1" },
        { text: { value: "ignored" }, date_range: { from: "" } },
        Number.NaN,
        "unknown",
        "unknown",
        { id: "doc:plan" },
      ),
    ).toEqual({
      scope: null,
      filter: {},
      asOf: undefined,
      granularity: "document",
      lens: "status",
      focus: null,
      corpus: "vault",
    });
  });

  it("pins the code-corpus identity to canonical defaults for engine-ignored fields", () => {
    // The code corpus carries no vault Filter grammar, lens, as_of or focus (the
    // queryFn sends none of them), so they must not re-key the query either — a
    // left-rail filter toggle would otherwise re-fetch a byte-identical code slice
    // and its set-data could interrupt an in-flight settle (settle-on-swap audit).
    expect(
      normalizeGraphSliceRequestIdentity(
        " wt-1 ",
        { text: " graph " },
        " HEAD ",
        "feature",
        "design",
        " doc:plan ",
        "code",
      ),
    ).toEqual({
      scope: "wt-1",
      filter: {},
      asOf: undefined,
      granularity: "feature",
      lens: "status",
      focus: null,
      corpus: "code",
    });
  });

  it("carries ONLY the timeline date_range into the code-corpus identity", () => {
    // code-timeline-range ADR: the range facet is the one shared narrow, so a
    // timeline change re-keys the code slice while every other facet stays pinned.
    expect(
      normalizeGraphSliceRequestIdentity(
        "wt-1",
        {
          text: "ignored",
          date_range: { from: "2026-06-01", to: "2026-06-30" },
        },
        undefined,
        "document",
        undefined,
        undefined,
        "code",
      ),
    ).toEqual({
      scope: "wt-1",
      filter: { date_range: { from: "2026-06-01", to: "2026-06-30" } },
      asOf: undefined,
      granularity: "document",
      lens: "status",
      focus: null,
      corpus: "code",
    });
  });

  it("does not expose cached graph data when no scope is selected", () => {
    const client = testQueryClient();
    client.setQueryData(engineKeys.graph(""), graphSlice());

    const { result } = renderHook(() => useGraphSlice(null), {
      wrapper: wrapper(client),
    });

    expect(result.current.data).toBeUndefined();
  });

  it("does not expose cached graph data for malformed runtime scope", () => {
    const client = testQueryClient();
    client.setQueryData(
      engineKeys.graph("wt-1", {}, undefined, "document", "status", null),
      graphSlice(),
    );

    const { result } = renderHook(
      () => useGraphSlice({ scope: "wt-1" }, {}, undefined, "document", "status", null),
      {
        wrapper: wrapper(client),
      },
    );

    expect(result.current.data).toBeUndefined();
    client.clear();
  });
});

describe("the salience slice view (loading + degradation from tiers)", () => {
  const okTiers = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports loading on a focus-change re-query without flagging partial", () => {
    const view = deriveSalienceSliceView("status", undefined, null, true);
    expect(view.loading).toBe(true);
    expect(view.partial).toBe(false);
    expect(view.degradedTiers).toEqual([]);
  });

  it("does not expose held salience metadata while a new slice is loading", () => {
    const held = {
      nodes: [],
      edges: [],
      tiers: {
        ...okTiers,
        semantic: { available: false, reason: "stale rag state" },
      },
      lens: "design",
      salience_partial: true,
    } as unknown as GraphSlice;

    const view = deriveSalienceSliceView("status", held, null, true);

    expect(view).toMatchObject({
      lens: "status",
      loading: true,
      partial: false,
      degradedTiers: [],
      reasons: {},
    });
  });

  it("honors the engine's explicit salience_partial flag", () => {
    const data = {
      nodes: [],
      edges: [],
      tiers: okTiers,
      lens: "status",
      salience_partial: true,
    } as unknown as GraphSlice;
    const view = deriveSalienceSliceView("status", data, null, false);
    expect(view.partial).toBe(true);
    expect(view.lens).toBe("status");
  });

  it("derives partial from a degraded tier in the served block", () => {
    const data = {
      nodes: [],
      edges: [],
      tiers: {
        ...okTiers,
        declared: { available: false, reason: "core graph unavailable" },
      },
      lens: "design",
      salience_partial: false,
    } as unknown as GraphSlice;
    const view = deriveSalienceSliceView("design", data, null, false);
    expect(view.partial).toBe(true);
    expect(view.degradedTiers).toContain("declared");
    expect(view.reasons.declared).toBe("core graph unavailable");
  });

  it("lets FRESH error tiers win over a stale held-success block", () => {
    const held = {
      nodes: [],
      edges: [],
      tiers: okTiers,
      lens: "status",
      salience_partial: false,
    } as unknown as GraphSlice;
    const error = new EngineError("/graph/query", 502, {
      tiers: {
        ...okTiers,
        semantic: { available: false, reason: "rag down" },
      },
    });
    const view = deriveSalienceSliceView("status", held, error, false);
    expect(view.degradedTiers).toContain("semantic");
    expect(view.reasons.semantic).toBe("rag down");
  });

  it("does NOT flag partial from a bare transport error (no tiers)", () => {
    const view = deriveSalienceSliceView(
      "status",
      undefined,
      new Error("network down"),
      false,
    );
    expect(view.partial).toBe(false);
    expect(view.degradedTiers).toEqual([]);
  });

  it("does not expose cached salience graph data for malformed runtime scope", () => {
    const client = testQueryClient();
    const session = sessionState("scope-a");
    const sessionIdentity = dashboardStateSessionIdentity(session);
    client.setQueryData(engineKeys.session(), session);
    client.setQueryData(
      engineKeys.dashboardState("", sessionIdentity),
      dashboardState(""),
    );
    client.setQueryData(
      engineKeys.graph("", {}, undefined, "document", "status", null),
      {
        nodes: [],
        edges: [],
        tiers: okTiers,
        lens: "design",
        salience_partial: true,
      } satisfies GraphSlice,
    );

    const { result } = renderHook(
      () => useSalienceSliceView({ scope: "scope-a" }, { text: "cached" }),
      { wrapper: wrapper(client) },
    );

    expect(result.current).toEqual({
      lens: "status",
      loading: false,
      partial: false,
      degradedTiers: [],
      reasons: {},
    });
  });
});

describe("graph cache key (graph-filter-fetch-split: backend re-query, cache-instant repeat)", () => {
  it("is filter-sensitive, so a facet change is a distinct cache entry (engine re-queries the limited set)", () => {
    const scope = "scope-a";
    const keyAdr = engineKeys.graph(scope, { doc_types: ["adr"] });
    const keyPlan = engineKeys.graph(scope, { doc_types: ["plan"] });
    const keyNone = engineKeys.graph(scope);
    // A filter change keys a DIFFERENT entry — the engine re-queries the filtered
    // (limited) set; it is never one un-filtered "all data" entry the client masks.
    expect(keyAdr).not.toEqual(keyPlan);
    expect(keyAdr).not.toEqual(keyNone);
    // Only the filter segment differs; scope/granularity/lens/focus are identical.
    expect(keyAdr.slice(0, 3)).toEqual(keyPlan.slice(0, 3));
    expect(keyAdr.slice(4)).toEqual(keyPlan.slice(4));
  });

  it("is stable for identical filter content, so a repeated filter reuses the entry (no re-query)", () => {
    const scope = "scope-a";
    const keyA = engineKeys.graph(scope, { doc_types: ["adr"], statuses: ["draft"] });
    const keyRepeat = engineKeys.graph(scope, {
      doc_types: ["adr"],
      statuses: ["draft"],
    });
    // The same facet selection resolves to the SAME key — a toggle back to a
    // previously-seen filter is a cache hit (keepPreviousData keeps it from blanking).
    expect(keyRepeat).toEqual(keyA);
  });
});

describe("useProgressiveGraphSlice (on-demand-cold-start ADR D1)", () => {
  it("serves the constellation while a cold document slice is in flight, then passes the document slice through", async () => {
    const scope = await liveScope();
    // Delay ONLY the document-granularity graph query so the cold window is
    // observable; the feature-LOD (constellation) query rides the live wire.
    engineClient.useTransport(async (input, init) => {
      if (input.includes("/graph/query") && init?.body) {
        const body = JSON.parse(String(init.body)) as { granularity?: string };
        if (body.granularity === "document") {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
      return liveTransport(input, init);
    });

    const client = testQueryClient();
    const { result } = renderHook(
      () => useProgressiveGraphSlice(scope, undefined, undefined, "document"),
      { wrapper: wrapper(client) },
    );

    // The fill: constellation data held, isPending masked false — the canvas
    // renders a real field, and availability derives `refreshing`.
    await waitFor(() => expect(result.current.data).toBeDefined(), ENGINE_WAIT);
    expect(result.current.isPending).toBe(false);
    expect(
      (result.current.data?.nodes ?? []).every((n) => n.id.startsWith("feature:")),
    ).toBe(true);
    const availability = deriveGraphSliceAvailability(
      result.current.data?.tiers,
      result.current.isPending,
      result.current.isFetching && !result.current.isPending && !!result.current.data,
    );
    expect(availability.refreshing).toBe(true);

    // Enrichment: the document slice replaces the fill through the same hook.
    await waitFor(
      () =>
        expect(
          (result.current.data?.nodes ?? []).some((n) => n.id.startsWith("doc:")),
        ).toBe(true),
      ENGINE_WAIT,
    );
    expect(result.current.isFetching).toBe(false);
  });

  it("bypasses the fill for feature-granularity and time-travel requests (no second query)", async () => {
    const scope = await liveScope();
    const graphBodies: { granularity?: string; as_of?: number }[] = [];
    engineClient.useTransport((input, init) => {
      if (input.includes("/graph/query") && init?.body) {
        graphBodies.push(JSON.parse(String(init.body)) as never);
      }
      return liveTransport(input, init);
    });

    const client = testQueryClient();
    const { result } = renderHook(
      () => useProgressiveGraphSlice(scope, undefined, undefined, "feature"),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.data).toBeDefined(), ENGINE_WAIT);
    expect(graphBodies).toHaveLength(1);
    expect(graphBodies[0].granularity).toBe("feature");

    // Time-travel: one historical document query, never a constellation fill.
    graphBodies.length = 0;
    const asOf = renderHook(
      () => useProgressiveGraphSlice(scope, undefined, 1, "document"),
      { wrapper: wrapper(testQueryClient()) },
    );
    await waitFor(() => expect(graphBodies.length).toBeGreaterThan(0), ENGINE_WAIT);
    expect(graphBodies.every((b) => b.granularity === "document")).toBe(true);
    // The as-of bypass means no constellation fill ever substitutes for the
    // historical slice — the hook holds nothing until the document data lands.
    expect(asOf.result.current.data).toBeUndefined();
  });
});
