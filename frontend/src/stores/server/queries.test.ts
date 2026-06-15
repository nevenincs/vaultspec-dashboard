import { describe, expect, it } from "vitest";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import { assertBounded, syntheticGraphDeltas } from "../../testing/adverse";
import { MOCK_SCOPE, MockEngine } from "../../testing/mockEngine";
import { EngineClient, EngineError } from "./engine";
import type {
  DiscoverResponse,
  EngineStatus,
  LineageSlice,
  PipelineArtifact,
  PlanInterior,
  TiersBlock,
} from "./engine";
import { adaptLineageSlice, adaptStatus, unwrapEnvelope } from "./liveAdapters";
import type { StreamChunk } from "./queries";
import {
  STREAM_RETENTION,
  deriveDiscoverView,
  deriveGitStatusView,
  deriveGraphSliceAvailability,
  derivePipelineStatusView,
  derivePlanInteriorView,
  deriveVaultTreeAvailability,
  engineKeys,
  parseSseFrames,
  sseChunks,
  stableKey,
  streamReducer,
} from "./queries";

describe("stableKey", () => {
  it("is order-insensitive for object keys and drops undefined", () => {
    expect(stableKey({ b: 1, a: 2 })).toBe(stableKey({ a: 2, b: 1 }));
    expect(stableKey({ a: 1, gone: undefined })).toBe(stableKey({ a: 1 }));
    expect(stableKey(undefined)).toBe("");
  });
});

describe("deriveVaultTreeAvailability (sidebar degradation, contract §2)", () => {
  const allUp: TiersBlock = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: { available: true },
  };

  it("reports no degradation when every canonical tier is available", () => {
    const a = deriveVaultTreeAvailability(allUp);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
    expect(a.reasons).toEqual({});
  });

  it("treats a tier marked unavailable as degraded and carries its reason", () => {
    const a = deriveVaultTreeAvailability({
      ...allUp,
      semantic: { available: false, reason: "rag service down" },
    });
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["semantic"]);
    expect(a.reasons.semantic).toBe("rag service down");
  });

  it("treats a tier ABSENT from the block as degraded (absence ≠ availability)", () => {
    // Contract §2: an absent tier is a designed degraded state, never read as
    // available. A reason-less degradation carries no reason string.
    const partial: TiersBlock = {
      declared: { available: true },
      structural: { available: true },
    };
    const a = deriveVaultTreeAvailability(partial);
    expect(a.degraded).toBe(true);
    expect(a.degradedTiers).toEqual(["temporal", "semantic"]);
    expect(a.reasons).toEqual({});
  });

  it("returns the no-degradation default for a wholly absent block (transport fault)", () => {
    // A missing block is the query's ERROR state (rendered distinctly by the
    // sidebar), not every-tier-degraded — so the degraded banner does not also
    // fire on a bare transport failure.
    const a = deriveVaultTreeAvailability(undefined);
    expect(a.degraded).toBe(false);
    expect(a.degradedTiers).toEqual([]);
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
});

