// Regression (backend-hardening campaign, finding degradation-honesty-01): the
// transport error path must preserve the per-tier degradation block the engine
// attaches to its error envelope (contract §2; the
// every-wire-response-carries-the-tiers-block rule). A backend-DOWN condition
// must reach the client as degradation truth the GUI can render — never a
// tiers-less bare error, which would make the GUI lie about availability.
//
// Verified against the REAL `vaultspec serve` engine: no failure injection, no
// mock. The engine genuinely produces error envelopes (unknown scope → 4xx) and
// success envelopes that both carry the tiers block; the client must surface
// that block intact on BOTH paths. The rag-502 simulation the old mock forced is
// covered by the engine's own Rust conformance suite — it cannot be injected
// against a healthy live surface, and guessing degradation from a bare transport
// error is exactly what `degradation-is-read-from-tiers-not-guessed-from-errors`
// forbids.

import { describe, expect, it } from "vitest";

import {
  createLiveClient,
  liveDegradedScope,
  liveFetch,
} from "../../testing/liveClient";
import { CANONICAL_TIERS, EngineError, type TiersBlock } from "./engine";

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
  it("preserves the per-tier block on the EngineError thrown for an unknown scope", async () => {
    const client = createLiveClient();
    const thrown = await client
      .graphQuery({ scope: "NONEXISTENT_SCOPE_XYZ", granularity: "feature" })
      .then(
        () => {
          throw new Error("graphQuery resolved; expected the unknown scope to reject");
        },
        (err: unknown) => err,
      );

    expect(thrown).toBeInstanceOf(EngineError);
    const tiers = tiersOf(thrown);
    expect(
      tiers,
      "client dropped the tiers block from the error envelope",
    ).toBeDefined();
    // The block carries every canonical tier even on the failure path.
    for (const tier of CANONICAL_TIERS) {
      expect(tiers).toHaveProperty(tier);
    }
  });

  it("the raw error envelope on the wire carries tiers — the client's source of truth", async () => {
    // Confirm the wire premise directly: a dropped block would indict the
    // client, not the engine.
    const res = await liveFetch("/graph/query?scope=NONEXISTENT_SCOPE_XYZ");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as {
      tiers?: Record<string, { available: boolean }>;
    };
    expect(body.tiers).toBeDefined();
    for (const tier of CANONICAL_TIERS) {
      expect(body.tiers).toHaveProperty(tier);
    }
  });

  it("a success envelope reports per-tier availability read from the tiers block", async () => {
    // Degradation is READ from the tiers block, never guessed: every canonical
    // tier reports a boolean availability the GUI renders as a designed state.
    const status = await createLiveClient().status();
    expect(status.tiers).toBeTypeOf("object");
    for (const tier of CANONICAL_TIERS) {
      expect(status.tiers).toHaveProperty(tier);
      expect(typeof status.tiers[tier].available).toBe("boolean");
    }
  });

  it("a degraded scope (vault without a vaultspec workspace) loads the graph with the declared tier really down", async () => {
    // The degraded fixture worktree keeps `.vault/` but has no `.vaultspec/`, so
    // the declared tier (vaultspec-core) is GENUINELY down while structural reads
    // the corpus — a real degraded condition, no stubbed tiers block.
    const scope = await liveDegradedScope();
    const slice = await createLiveClient().graphQuery({
      scope,
      granularity: "feature",
    });
    // The graph still loads — degradation is NOT an error.
    expect(Array.isArray(slice.nodes)).toBe(true);
    // The declared tier is truthfully unavailable; structural stays up. The GUI
    // renders this as a designed degraded state, read from these flags.
    expect(slice.tiers.declared?.available).toBe(false);
    expect(slice.tiers.structural?.available).toBe(true);
  });
});
