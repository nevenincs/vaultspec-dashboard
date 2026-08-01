// The framework-status cluster projection. Pins
// the tone/count mapping per plane — ok / attention / down / unknown — over the
// interpreted status inputs, so a chip can only render served health truth.

import { describe, expect, it } from "vitest";

import {
  deriveFrameworkStatusView,
  type FrameworkStatusInputs,
} from "./frameworkStatus";

/** A fully-healthy input; each case overrides just the plane under test. */
function healthy(): FrameworkStatusInputs {
  return {
    core: { loading: false, errored: false, reachable: true, vaultHealth: "healthy" },
    rag: { loading: false, errored: false, degraded: false },
    pending: {
      loading: false,
      storeUnavailable: false,
      degraded: false,
      queued: 0,
      truncated: false,
    },
  };
}

describe("deriveFrameworkStatusView", () => {
  it("maps every plane to ok when the framework is healthy", () => {
    const view = deriveFrameworkStatusView(healthy());
    expect(view).toEqual({
      "search-service": { tone: "ok" },
      pending: { tone: "ok" },
      "vault-health": { tone: "ok" },
    });
  });
});

describe("vault-health chip", () => {
  it("is down when core is unreachable", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      core: { loading: false, errored: false, reachable: false },
    });
    expect(view["vault-health"].tone).toBe("down");
  });

  it("is down when the status query errored", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      core: { loading: false, errored: true, reachable: false },
    });
    expect(view["vault-health"].tone).toBe("down");
  });

  it("is unknown while core is still loading with no reachability", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      core: { loading: true, errored: false, reachable: false },
    });
    expect(view["vault-health"].tone).toBe("unknown");
  });

  it("is attention on a served health word other than healthy/ok", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      core: {
        loading: false,
        errored: false,
        reachable: true,
        vaultHealth: "degraded",
      },
    });
    expect(view["vault-health"].tone).toBe("attention");
  });

  it("stays ok for the healthy, ok, and green words and when no word is served", () => {
    const ok = deriveFrameworkStatusView({
      ...healthy(),
      core: { loading: false, errored: false, reachable: true, vaultHealth: "OK" },
    });
    expect(ok["vault-health"].tone).toBe("ok");
    // "green" is the engine's CANONICAL healthy word (the live adapter's
    // vault-green rollup) — the ambient chip must never contradict the panel
    // it opens on live data.
    const green = deriveFrameworkStatusView({
      ...healthy(),
      core: { loading: false, errored: false, reachable: true, vaultHealth: "green" },
    });
    expect(green["vault-health"].tone).toBe("ok");
    const none = deriveFrameworkStatusView({
      ...healthy(),
      core: { loading: false, errored: false, reachable: true },
    });
    expect(none["vault-health"].tone).toBe("ok");
  });
});

describe("search-service chip", () => {
  it("is down when the semantic tier is degraded", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      rag: { loading: false, errored: false, degraded: true },
    });
    expect(view["search-service"].tone).toBe("down");
  });

  it("is down when the status query errored", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      rag: { loading: false, errored: true, degraded: false },
    });
    expect(view["search-service"].tone).toBe("down");
  });

  it("is unknown while rag status is loading", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      rag: { loading: true, errored: false, degraded: false },
    });
    expect(view["search-service"].tone).toBe("unknown");
  });
});

describe("pending-changes chip", () => {
  it("is down when the authoring store is unavailable", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      pending: {
        loading: false,
        storeUnavailable: true,
        degraded: false,
        queued: 3,
        truncated: false,
      },
    });
    expect(view.pending.tone).toBe("down");
    expect(view.pending.count).toBeUndefined();
  });

  it("is unknown while the queue is loading", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      pending: {
        loading: true,
        storeUnavailable: false,
        degraded: false,
        queued: 0,
        truncated: false,
      },
    });
    expect(view.pending.tone).toBe("unknown");
  });

  it("is attention with the served count when items are pending", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      pending: {
        loading: false,
        storeUnavailable: false,
        degraded: false,
        queued: 4,
        truncated: false,
      },
    });
    expect(view.pending.tone).toBe("attention");
    expect(view.pending.count).toBe(4);
  });

  it("omits the count when the served queue is truncated", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      pending: {
        loading: false,
        storeUnavailable: false,
        degraded: false,
        queued: 50,
        truncated: true,
      },
    });
    expect(view.pending.tone).toBe("attention");
    expect(view.pending.count).toBeUndefined();
  });

  it("is attention when the queue is degraded even with nothing pending", () => {
    const view = deriveFrameworkStatusView({
      ...healthy(),
      pending: {
        loading: false,
        storeUnavailable: false,
        degraded: true,
        queued: 0,
        truncated: false,
      },
    });
    expect(view.pending.tone).toBe("attention");
  });
});
