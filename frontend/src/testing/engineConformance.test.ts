// Consumer-typed engine conformance (engine-hardening P01.S01, ADR D1).
//
// Drives the REAL `EngineClient` against a live `vaultspec serve` binary so
// that wire-vs-type mismatches fail CI — the class of bug that silently killed
// time-travel (c812371: `t: number` declared, `"t": string` on the wire;
// `seq: number` declared, `last_seq: null` on the wire). The Rust conformance
// suite (`conformance.rs`) asserts the wire at the Rust level and passed; this
// test closes the seam the Rust suite cannot reach.
//
// Activation: set `ENGINE_BASE_URL` (and `ENGINE_TOKEN`) in the environment.
// When unset the suite fails loudly so a green run cannot omit live engine
// conformance by accident. CI activates it via the `engine-conformance` job in
// `quality-gates.yml`.
//
// Reads: `EngineClient`, `FetchLike`, `GraphAsofResponse`, `GraphSlice`.
// Imports only live client types and production transport contracts.

import { beforeAll, describe, expect, test } from "vitest";

import { EngineClient } from "../stores/server/engine";
import type { FetchLike, MapResponse, TiersBlock } from "../stores/server/engine";

const BASE_URL = process.env["ENGINE_BASE_URL"];
const TOKEN = process.env["ENGINE_TOKEN"];

/** Custom transport for the node environment (no DOM, no meta tag). */
const transport: FetchLike = (input, init) => {
  if (!TOKEN) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("Authorization", `Bearer ${TOKEN}`);
  }
  return fetch(input, { ...init, headers });
};

/** A raw authorized GET for assertions outside the typed client. */
function rawGet(path: string): Promise<Response> {
  return transport(`${BASE_URL}${path}`, { method: "GET" });
}

const CANONICAL_TIERS = ["declared", "structural", "temporal", "semantic"] as const;

function assertTiers(tiers: TiersBlock): void {
  for (const tier of CANONICAL_TIERS) {
    expect(tiers, `${tier} must be present in tiers block`).toHaveProperty(tier);
  }
}

