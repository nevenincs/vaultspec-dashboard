// The rail-footer approvals projection and the shared vault-health tone
// classifier. Pins the tone/count mapping — ok / attention / down / unknown —
// over the interpreted status inputs, so the surviving chip can only render
// served truth (advanced-service-console ADR D3).

import { describe, expect, it } from "vitest";

import {
  deriveApprovalsStatusView,
  deriveVaultHealthTone,
  type ApprovalsStatusInputs,
} from "./frameworkStatus";

/** A settled, empty queue; each case overrides just the field under test. */
function settled(): ApprovalsStatusInputs {
  return {
    loading: false,
    storeUnavailable: false,
    degraded: false,
    queued: 0,
    truncated: false,
  };
}

describe("deriveVaultHealthTone", () => {
  it("is down when core is unreachable", () => {
    expect(
      deriveVaultHealthTone({ loading: false, errored: false, reachable: false }),
    ).toBe("down");
  });

  it("is down when the status query errored", () => {
    expect(
      deriveVaultHealthTone({ loading: false, errored: true, reachable: false }),
    ).toBe("down");
  });

  it("is unknown while core is still loading with no reachability", () => {
    expect(
      deriveVaultHealthTone({ loading: true, errored: false, reachable: false }),
    ).toBe("unknown");
  });

  it("is attention on a served health word other than healthy/ok/green", () => {
    expect(
      deriveVaultHealthTone({
        loading: false,
        errored: false,
        reachable: true,
        vaultHealth: "degraded",
      }),
    ).toBe("attention");
  });

  it("stays ok for the healthy, ok, and green words and when no word is served", () => {
    expect(
      deriveVaultHealthTone({
        loading: false,
        errored: false,
        reachable: true,
        vaultHealth: "OK",
      }),
    ).toBe("ok");
    // "green" is the engine's CANONICAL healthy word (the live adapter's
    // vault-green rollup) — every surface classifying vault health must agree.
    expect(
      deriveVaultHealthTone({
        loading: false,
        errored: false,
        reachable: true,
        vaultHealth: "green",
      }),
    ).toBe("ok");
    expect(
      deriveVaultHealthTone({ loading: false, errored: false, reachable: true }),
    ).toBe("ok");
  });
});

describe("deriveApprovalsStatusView", () => {
  it("is ok with no count when the queue is settled and empty", () => {
    expect(deriveApprovalsStatusView(settled())).toEqual({ tone: "ok" });
  });

  it("is down when the authoring store is unavailable", () => {
    const view = deriveApprovalsStatusView({
      ...settled(),
      storeUnavailable: true,
      queued: 3,
    });
    expect(view.tone).toBe("down");
    expect(view.count).toBeUndefined();
  });

  it("is unknown while the queue is loading", () => {
    expect(deriveApprovalsStatusView({ ...settled(), loading: true }).tone).toBe(
      "unknown",
    );
  });

  it("is attention with the served count when items are pending", () => {
    const view = deriveApprovalsStatusView({ ...settled(), queued: 4 });
    expect(view.tone).toBe("attention");
    expect(view.count).toBe(4);
  });

  it("omits the count when the served queue is truncated", () => {
    const view = deriveApprovalsStatusView({
      ...settled(),
      queued: 50,
      truncated: true,
    });
    expect(view.tone).toBe("attention");
    expect(view.count).toBeUndefined();
  });

  it("is attention when the queue is degraded even with nothing pending", () => {
    expect(deriveApprovalsStatusView({ ...settled(), degraded: true }).tone).toBe(
      "attention",
    );
  });
});