describe("deriveDiscoverView (canvas-controls discover, contract §4)", () => {
  const edge = (id: string): DiscoverResponse["candidates"][number] => ({
    id,
    src: "feature:a",
    dst: "feature:b",
    relation: "related",
    tier: "semantic",
    confidence: 0.8,
  });
  const served = (
    candidates: DiscoverResponse["candidates"],
    semanticUp = true,
  ): DiscoverResponse => ({
    candidates,
    tiers: { semantic: { available: semanticUp } },
  });

  it("is the inert closed state when the panel is not open (disabled query)", () => {
    const v = deriveDiscoverView(undefined, null, false, false);
    expect(v).toEqual({ loading: false, offline: false, candidates: [] });
  });

  it("carries the loading flag while the request is in flight, no candidates yet", () => {
    const v = deriveDiscoverView(undefined, null, true, true);
    expect(v.loading).toBe(true);
    expect(v.offline).toBe(false);
    expect(v.candidates).toEqual([]);
  });

  it("surfaces ranked candidates when rag serves them", () => {
    const v = deriveDiscoverView(served([edge("e1"), edge("e2")]), null, false, true);
    expect(v.offline).toBe(false);
    expect(v.candidates.map((c) => c.id)).toEqual(["e1", "e2"]);
  });

  it("maps a tiers-bearing 502 (rag down) to the designed offline state, not an error", () => {
    const err = new EngineError("/nodes/x/discover", 502, {
      tiers: { semantic: { available: false, reason: "rag service down" } },
    });
    const v = deriveDiscoverView(undefined, err, false, true);
    expect(v.offline).toBe(true);
    expect(v.candidates).toEqual([]);
  });

  it("maps a tiers-less transport fault on the discover route to offline (route fails only when rag is down)", () => {
    const v = deriveDiscoverView(undefined, new Error("network"), false, true);
    expect(v.offline).toBe(true);
  });

  it("treats a SUCCESS envelope marking semantic unavailable as offline", () => {
    const v = deriveDiscoverView(served([], false), null, false, true);
    expect(v.offline).toBe(true);
  });

  it("is empty-not-offline when rag is up and serves zero candidates", () => {
    const v = deriveDiscoverView(served([]), null, false, true);
    expect(v.offline).toBe(false);
    expect(v.candidates).toEqual([]);
  });
});

describe("engineKeys", () => {
  it("keys graph slices by the (scope, filter, as-of, granularity, lens, focus) tuple", () => {
    const a = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const b = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const c = engineKeys.graph("wt-2", { tiers: { semantic: false } }, 123);
    const d = engineKeys.graph("wt-1", { tiers: { semantic: false } });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // Defaults (key tail is [..., asOf, granularity, lens, focus]): as-of "live",
    // granularity "document", lens "status", focus "none" (the engine's defaults).
    expect(d[d.length - 4]).toBe("live");
    expect(d[d.length - 3]).toBe("document");
    expect(d[d.length - 2]).toBe("status");
    expect(d[d.length - 1]).toBe("none");
    // Granularity is part of the cache identity: the constellation (feature)
    // and a document slice never collide in cache.
    const feature = engineKeys.graph("wt-1", undefined, undefined, "feature");
    const document = engineKeys.graph("wt-1", undefined, undefined, "document");
    expect(feature).not.toEqual(document);
    expect(feature[feature.length - 3]).toBe("feature");
    // Lens and focus are part of the cache identity (graph-node-salience): two
    // lenses or two focuses never collide in cache.
    const statusLens = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "status",
    );
    const designLens = engineKeys.graph(
      "wt-1",
      undefined,
      undefined,
      "document",
      "design",
    );
    expect(statusLens).not.toEqual(designLens);
    // With focus appended as the key tail, the lens sits at length-2.
    expect(designLens[designLens.length - 2]).toBe("design");
  });
});

describe("parseSseFrames", () => {
  it("parses completed frames and keeps the remainder", () => {
    const { frames, rest } = parseSseFrames(
      'event: graph\ndata: {"seq":1}\n\nevent: git\ndata: {"head":"abc"}\n\nevent: graph\ndata: {"se',
    );
    expect(frames).toEqual([
      { channel: "graph", data: { seq: 1 } },
      { channel: "git", data: { head: "abc" } },
    ]);
    expect(rest).toContain('data: {"se');
  });

  it("passes non-JSON data through as text", () => {
    const { frames } = parseSseFrames("data: plain\n\n");
    expect(frames).toEqual([{ channel: "message", data: "plain" }]);
  });
});

