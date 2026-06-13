// Adversarial — degradation honesty lens (contract §2; rule
// every-wire-response-carries-the-tiers-block).
//
// STATED CONTRACT (rule body + liveAdapters.ts header):
//   "clients render ABSENT tiers as designed degraded states, NEVER as up";
//   "the tiers block is the contract's truthfulness mechanism ... a response
//    without [a tier in] the block makes the GUI lie about availability."
//   adaptStatus's own comment: it forwards "the honest down state".
//
// THE DEFECT (adaptStatus, liveAdapters.ts §6):
//   `degradations` is derived as
//       Object.entries(tiers).filter(([,s]) => s.available === false).map(tier)
//   This ONLY sees tiers that are present-and-false. A tier whose key is
//   MISSING from the block is "neither down nor up" — yet the contract is
//   explicit that an ABSENT tier is a degraded state. The current derivation
//   silently omits it from `degradations`, so the rolled-up status presents a
//   partially-probed engine as fully healthy.
//
// `degradations` is a load-bearing summary: deriveInputs (matrix.ts) consumes
// it directly (`status.degradations.includes("date-mandate")`), and any rail/
// matrix surface that reads it as "the list of degraded tiers" inherits the
// lie. A live engine can legitimately omit a tier it could not probe; the
// contract's whole point is that absence ≠ available.
//
// These tests assert the CONTRACT-CORRECT behavior of adaptStatus. RED.

import { describe, expect, it } from "vitest";

import { adaptStatus } from "../server/liveAdapters";

// A live status rollup whose tiers block OMITS the semantic key entirely —
// e.g. the engine could not reach the rag backend to assert its state. The
// other three tiers report up; nothing is asserted about semantic.
const liveStatusMissingSemantic = {
  ok: true,
  scope: "Y:/repo",
  index: { nodes: 142, edges: 834 },
  backends: { core: { invocation: "vaultspec-core" } },
  tiers: {
    declared: { available: true },
    structural: { available: true },
    temporal: { available: true },
    // semantic: ABSENT — not asserted up, not asserted down.
  },
};

const CANONICAL_TIERS = ["declared", "structural", "temporal", "semantic"] as const;

describe("adaptStatus must treat an absent tier as degraded, not up (§2)", () => {
  it("lists a missing canonical tier in degradations rather than omitting it", () => {
    const status = adaptStatus(liveStatusMissingSemantic);
    // The contract: an absent tier is a designed degraded state. The honest
    // rolled-up status must NOT present a partially-probed engine as healthy.
    expect(
      status.degradations,
      "a tier absent from the block was dropped from degradations — the GUI " +
        "reads a fully-healthy status when the semantic backend was never asserted up",
    ).toContain("semantic");
  });

  it("never lets a consumer read an absent tier as available:true", () => {
    const status = adaptStatus(liveStatusMissingSemantic);
    // A consumer that asks "is each canonical tier available?" — the §2
    // rendering contract — must get a NON-true answer for the absent tier.
    // The current adapter forwards the partial block verbatim, so the absent
    // `semantic` reads as `undefined?.available` ≠ false: indistinguishable
    // from "up" to a `!== false` check, and absent from the degradations list
    // that would otherwise flag it.
    const available = (tier: string): boolean =>
      status.tiers[tier]?.available !== false && !status.degradations.includes(tier);
    const renderedAvailable = CANONICAL_TIERS.filter(available);
    expect(
      renderedAvailable,
      "the absent semantic tier renders as available to a §2 consumer — " +
        "absence was treated as up, the exact lie the contract forbids",
    ).not.toContain("semantic");
  });
});
