// Regression (backend-hardening campaign, finding degradation-honesty-01): the
// transport error path must preserve the per-tier degradation block the engine
// attaches to its error envelope (contract §2; the
// every-wire-response-carries-the-tiers-block rule). A backend-DOWN condition
// (e.g. a rag-down 502 on /search or /discover) must reach the client as
// degradation truth the GUI can render — never a tiers-less bare error, which
// would make the GUI lie about availability.

import { describe, expect, it } from "vitest";

import { MockEngine } from "../../testing/mockEngine";
import { EngineClient, type TiersBlock } from "./engine";

/** Read a tiers block off a thrown value, whatever channel carries it. */
function tiersOf(error: unknown): TiersBlock | undefined {
  if (error === null || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  const direct = e.tiers;
  if (direct && typeof direct === "object") return direct as TiersBlock;
  const body = e.body;
  if (body && typeof body === "object") {
    const nested = (body as Record<string, unknown>).tiers;
    if (nested && typeof nested === "object") return nested as TiersBlock;
  }
  return undefined;
}

describe("error envelopes carry the tiers block (§2)", () => {
  it("preserves the per-tier block when /search 502s because rag is down", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    const client = new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });

    // Confirm the wire premise: the 502 error envelope DOES carry tiers, so a
    // dropped block would indict the client, not the mock.
    const wire = await mock.fetchImpl("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "auth" }),
    });
    const wireBody = (await wire.clone().json()) as { ok: boolean; tiers: TiersBlock };
    expect(wire.status).toBe(502);
    expect(wireBody.tiers.semantic.available).toBe(false);

    const thrown = await client.search({ query: "auth" }).then(
      () => {
        throw new Error("search resolved; expected the down backend to surface");
      },
      (err: unknown) => err,
    );

    const tiers = tiersOf(thrown);
    expect(
      tiers,
      "client dropped the tiers block from the 502 error envelope",
    ).toBeDefined();
    expect(tiers?.semantic.available).toBe(false);
  });

  it("preserves the per-tier block when /discover 502s because rag is down", async () => {
    const mock = new MockEngine();
    mock.degrade("semantic", "rag service down");
    const client = new EngineClient({ baseUrl: "/api", fetchImpl: mock.fetchImpl });

    const node = mock.corpus.nodes.find((n) => n.kind !== "feature")!;
    const thrown = await client.discover(node.id).then(
      () => {
        throw new Error("discover resolved; expected the down backend to surface");
      },
      (err: unknown) => err,
    );

    expect(
      tiersOf(thrown),
      "client dropped the tiers block from the /discover 502 envelope",
    ).toBeDefined();
    expect(tiersOf(thrown)?.semantic.available).toBe(false);
  });
});