describe("sseChunks over the mock engine stream", () => {
  it("yields replayed graph deltas in sequence order from since=", async () => {
    const mock = new MockEngine();
    const client = new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });
    const since = mock.lastSeq - 3;
    const response = await client.openStream(["graph"], since);
    const seqs: number[] = [];
    for await (const chunk of sseChunks(response)) {
      seqs.push((chunk.data as { seq: number }).seq);
      if (seqs.length === 3) break;
    }
    expect(seqs).toEqual([since + 1, since + 2, since + 3]);
  });

  it("delivers live pushes on subscribed channels only", async () => {
    const mock = new MockEngine();
    const client = new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });
    const response = await client.openStream(["backends"]);
    const received: unknown[] = [];
    const consume = (async () => {
      for await (const chunk of sseChunks(response)) {
        received.push(chunk);
        break;
      }
    })();
    // Give the stream a tick to subscribe, then push.
    await new Promise((r) => setTimeout(r, 0));
    mock.push("git", { head: "ignored" });
    mock.push("backends", { rag: "stopped" });
    await consume;
    expect(received).toEqual([{ channel: "backends", data: { rag: "stopped" } }]);
  });

  it("throws StreamLostError on a non-ok stream response (ADR D2)", async () => {
    const badResponse = new Response("nope", { status: 503 });
    await expect(async () => {
      for await (const _chunk of sseChunks(badResponse)) {
        void _chunk;
      }
    }).rejects.toBeInstanceOf(StreamLostError);
  });

  it("throws StreamLostError when the body read fails mid-stream", async () => {
    const failingBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("connection reset"));
      },
    });
    const response = new Response(failingBody, { status: 200 });
    await expect(async () => {
      for await (const _chunk of sseChunks(response)) {
        void _chunk;
      }
    }).rejects.toBeInstanceOf(StreamLostError);
  });
});

