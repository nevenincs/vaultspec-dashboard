// Adversarial wire-payload hardening (stores trust boundary): the live adapters must
// defend against hostile / oversized / prototype-polluting engine responses — the
// client never trusts the wire is bounded or well-formed (apps hardening audit: G2
// client payload ceiling, G3 prototype-pollution guard, G5 per-frame SSE byte
// ceiling; the G4 hostile fixtures). These feed deliberately-malformed payloads
// through the real adapters + the SSE frame parser.

import { describe, expect, it } from "vitest";

import {
  MAX_CLIENT_GRAPH_NODES,
  adaptGraphSlice,
  adaptSettings,
} from "../server/liveAdapters";
import { MAX_SSE_FRAME_BYTES, parseSseFrames } from "../server/queries";

describe("adaptGraphSlice — client payload ceiling (G2: oversized-payload DoS defense)", () => {
  it("clamps an oversized node payload to the ceiling + reports honest truncation", () => {
    const nodes = Array.from({ length: MAX_CLIENT_GRAPH_NODES + 5 }, (_, i) => ({
      id: `n${i}`,
      doc_type: "adr",
    }));
    const slice = adaptGraphSlice({ nodes, edges: [] });
    expect(slice.nodes.length).toBe(MAX_CLIENT_GRAPH_NODES);
    expect(slice.truncated).toEqual({
      total_nodes: MAX_CLIENT_GRAPH_NODES + 5,
      returned_nodes: MAX_CLIENT_GRAPH_NODES,
      reason: "client node ceiling",
    });
  });

  it("drops edges dangling to nodes sliced away by the node cap (self-consistent slice)", () => {
    // The cap keeps the first MAX nodes; an edge to a node BEYOND the cap would
    // dangle to an absent node (a three.js NaN/glitch trigger) unless the adapter
    // re-filters edges against the FINAL node set, not just the excluded set.
    const nodes = Array.from({ length: MAX_CLIENT_GRAPH_NODES + 5 }, (_, i) => ({
      id: `n${i}`,
      doc_type: "adr",
    }));
    const sliced = `n${MAX_CLIENT_GRAPH_NODES + 1}`; // beyond the ceiling
    const edges = [
      { id: "e-kept", src: "n0", dst: "n1" },
      { id: "e-dangling", src: "n0", dst: sliced },
    ];
    const slice = adaptGraphSlice({ nodes, edges });
    const keptIds = new Set(slice.nodes.map((n) => n.id));
    expect(keptIds.has(sliced)).toBe(false); // the endpoint was capped away
    // Every served edge connects two surviving nodes — the dangler is dropped.
    for (const e of slice.edges) {
      expect(keptIds.has(e.src)).toBe(true);
      expect(keptIds.has(e.dst)).toBe(true);
    }
    expect(slice.edges.some((e) => e.id === "e-dangling")).toBe(false);
    expect(slice.edges.some((e) => e.id === "e-kept")).toBe(true);
  });

  it("does not truncate a normal bounded payload", () => {
    const slice = adaptGraphSlice({
      nodes: [{ id: "a", doc_type: "adr" }],
      edges: [],
    });
    expect(slice.truncated).toBeUndefined();
    expect(slice.nodes.length).toBe(1);
  });
});

describe("adaptSettings — prototype-pollution guard (G3: hostile wire keys)", () => {
  it("drops __proto__/constructor keys without polluting the prototype", () => {
    // JSON.parse makes `__proto__` a real OWN enumerable key (a literal would not),
    // mirroring a hostile wire response decoded by the client transport.
    const body = JSON.parse(
      '{"global":{"theme":"dark","__proto__":"x","constructor":"y"},' +
        '"scoped":{"__proto__":{"evil":"z"},"scope-a":{"lens":"design"}}}',
    );
    const settings = adaptSettings(body);

    // No prototype pollution from the hostile keys.
    expect(({} as Record<string, unknown>)["evil"]).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>)["evil"]).toBeUndefined();

    // Safe keys preserved; unsafe keys dropped (not own properties).
    expect(settings.global.theme).toBe("dark");
    expect(Object.prototype.hasOwnProperty.call(settings.global, "__proto__")).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(settings.global, "constructor")).toBe(
      false,
    );
    expect(settings.scoped["scope-a"]).toEqual({ lens: "design" });
    expect(Object.prototype.hasOwnProperty.call(settings.scoped, "__proto__")).toBe(
      false,
    );
  });
});

describe("parseSseFrames — per-frame byte ceiling (G5: runaway SSE frame)", () => {
  it("drops a frame whose data exceeds the byte ceiling, never parsing it", () => {
    const huge = "x".repeat(MAX_SSE_FRAME_BYTES + 1);
    const { frames } = parseSseFrames(`event: delta\ndata: ${huge}\n\n`);
    expect(frames).toEqual([]);
  });

  it("parses a normal small frame within the ceiling", () => {
    const { frames } = parseSseFrames('event: delta\ndata: {"x":1}\n\n');
    expect(frames).toEqual([{ channel: "delta", data: { x: 1 } }]);
  });

  it("measures the completed-frame ceiling in UTF-8 bytes, not UTF-16 units", () => {
    const huge = "😀".repeat(Math.floor(MAX_SSE_FRAME_BYTES / 4) + 1);
    const { frames } = parseSseFrames(`event: delta\ndata: ${huge}\n\n`);
    expect(frames).toEqual([]);
  });
});
