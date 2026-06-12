import { describe, expect, it } from "vitest";

import { hiddenCountLabel } from "./FilterBar";
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
    expect(isTierInapplicable("semantic", { kind: "time-travel", at: 1 })).toBe(true);
    expect(isTierInapplicable("semantic", { kind: "live" })).toBe(false);
    expect(isTierInapplicable("declared", { kind: "time-travel", at: 1 })).toBe(false);
  });
});

describe("hiddenCountLabel (the cost chip)", () => {
  it("names the filter's cost and hides at zero", () => {
    expect(hiddenCountLabel(0, 0)).toBeNull();
    expect(hiddenCountLabel(142, 0)).toBe("142 nodes hidden");
    expect(hiddenCountLabel(3, 7)).toBe("3 nodes · 7 edges hidden");
  });
});
