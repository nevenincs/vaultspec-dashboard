// The component compatibility handshake read (dashboard-packaging D6, P02.S10):
// the ONE tiers reader exposes the engine-served per-tier component handshake
// (floor, probed version, verdict) as advisory data for status surfaces. It is
// deliberately NOT folded into `degraded` (P02 review): a below-floor core
// still reads fine — the engine's own served eligibility blocks the authoring
// verbs it cannot honor, so the client never invents a whole-tier degradation.

import { describe, expect, test } from "vitest";

import { readTierAvailability, type TiersBlock } from "./engine";

describe("readTierAvailability with the component handshake", () => {
  test("a below-floor component is exposed but never degrades an available tier", () => {
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
    expect(availability.degraded).toBe(false);
    expect(availability.components?.declared).toMatchObject({
      name: "vaultspec-core",
      floor: "0.1.36",
      version: "0.1.34",
      meets_floor: false,
    });
  });

  test("component data rides along on a degraded tier with the engine reason intact", () => {
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
    expect(availability.components?.declared?.meets_floor).toBe(false);
  });

  test("the rag component's honestly-null version is preserved", () => {
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
    const availability = readTierAvailability(tiers, ["semantic"]);
    expect(availability.degraded).toBe(false);
    expect(availability.components?.semantic?.version).toBeNull();
  });

  test("a component-less block behaves exactly as before", () => {
    const tiers: TiersBlock = {
      declared: { available: true },
      semantic: { available: false, reason: "rag service not installed" },
    };
    const availability = readTierAvailability(tiers, ["declared", "semantic"]);
    expect(availability.degradedTiers).toEqual(["semantic"]);
    expect(availability.reasons.semantic).toBe("rag service not installed");
    expect(availability.components).toEqual({});
  });
});
