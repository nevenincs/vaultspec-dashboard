// The component compatibility handshake read (dashboard-packaging D6, P02.S10):
// the ONE tiers reader folds the engine-served floor verdict into degradation,
// so a below-floor vaultspec-core blocks the surfaces riding the declared tier
// and an absent rag greys semantic panels — without any surface reading the raw
// block or the client re-deriving a verdict the engine already served.

import { describe, expect, test } from "vitest";

import { readTierAvailability, type TiersBlock } from "./engine";

describe("readTierAvailability with the component handshake", () => {
  test("a below-floor core degrades the declared tier even when nominally available", () => {
    const tiers: TiersBlock = {
      declared: {
        available: true,
        component: {
          name: "vaultspec-core",
          floor: "0.1.36",
          version: "0.1.34",
          meets_floor: false,
        },
      },
      semantic: { available: true },
    };
    const availability = readTierAvailability(tiers, ["declared"]);
    expect(availability.degraded).toBe(true);
    expect(availability.degradedTiers).toEqual(["declared"]);
    expect(availability.reasons.declared).toContain("vaultspec-core 0.1.34");
    expect(availability.reasons.declared).toContain("0.1.36");
  });

  test("a floor-meeting core leaves an available tier healthy", () => {
    const tiers: TiersBlock = {
      declared: {
        available: true,
        component: {
          name: "vaultspec-core",
          floor: "0.1.36",
          version: "0.1.36",
          meets_floor: true,
        },
      },
    };
    expect(readTierAvailability(tiers, ["declared"]).degraded).toBe(false);
  });

  test("an unknown verdict (null) never degrades on its own", () => {
    // meets_floor null = version unprobeable; the tier's own availability is
    // the only truth then — the client must not guess degradation.
    const tiers: TiersBlock = {
      semantic: {
        available: true,
        component: {
          name: "vaultspec-rag",
          floor: "0.2.28",
          version: null,
          meets_floor: null,
        },
      },
    };
    expect(readTierAvailability(tiers, ["semantic"]).degraded).toBe(false);
  });

  test("the engine-served reason wins over the client-worded floor label", () => {
    const tiers: TiersBlock = {
      declared: {
        available: false,
        reason: "core exited unsuccessfully",
        component: {
          name: "vaultspec-core",
          floor: "0.1.36",
          version: "0.1.30",
          meets_floor: false,
        },
      },
    };
    const availability = readTierAvailability(tiers, ["declared"]);
    expect(availability.degraded).toBe(true);
    expect(availability.reasons.declared).toBe("core exited unsuccessfully");
  });

  test("a component-less block behaves exactly as before", () => {
    const tiers: TiersBlock = {
      declared: { available: true },
      semantic: { available: false, reason: "rag service not installed" },
    };
    const availability = readTierAvailability(tiers, ["declared", "semantic"]);
    expect(availability.degradedTiers).toEqual(["semantic"]);
    expect(availability.reasons.semantic).toBe("rag service not installed");
  });
});
