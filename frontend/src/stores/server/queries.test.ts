import { describe, expect, it } from "vitest";

import { StreamLostError } from "../../platform/policy/failurePolicy";
import { assertBounded, syntheticGraphDeltas } from "../../testing/adverse";
import { MockEngine } from "../../testing/mockEngine";
import { EngineClient, EngineError } from "./engine";
import type { DiscoverResponse, EngineStatus, TiersBlock } from "./engine";
import { adaptStatus } from "./liveAdapters";
import type { StreamChunk } from "./queries";
import {
  STREAM_RETENTION,
  deriveDiscoverView,
  deriveGitStatusView,
  deriveGraphSliceAvailability,
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
  it("keys graph slices by the (scope, filter, as-of, granularity) tuple", () => {
    const a = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const b = engineKeys.graph("wt-1", { tiers: { semantic: false } }, 123);
    const c = engineKeys.graph("wt-2", { tiers: { semantic: false } }, 123);
    const d = engineKeys.graph("wt-1", { tiers: { semantic: false } });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    // Defaults: as-of "live", granularity "document" (the engine's default).
    expect(d[d.length - 2]).toBe("live");
    expect(d[d.length - 1]).toBe("document");
    // Granularity is part of the cache identity: the constellation (feature)
    // and a document slice never collide in cache.
    const feature = engineKeys.graph("wt-1", undefined, undefined, "feature");
    const document = engineKeys.graph("wt-1", undefined, undefined, "document");
    expect(feature).not.toEqual(document);
    expect(feature[feature.length - 1]).toBe("feature");
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
