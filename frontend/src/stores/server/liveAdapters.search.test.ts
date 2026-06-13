// Regression (backend-hardening campaign, finding wire-03): adaptSearch must
// derive a hit's click-through node_id only along the §2 / M-B1 node-id
// grammar. The engine's `node_id` annotation wins; absent it, a CODE hit
// derives `code:{repo-relative path}` (never a `doc:` id that loses the path
// and mislabels the kind), a vault hit derives `doc:{stem}`, and an
// underivable hit is null — never a guess (M-C4 falsifier).

import { describe, expect, it } from "vitest";

import { adaptSearch, deriveSearchNodeId } from "./liveAdapters";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: true },
};

const envelope = (results: unknown[]) => ({
  envelope: { ok: true, data: { results } },
  tiers: TIERS,
});

describe("adaptSearch node_id grammar (§2 / M-B1)", () => {
  it("derives a resolvable code: id for a code hit, never a doc: id", () => {
    const { results } = adaptSearch(
      envelope([
        { path: "src/auth-flow/mod.rs", source: "code", score: 0.91, text: "fn ..." },
      ]),
    ) as { results: { node_id: string | null }[] };
    expect(results[0].node_id).toBe("code:src/auth-flow/mod.rs");
    expect(results[0].node_id?.startsWith("doc:")).toBe(false);
  });

  it("derives doc:{stem} for a vault hit", () => {
    const { results } = adaptSearch(
      envelope([{ stem: "2026-06-12-foo-adr", source: "vault", score: 0.8 }]),
    ) as { results: { node_id: string | null }[] };
    expect(results[0].node_id).toBe("doc:2026-06-12-foo-adr");
  });

  it("honours an explicit engine node_id annotation over any derivation", () => {
    expect(
      deriveSearchNodeId({ node_id: "code:src/x/mod.rs#auth", path: "src/x/mod.rs" }),
    ).toBe("code:src/x/mod.rs#auth");
  });

  it("returns null when no honest id can be formed", () => {
    expect(deriveSearchNodeId({ source: "code", score: 0.5 })).toBeNull();
  });
});
