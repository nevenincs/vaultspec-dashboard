// Pure-derive contract for the two NEW health panels (activity-rail-realignment
// S09/S10). Wire-free unit tests of the projections that turn the interpreted
// status rollup / core view into honest panel rows — the ADR's "render served
// truth including the degraded and unreachable states". The presentational
// components are thin over these; the live-wire proof lives in the online suite.

import { describe, expect, it } from "vitest";

import type {
  CoreStatusView,
  RagStatusView,
  StatusRollupView,
} from "../../stores/server/queries";
import { deriveBackendHealthRows } from "./BackendHealthPanel";
import { deriveVaultHealthView } from "./VaultHealthPanel";

function rag(patch: Partial<RagStatusView> = {}): RagStatusView {
  return {
    loading: false,
    errored: false,
    degraded: false,
    running: true,
    ready: true,
    presentation: { key: "operations:searchMaintenance.states.started" },
    ...patch,
  };
}

function core(patch: Partial<CoreStatusView> = {}): CoreStatusView {
  return { loading: false, errored: false, reachable: true, ...patch };
}

function rollup(patch: Partial<StatusRollupView> = {}): StatusRollupView {
  return {
    engineUnreachable: false,
    degradations: [],
    git: {
      loading: false,
      errored: false,
      degraded: false,
      dirty: false,
      retry: () => {},
    },
    core: core(),
    rag: rag(),
    ...patch,
  };
}

describe("deriveBackendHealthRows", () => {
  it("reports every plane available when the wire is healthy", () => {
    const rows = deriveBackendHealthRows(rollup());
    expect(rows.map((r) => `${r.key}:${r.tone}`)).toEqual([
      "application:ok",
      "projectTools:ok",
      "documents:ok",
      "links:ok",
      "history:ok",
      "search:ok",
    ]);
    expect(rows.map((r) => r.label.key)).toEqual([
      "common:systemStatus.labels.application",
      "common:systemStatus.labels.projectTools",
      "common:systemStatus.labels.documents",
      "common:systemStatus.labels.links",
      "common:systemStatus.labels.history",
      "common:systemStatus.labels.search",
    ]);
  });

  it("marks every plane unavailable when the engine is unreachable", () => {
    const rows = deriveBackendHealthRows(rollup({ engineUnreachable: true }));
    expect(rows.every((r) => r.tone === "down")).toBe(true);
    expect(rows.find((r) => r.key === "application")?.status.key).toBe(
      "common:systemStatus.states.unavailable",
    );
  });

  it("marks a served-degraded tier unavailable, leaving siblings available", () => {
    const rows = deriveBackendHealthRows(rollup({ degradations: ["structural"] }));
    expect(rows.find((r) => r.key === "documents")?.tone).toBe("down");
    expect(rows.find((r) => r.key === "links")?.tone).toBe("ok");
  });

  it("carries the served rag reason on a down semantic tier", () => {
    const rows = deriveBackendHealthRows(
      rollup({ rag: rag({ degraded: true, running: false, reason: "model loading" }) }),
    );
    const semantic = rows.find((r) => r.key === "search");
    expect(semantic?.tone).toBe("down");
    expect(semantic?.status.key).toBe("common:systemStatus.states.unavailable");
    expect(JSON.stringify(semantic)).not.toContain("model loading");
  });
});

describe("deriveVaultHealthView", () => {
  it("reads an unreachable core as down", () => {
    expect(deriveVaultHealthView(core({ reachable: false }))).toEqual({
      tone: "down",
      word: { key: "common:vaultHealth.unreachable" },
    });
    expect(deriveVaultHealthView(core({ errored: true, reachable: false }))).toEqual({
      tone: "down",
      word: { key: "common:vaultHealth.unreachable" },
    });
  });

  it("reads an in-flight snapshot as checking", () => {
    expect(deriveVaultHealthView(core({ loading: true, reachable: false }))).toEqual({
      tone: "unknown",
      word: { key: "common:vaultHealth.checking" },
    });
  });

  it("maps a healthy served word to ok and fails an unhealthy word closed to attention", () => {
    expect(deriveVaultHealthView(core({ vaultHealth: "healthy" }))).toEqual({
      tone: "ok",
      word: { key: "common:vaultHealth.healthy" },
    });
    expect(deriveVaultHealthView(core({ vaultHealth: "warnings" }))).toEqual({
      tone: "attention",
      word: { key: "common:vaultHealth.attention" },
    });
  });

  it("states a reachable core with no served word honestly, inventing no verdict", () => {
    expect(deriveVaultHealthView(core())).toEqual({
      tone: "ok",
      word: { key: "common:vaultHealth.healthy" },
    });
  });
});
