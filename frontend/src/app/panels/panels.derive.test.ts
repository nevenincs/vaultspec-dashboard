// Pure-derive contract for the project-health panel. A wire-free unit test of the
// projection that turns the interpreted core view into an honest panel word — the
// ADR's "render served truth including the degraded and unreachable states". The
// presentational component is thin over it; the live-wire proof lives in the
// online suite.
//
// The system-status console's projection moved out of this file with the rows it
// used to emit: it is now `stores/server/systemPrograms.ts`, tested beside itself.

import { describe, expect, it } from "vitest";

import type { CoreStatusView } from "../../stores/server/queries";
import { deriveVaultHealthView } from "./VaultHealthPanel";

function core(patch: Partial<CoreStatusView> = {}): CoreStatusView {
  return { loading: false, errored: false, reachable: true, ...patch };
}

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
