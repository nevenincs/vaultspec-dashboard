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
      "engine:ok",
      "core:ok",
      "structural:ok",
      "declared:ok",
      "temporal:ok",
      "semantic:ok",
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "Engine",
      "Framework core",
      "Documents",
      "Links",
      "History",
      "Semantic search",
    ]);
  });

  it("marks every plane unavailable when the engine is unreachable", () => {
    const rows = deriveBackendHealthRows(rollup({ engineUnreachable: true }));
    expect(rows.every((r) => r.tone === "down")).toBe(true);
    expect(rows.find((r) => r.key === "engine")?.statusWord).toBe("Unreachable");
  });

  it("marks a served-degraded tier unavailable, leaving siblings available", () => {
    const rows = deriveBackendHealthRows(rollup({ degradations: ["structural"] }));
    expect(rows.find((r) => r.key === "structural")?.tone).toBe("down");
    expect(rows.find((r) => r.key === "declared")?.tone).toBe("ok");
  });

  it("carries the served rag reason on a down semantic tier", () => {
    const rows = deriveBackendHealthRows(
      rollup({ rag: rag({ degraded: true, running: false, reason: "model loading" }) }),
    );
    const semantic = rows.find((r) => r.key === "semantic");
    expect(semantic?.tone).toBe("down");
    expect(semantic?.reason).toBe("model loading");
  });
});

describe("deriveVaultHealthView", () => {
  it("reads an unreachable core as down", () => {
    expect(deriveVaultHealthView(core({ reachable: false }))).toEqual({
      tone: "down",
      word: "Unreachable",
    });
    expect(deriveVaultHealthView(core({ errored: true, reachable: false }))).toEqual({
      tone: "down",
      word: "Unreachable",
    });
  });

  it("reads an in-flight snapshot as checking", () => {
    expect(deriveVaultHealthView(core({ loading: true, reachable: false }))).toEqual({
      tone: "unknown",
      word: "Checking…",
    });
  });

  it("maps a healthy served word to ok and an unhealthy word to attention", () => {
    expect(deriveVaultHealthView(core({ vaultHealth: "healthy" }))).toEqual({
      tone: "ok",
      word: "Healthy",
    });
    expect(deriveVaultHealthView(core({ vaultHealth: "warnings" }))).toEqual({
      tone: "attention",
      word: "Warnings",
    });
  });

  it("states a reachable core with no served word honestly, inventing no verdict", () => {
    expect(deriveVaultHealthView(core())).toEqual({ tone: "ok", word: "Reachable" });
  });
});