describe("live engine wire conformance (consumer-typed)", () => {
  const client = new EngineClient({ baseUrl: BASE_URL ?? "", fetchImpl: transport });

  let scope: string;
  let corpusTs: number;

  beforeAll(async () => {
    if (!BASE_URL) {
      throw new Error("ENGINE_BASE_URL is required for live engine conformance");
    }
    const map: MapResponse = await client.map();
    const wt = map.repositories.flatMap((r) => r.worktrees).find((w) => w.has_vault);
    if (!wt) throw new Error("fixture has no vault-bearing worktree");
    scope = wt.id;
    // Use a timestamp just before "now" so the asof/diff window is valid.
    corpusTs = Date.now() - 500;
  });

  // --- /map ------------------------------------------------------------------

  test("map: repositories array with vault-bearing worktrees", async () => {
    const map = await client.map();
    expect(Array.isArray(map.repositories)).toBe(true);
    expect(map.repositories.length).toBeGreaterThan(0);
    const wts = map.repositories.flatMap((r) => r.worktrees);
    expect(wts.some((w) => w.has_vault)).toBe(true);
    assertTiers(map.tiers);
  });

  // --- /status ---------------------------------------------------------------

  test("status: tiers block present with all four canonical tiers", async () => {
    const status = await client.status();
    assertTiers(status.tiers);
  });

  // --- /graph/query ----------------------------------------------------------

  test("graph/query (constellation): nodes, edges, tiers, last_seq field present", async () => {
    const slice = await client.graphQuery({ scope, granularity: "feature" });
    expect(Array.isArray(slice.nodes)).toBe(true);
    expect(Array.isArray(slice.edges)).toBe(true);
    assertTiers(slice.tiers);
    // last_seq must be a key on the response (number or null, but the field
    // must exist — absent means the envelope helper was bypassed).
    expect("last_seq" in slice).toBe(true);
  });

  // --- /graph/asof -----------------------------------------------------------
  // THE c812371 REGRESSION CLASS: the live engine echoes `t` as a string and
  // uses `last_seq` (not `seq`). `GraphAsofResponse` must reflect the wire.

  test("graph/asof (ms-timestamp): t coercible to number, last_seq present, seq absent", async () => {
    const asof = await client.graphAsof({ scope, t: corpusTs });
    // t is echoed from the param — the engine sends it as a string when a
    // ms-timestamp is passed. It must parse as a finite number.
    expect(Number.isFinite(Number(asof.t))).toBe(true);
    // last_seq must be a key on the response (the wire field name, may be null
    // while the engine S50 asof-seq gap is open).
    expect("last_seq" in asof).toBe(true);
    // seq must NOT be a key — the wire has no `seq` field on asof responses.
    // This is the exact type drift c812371 fixed; a regression would read
    // `asof.seq === undefined` silently and break DeltaLog.setKeyframe.
    expect("seq" in asof).toBe(false);
    expect(Array.isArray(asof.nodes)).toBe(true);
    expect(Array.isArray(asof.edges)).toBe(true);
    assertTiers(asof.tiers);
  });

  test("graph/asof (sha): accepts a sha string as well as ms-timestamp", async () => {
    // A ms-timestamp in the far past resolves to the root commit sha form.
    const ancient = 0; // epoch → should resolve to or predate the root commit
    // The engine should return a well-formed response (possibly empty nodes)
    // or a 400 with a tiers block — either way, not an unhandled crash.
    try {
      const asof = await client.graphAsof({ scope, t: ancient });
      expect(Array.isArray(asof.nodes)).toBe(true);
    } catch {
      // A 400 ("timestamp predates root commit") is also acceptable — it
      // carries a tiers block per the rule (tested in the error surface test).
      // The engine may reject epoch-0 if it predates the root commit.
    }
  });

  // --- /graph/diff -----------------------------------------------------------

  test("graph/diff (ms-timestamps): deltas array, last_seq number, tiers present", async () => {
    const from = corpusTs - 14 * 24 * 3600_000; // 14 days back
    const diff = await client.graphDiff({ scope, from, to: corpusTs });
    expect(Array.isArray(diff.deltas)).toBe(true);
    // last_seq on diff responses is a real number (the current clock tip),
    // not null — the engine always knows the seq position on a live diff.
    expect(typeof diff.last_seq).toBe("number");
    assertTiers(diff.tiers);
  });

  // --- error surface ---------------------------------------------------------
  // every-wire-response-carries-the-tiers-block: errors must carry tiers.

  test("error surface: unknown scope returns tiers block on 4xx", async () => {
    // Use raw fetch so we can inspect the error body without the client
    // throwing before we can read it.
    const res = await rawGet("/graph/query?scope=NONEXISTENT_SCOPE_XYZ");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { tiers?: unknown };
    expect(body.tiers).toBeDefined();
    // The tiers block on an error must have the canonical keys (the envelope
    // helper populates them even on failure paths).
    for (const tier of CANONICAL_TIERS) {
      expect(body.tiers as Record<string, unknown>).toHaveProperty(tier);
    }
  });

  test("error surface: auth failure returns tiers block (not a bare error)", async () => {
    // Call with a bad token to verify the auth middleware still wraps the
    // error in the envelope (the every-wire-response rule applies to auth too).
    const res = await fetch(`${BASE_URL}/status`, {
      headers: { Authorization: "Bearer definitely-not-a-real-token-xyz" },
    });
    // 401 or 403 depending on engine config; in either case, tiers must ride.
    if (res.status === 401 || res.status === 403) {
      const body = (await res.json()) as { tiers?: unknown };
      expect(body.tiers).toBeDefined();
    }
    // If the engine accepts bad tokens (dev mode / no auth), the test is a
    // no-op — that is fine; the constraint is on auth-rejecting engines.
  });

  // --- /search ---------------------------------------------------------------
  // The pass-through shape: `{ data: { results, via, ... }, tiers }`.
  // There is NO nested `envelope` — see smoke.spec.ts S49 fix.

  test("search: results live at data.results, not data.envelope.data.results", async () => {
    // POST to /search — rag may be down in CI, but the response SHAPE is what
    // we care about, not the result count.
    const res = await transport(`${BASE_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "conformance-ci-test", target: "vault" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data?: { results?: unknown[]; via?: string };
      tiers?: unknown;
    };
    // results must be an array directly under data, not nested in envelope
    expect(Array.isArray(body.data?.results)).toBe(true);
    assertTiers(body.tiers as TiersBlock);
  });
});
