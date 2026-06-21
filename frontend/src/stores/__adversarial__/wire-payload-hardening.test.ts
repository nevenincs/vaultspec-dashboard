// Adversarial wire-payload hardening (stores trust boundary): the live adapters must
// defend against hostile / oversized / prototype-polluting engine responses — the
// client never trusts the wire is bounded or well-formed (apps hardening audit: G2
// client payload ceiling, G3 prototype-pollution guard; first of the G4 hostile
// fixtures). These feed deliberately-malformed payloads through the real adapters.

import { describe, expect, it } from "vitest";

import {
  MAX_CLIENT_GRAPH_NODES,
  adaptGraphSlice,
  adaptSettings,
} from "../server/liveAdapters";

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