describe("streamReducer bounded growth (P-HIGH-6)", () => {
  it("ring-caps the accumulator under a long delta storm and keeps the latest seq", () => {
    // Without the cap this accumulator would hold all 10_000 chunks for the
    // session (HIGH-6). The reducer must retain only the tail window.
    let acc: StreamChunk[] = [];
    for (const delta of syntheticGraphDeltas(10_000)) {
      acc = streamReducer(acc, { channel: "graph", data: delta });
    }
    assertBounded(acc.length, STREAM_RETENTION, "stream accumulator");
    expect(acc.length).toBe(STREAM_RETENTION);
    // The latest seq is always retained, so consumers' maxSeq stays correct.
    const seqs = acc.map((chunk) => (chunk.data as { seq: number }).seq);
    expect(Math.max(...seqs)).toBe(10_000);
  });

  it("still dedups a repeated seq within the window", () => {
    const frame: StreamChunk = { channel: "graph", data: { op: "add", seq: 7 } };
    let acc: StreamChunk[] = [];
    acc = streamReducer(acc, frame);
    acc = streamReducer(acc, frame);
    expect(acc).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deriveGitStatusView — git working-tree interpretation (git-diff-browser ADR).
// git is NOT a tier: availability tracks the PRESENCE of the git payload; `dirty`
// is the live BOOLEAN; ahead/behind are Option (absent = no upstream).
// ---------------------------------------------------------------------------

function statusWith(
  git: EngineStatus["git"],
  tiers: TiersBlock = { structural: { available: true } },
): EngineStatus {
  return { ok: true, nodes: 0, edges: 0, degradations: [], tiers, git };
}

describe("deriveGitStatusView", () => {
  it("reports available with the git payload and the dirty boolean when git is served", () => {
    const view = deriveGitStatusView(
      statusWith({ branch: "main", ahead: 1, dirty: true }),
      undefined,
      false,
    );
    expect(view).toMatchObject({ loading: false, degraded: false, errored: false });
    expect(view.git?.branch).toBe("main");
    expect(view.dirty).toBe(true);
  });

  it("reports a clean tree when the dirty boolean is false", () => {
    const view = deriveGitStatusView(
      statusWith({ branch: "main", dirty: false }),
      undefined,
      false,
    );
    expect(view.dirty).toBe(false);
    expect(view.degraded).toBe(false);
  });

  it("treats a served response with NO git payload as designed degradation, not error", () => {
    const view = deriveGitStatusView(
      statusWith(undefined, { structural: { available: true } }),
      undefined,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
  });

  it("surfaces a tiers-bearing error envelope (backend answered) as degradation", () => {
    const err = new EngineError("/status", 502, {
      tiers: { structural: { available: false } },
    });
    const view = deriveGitStatusView(undefined, err, false);
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
  });

  it("surfaces a tiers-less transport fault as the errored branch", () => {
    const err = new EngineError("/status", 500);
    const view = deriveGitStatusView(undefined, err, false);
    expect(view.errored).toBe(true);
    expect(view.degraded).toBe(false);
  });

  it("reports loading while the snapshot is in flight with no data or error", () => {
    const view = deriveGitStatusView(undefined, undefined, true);
    expect(view.loading).toBe(true);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LIVE-SAMPLE PARITY (mock-mirrors-live-wire-shape): a RAW live-shaped /status
// sample (`{git:{head_ref, dirty:bool, ahead:Option, behind:Option}}`) fed
// through `adaptStatus` → `deriveGitStatusView` must yield a correct surface.
// ---------------------------------------------------------------------------

describe("git status live-sample parity through adaptStatus", () => {
  it("derives branch from head_ref, preserves the dirty boolean, and keeps ahead/behind when present", () => {
    // A verbatim live `/status` envelope shape (head_ref, index, backends, and
    // an upstream-configured git block with numeric ahead/behind).
    const liveSample = {
      ok: true,
      index: { nodes: 12, edges: 8 },
      degradations: [],
      tiers: { structural: { available: true } },
      git: { head_ref: "refs/heads/feature/x", dirty: true, ahead: 3, behind: 2 },
      backends: { core: { vault_health: "green" }, rag: { available: true } },
    };
    const status = adaptStatus(liveSample);
    const view = deriveGitStatusView(status, undefined, false);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
    // head_ref → branch (refs/heads/ stripped).
    expect(view.git?.branch).toBe("feature/x");
    expect(view.dirty).toBe(true);
    expect(view.git?.ahead).toBe(3);
    expect(view.git?.behind).toBe(2);
  });

  it("preserves undefined ahead/behind (no upstream) rather than coercing to zero", () => {
    // Live shape with NO upstream → ahead/behind absent from the git block.
    const liveSample = {
      ok: true,
      index: { nodes: 0, edges: 0 },
      degradations: [],
      tiers: { structural: { available: true } },
      git: { head_ref: "refs/heads/main", dirty: false },
      backends: {},
    };
    const status = adaptStatus(liveSample);
    expect(status.git?.ahead).toBeUndefined();
    expect(status.git?.behind).toBeUndefined();
    const view = deriveGitStatusView(status, undefined, false);
    expect(view.git?.ahead).toBeUndefined();
    expect(view.git?.behind).toBeUndefined();
    expect(view.dirty).toBe(false);
  });

  it("collapses a legacy/internal dirty string[] to the boolean truth", () => {
    // Tolerated legacy shape: a dirty list collapses to "is anything dirty".
    const liveSample = {
      ok: true,
      index: {},
      degradations: [],
      tiers: {},
      git: { head_ref: "refs/heads/main", dirty: ["a.ts", "b.ts"] },
    };
    const status = adaptStatus(liveSample);
    expect(status.git?.dirty).toBe(true);
  });
});

describe("derivePipelineStatusView (Work surface degradation, W01.P03.S17)", () => {
  const structuralUp: TiersBlock = { structural: { available: true } };
  const structuralDown: TiersBlock = {
    structural: { available: false, reason: "vault index rebuilding" },
  };
  const artifacts: PipelineArtifact[] = [
    {
      node_id: "doc:2026-06-14-x-plan",
      stem: "2026-06-14-x-plan",
      title: "x plan",
      doc_type: "plan",
      tier: "L3",
      progress: { done: 2, total: 5 },
      phase: "execute",
    },
    {
      node_id: "doc:2026-06-14-x-adr",
      stem: "2026-06-14-x-adr",
      title: "x adr",
      doc_type: "adr",
      status: "proposed",
      phase: "adr",
    },
  ];

  it("is not degraded and carries the artifacts when the structural tier is available", () => {
    const view = derivePipelineStatusView(structuralUp, artifacts, false);
    expect(view.degraded).toBe(false);
    expect(view.degradedTiers).toEqual([]);
    expect(view.artifacts).toHaveLength(2);
  });

  it("reports degraded when the structural tier is explicitly unavailable", () => {
    const view = derivePipelineStatusView(structuralDown, artifacts, false);
    expect(view.degraded).toBe(true);
    expect(view.degradedTiers).toContain("structural");
    expect(view.reasons.structural).toBe("vault index rebuilding");
    // While degraded the projection is not trusted: no stale list is rendered.
    expect(view.artifacts).toEqual([]);
  });

  it("reports degraded when the structural tier is ABSENT from the served block (absence != available)", () => {
    const view = derivePipelineStatusView(
      { semantic: { available: true } },
      artifacts,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.degradedTiers).toContain("structural");
  });

  it("does NOT guess degraded from a wholly absent tiers block (transport fault stays a query error)", () => {
    const view = derivePipelineStatusView(undefined, artifacts, false);
    expect(view.degraded).toBe(false);
    // The held artifacts pass through; the surface renders them, not a degraded notice.
    expect(view.artifacts).toHaveLength(2);
  });

  it("the FRESH error envelope tiers win over a stale held-success block (call-site order)", () => {
    // The hook reads `errTiers ?? dataTiers`: a fresh error reporting the tier
    // down outranks a previously held success that reported it up. Exercise the
    // resolved truth the hook passes the selector.
    const heldSuccess = structuralUp;
    const freshError = structuralDown;
    const resolved = freshError ?? heldSuccess;
    const view = derivePipelineStatusView(resolved, artifacts, false);
    expect(view.degraded).toBe(true);
    expect(view.reasons.structural).toBe("vault index rebuilding");
  });

  it("carries the real pending flag through as loading", () => {
    const view = derivePipelineStatusView(structuralUp, [], true);
    expect(view.loading).toBe(true);
  });
});

describe("derivePlanInteriorView (step-tree rollup + truncation, W01.P02.S11)", () => {
  it("rolls up completion bottom-up across the L3 wave/phase shape", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:x-plan",
      waves: [
        {
          node_id: "x#W01",
          id: "W01",
          heading: "wave one",
          phases: [
            {
              node_id: "x#W01/P01",
              id: "P01",
              heading: "phase one",
              steps: [
                { node_id: "x#S01", id: "S01", done: true },
                { node_id: "x#S02", id: "S02", done: false },
                { node_id: "x#S03", id: "S03", done: true },
              ],
            },
          ],
        },
      ],
      phases: [],
      steps: [],
      truncated: null,
    };
    const view = derivePlanInteriorView(interior, false);
    expect(view.waves[0].phases[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.waves[0].rollup).toEqual({ done: 2, total: 3 });
    expect(view.rollup).toEqual({ done: 2, total: 3 });
    expect(view.truncated).toBeNull();
  });

  it("rolls up the flat L1 step shape and surfaces honest truncation", () => {
    const interior: PlanInterior = {
      plan_node_id: "doc:x-plan",
      waves: [],
      phases: [],
      steps: [
        { node_id: "x#S01", id: "S01", done: true },
        { node_id: "x#S02", id: "S02", done: false },
      ],
      truncated: { total_nodes: 9001, returned_nodes: 2000, reason: "node ceiling" },
    };
    const view = derivePlanInteriorView(interior, false);
    expect(view.rollup).toEqual({ done: 1, total: 2 });
    expect(view.truncated).toEqual({
      total_nodes: 9001,
      returned_nodes: 2000,
      reason: "node ceiling",
    });
  });

  it("is the inert empty view while loading with no held interior", () => {
    const view = derivePlanInteriorView(undefined, true);
    expect(view.loading).toBe(true);
    expect(view.rollup).toEqual({ done: 0, total: 0 });
    expect(view.waves).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// adaptLineageSlice + /graph/lineage consumer fidelity (dashboard-timeline
// W02.P04.S24) — the mock-mirrors-live-wire-shape PROOF in executable form.
//
// A sample CAPTURED from the live `/graph/lineage` wire shape (the engine
// `graph_lineage` route's `{data: {nodes, arcs, truncated}, tiers}` envelope) is
// fed through the SAME client path the app uses (unwrapEnvelope + adaptLineageSlice),
// then the MockEngine is driven through that same EngineClient and the two shapes
// are asserted to match. A divergence is a test-fidelity defect to fix in the mock,
// never papered over by adapting only the live side (mock-mirrors-live-wire-shape).
// ---------------------------------------------------------------------------

function clientOn(mock: MockEngine): EngineClient {
  const client = new EngineClient({ baseUrl: "" });
  client.useTransport(mock.fetchImpl);
  return client;
}

describe("adaptLineageSlice + /graph/lineage consumer fidelity (W02.P04.S24)", () => {
  // A live `/graph/lineage` envelope: two dated, lane-owning document nodes in
  // range and ONE self-consistent structural arc between them. The live route
  // serves `{data: {nodes, arcs, truncated}, tiers}`; the semantic tier is
  // present-only (degraded) in the range lineage. `dates.modified` is the engine
  // `Timestamp` (epoch-ms NUMBER), and the arc carries NO `derivation` field
  // (the graceful fallback until the node-semantics field ships).
  const liveLineageTiers = {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    semantic: {
      available: false,
      reason: "present-only by design; excluded from the range lineage",
    },
  };
  const live = {
    data: {
      nodes: [
        {
          id: "doc:2026-06-10-x-research",
          doc_type: "research",
          phase: "research",
          dates: { created: "2026-06-10", modified: 1718000000000 },
          title: "x research",
          degree: 2,
        },
        {
          id: "doc:2026-06-12-x-adr",
          doc_type: "adr",
          phase: "adr",
          dates: { created: "2026-06-12" },
          title: "x adr",
          degree: 2,
        },
      ],
      arcs: [
        {
          id: "edge:abc",
          src: "doc:2026-06-12-x-adr",
          dst: "doc:2026-06-10-x-research",
          relation: "mentions",
          tier: "structural",
          confidence: 0.9,
        },
      ],
      truncated: null,
    },
    tiers: liveLineageTiers,
  };

  it("unwraps + adapts the live lineage envelope through the app's client path", () => {
    const slice = adaptLineageSlice(unwrapEnvelope(live)) as LineageSlice;
    expect(slice.nodes).toHaveLength(2);
    expect(slice.nodes[0]).toMatchObject({
      id: "doc:2026-06-10-x-research",
      phase: "research",
      degree: 2,
    });
    // The numeric epoch-ms modified tick survives as a number, not a string.
    expect(slice.nodes[0].dates.modified).toBe(1718000000000);
    // The undated-modified node tolerates the absent optional.
    expect(slice.nodes[1].dates.modified).toBeUndefined();
    expect(slice.arcs).toHaveLength(1);
    expect(slice.arcs[0].derivation).toBeUndefined(); // graceful fallback
    expect(slice.tiers.semantic.available).toBe(false);
    expect(slice.truncated).toBeNull();
  });

  it("the mock serves the SAME lineage shape through the client path", async () => {
    const mock = new MockEngine();
    const result = await clientOn(mock).lineage({ scope: MOCK_SCOPE });

    // Non-empty: the corpus carries dated, lane-owning documents.
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.arcs.length).toBeGreaterThan(0);

    // Every node carries the exact live field shape, with the live types.
    const lanePhases = ["research", "adr", "plan", "exec", "review", "codify"];
    for (const n of result.nodes) {
      expect(n.id).toMatch(/^doc:/);
      expect(typeof n.doc_type).toBe("string");
      expect(lanePhases).toContain(n.phase);
      expect(typeof n.degree).toBe("number");
      // `created` is an ISO string; `modified`, when present, is an epoch-ms
      // NUMBER (the engine `Timestamp`) — NOT a string. This is the precise
      // mock-vs-live divergence point the fidelity test guards.
      if (n.dates.created !== undefined) expect(typeof n.dates.created).toBe("string");
      if (n.dates.modified !== undefined)
        expect(typeof n.dates.modified).toBe("number");
      // Only lane-owning doc-types are projected (commits/code/features excluded).
      expect([
        "research",
        "adr",
        "plan",
        "exec",
        "audit",
        "reference",
        "rule",
      ]).toContain(n.doc_type);
    }

    // Self-consistency: every arc's src AND dst is a returned node (no dangling
    // arc), exactly the engine's invariant — and the arc carries NO derivation.
    const ids = new Set(result.nodes.map((n) => n.id));
    for (const a of result.arcs) {
      expect(ids.has(a.src)).toBe(true);
      expect(ids.has(a.dst)).toBe(true);
      expect(typeof a.confidence).toBe("number");
      expect(["declared", "structural", "temporal", "semantic"]).toContain(a.tier);
      expect(a.derivation).toBeUndefined(); // derivation-fallback, like live
    }

    // Bounded + honest: a small corpus is not truncated.
    expect(result.truncated).toBeNull();
    // The envelope tiers ride through with semantic present-only (range lineage).
    expect(result.tiers.semantic.available).toBe(false);
  });

  it("honors the [from, to] range: an out-of-range document is excluded", async () => {
    const mock = new MockEngine();
    const client = clientOn(mock);
    // The corpus is dated from 2026-01-05 onward; a window before it is empty.
    const before = await client.lineage({
      scope: MOCK_SCOPE,
      from: "2025-01-01",
      to: "2025-12-31",
    });
    expect(before.nodes).toHaveLength(0);
    expect(before.arcs).toHaveLength(0);
    // A window covering the first feature's research date returns at least it.
    const within = await client.lineage({
      scope: MOCK_SCOPE,
      from: "2026-01-01",
      to: "2026-01-06",
    });
    expect(within.nodes.length).toBeGreaterThan(0);
    // Every returned node's created date is within the requested bounds.
    for (const n of within.nodes) {
      const day = (n.dates.created ?? "").slice(0, 10);
      expect(day >= "2026-01-01" && day <= "2026-01-06").toBe(true);
    }
  });

  it("serves a BLOB-TRUE as-of subset for a past `t` (dashboard-timeline fast-follow)", async () => {
    const mock = new MockEngine();
    const client = clientOn(mock);
    // The full live-graph slice (no `t`) over the whole corpus.
    const live = await client.lineage({ scope: MOCK_SCOPE });
    // As of an early instant (just after the first feature's research+adr days,
    // 2026-01-05/06): only nodes that existed at T survive — strictly fewer than
    // the full corpus, mirroring the engine's `asof_graph_resolved` resolution.
    const tEarly = String(Date.parse("2026-01-06T23:59:59Z"));
    const asof = await client.lineage({ scope: MOCK_SCOPE, t: tEarly });
    expect(asof.nodes.length).toBeGreaterThan(0);
    expect(asof.nodes.length).toBeLessThan(live.nodes.length);
    // Every surviving node was created at/before T (blob-true existence at T).
    for (const n of asof.nodes) {
      expect(Date.parse(n.dates.created ?? "")).toBeLessThanOrEqual(Number(tEarly));
    }
    // Self-consistency holds under the as-of cut: every arc's endpoints survived.
    const ids = new Set(asof.nodes.map((n) => n.id));
    for (const a of asof.arcs) {
      expect(ids.has(a.src)).toBe(true);
      expect(ids.has(a.dst)).toBe(true);
    }
  });

  it("a missing scope is a tiered 400, like the live route", async () => {
    const mock = new MockEngine();
    // `lineage` requires a scope; the route 400s an unknown/non-vault scope.
    await expect(clientOn(mock).lineage({ scope: "wt-unknown" })).rejects.toThrow();
  });
});
