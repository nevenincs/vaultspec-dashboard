import { describe, expect, it } from "vitest";

import { TIER_ORDER, isTierInapplicable } from "./TierDial";

describe("TierDial", () => {
  it("keeps the fixed product-wide tier order", () => {
    expect(TIER_ORDER.map((t) => t.tier)).toEqual([
      "declared",
      "structural",
      "temporal",
      "semantic",
    ]);
  });

  it("renders semantic inapplicable in time-travel only (G4.b)", () => {
    expect(isTierInapplicable("semantic", true)).toBe(true);
    expect(isTierInapplicable("semantic", false)).toBe(false);
    expect(isTierInapplicable("declared", true)).toBe(false);
  });
});
