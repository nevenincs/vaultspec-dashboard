// @vitest-environment happy-dom
// Split from queries.test.ts (module-decomposition mandate, 2026-07-12).

import { afterEach, describe, expect, it } from "vitest";
import { liveTransport } from "../../../testing/liveClient";
import {
  EngineError,
  engineClient,
  type EngineStatus,
  type TiersBlock,
} from "../engine";
import { adaptStatus } from "../liveAdapters";
import { deriveCoreStatusView, deriveGitStatusView } from "./index";

afterEach(() => {
  engineClient.useTransport(liveTransport);
});

// ---------------------------------------------------------------------------
// deriveGitStatusView — git working-tree interpretation (git-diff-browser ADR).
// git is NOT a tier: availability tracks the PRESENCE of the git payload; `dirty`
// is the live BOOLEAN; ahead/behind are Option (absent = no upstream).
// ---------------------------------------------------------------------------

function statusWith(
  git: EngineStatus["git"],
  tiers: TiersBlock = { structural: { available: true } },
): EngineStatus {
  return { ok: true, nodes: 0, edges: 0, degradations: [], tiers, git };
}

describe("deriveGitStatusView", () => {
  it("reports available with the git payload and the dirty boolean when git is served", () => {
    const view = deriveGitStatusView(
      statusWith({ branch: "main", ahead: 1, dirty: true }),
      undefined,
      false,
    );
    expect(view).toMatchObject({ loading: false, degraded: false, errored: false });
    expect(view.git?.branch).toBe("main");
    expect(view.dirty).toBe(true);
  });

  it("reports a clean tree when the dirty boolean is false", () => {
    const view = deriveGitStatusView(
      statusWith({ branch: "main", dirty: false }),
      undefined,
      false,
    );
    expect(view.dirty).toBe(false);
    expect(view.degraded).toBe(false);
  });

  it("treats a served response with NO git payload as designed degradation, not error", () => {
    const view = deriveGitStatusView(
      statusWith(undefined, { structural: { available: true } }),
      undefined,
      false,
    );
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
  });

  it("surfaces a tiers-bearing error envelope (backend answered) as degradation", () => {
    const err = new EngineError("/status", 502, {
      tiers: { structural: { available: false } },
    });
    const view = deriveGitStatusView(undefined, err, false);
    expect(view.degraded).toBe(true);
    expect(view.errored).toBe(false);
  });

  it("surfaces a tiers-less transport fault as the errored branch", () => {
    const err = new EngineError("/status", 500);
    const view = deriveGitStatusView(undefined, err, false);
    expect(view.errored).toBe(true);
    expect(view.degraded).toBe(false);
  });

  it("reports loading while the snapshot is in flight with no data or error", () => {
    const view = deriveGitStatusView(undefined, undefined, true);
    expect(view.loading).toBe(true);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
  });
});

describe("deriveCoreStatusView", () => {
  it("reports reachable core with forwarded vault health", () => {
    const view = deriveCoreStatusView(
      {
        ok: true,
        nodes: 0,
        edges: 0,
        degradations: [],
        tiers: {},
        core: { reachable: true, vault_health: "green" },
      },
      undefined,
      false,
    );

    expect(view).toMatchObject({
      loading: false,
      errored: false,
      reachable: true,
      vaultHealth: "green",
    });
  });

  it("reports missing or unreachable core as a designed down state", () => {
    expect(
      deriveCoreStatusView(
        {
          ok: true,
          nodes: 0,
          edges: 0,
          degradations: [],
          tiers: {},
          core: { reachable: false },
        },
        undefined,
        false,
      ),
    ).toMatchObject({ errored: false, reachable: false });

    expect(
      deriveCoreStatusView(
        { ok: true, nodes: 0, edges: 0, degradations: [], tiers: {} },
        undefined,
        false,
      ),
    ).toMatchObject({ errored: false, reachable: false });
  });

  it("keeps tiers-less transport faults distinct from designed down core", () => {
    const view = deriveCoreStatusView(
      undefined,
      new EngineError("/status", 500),
      false,
    );
    expect(view).toMatchObject({
      loading: false,
      errored: true,
      reachable: false,
    });
  });
});

describe("git status live-sample parity through adaptStatus", () => {
  it("derives branch from head_ref, preserves the dirty boolean, and keeps ahead/behind when present", () => {
    // A verbatim live `/status` envelope shape (head_ref, index, backends, and
    // an upstream-configured git block with numeric ahead/behind).
    const liveSample = {
      ok: true,
      index: { nodes: 12, edges: 8 },
      degradations: [],
      tiers: { structural: { available: true } },
      git: { head_ref: "refs/heads/feature/x", dirty: true, ahead: 3, behind: 2 },
      backends: { core: { vault_health: "green" }, rag: { available: true } },
    };
    const status = adaptStatus(liveSample);
    const view = deriveGitStatusView(status, undefined, false);
    expect(view.degraded).toBe(false);
    expect(view.errored).toBe(false);
    // head_ref → branch (refs/heads/ stripped).
    expect(view.git?.branch).toBe("feature/x");
    expect(view.dirty).toBe(true);
    expect(view.git?.ahead).toBe(3);
    expect(view.git?.behind).toBe(2);
  });

  it("preserves undefined ahead/behind (no upstream) rather than coercing to zero", () => {
    // Live shape with NO upstream → ahead/behind absent from the git block.
    const liveSample = {
      ok: true,
      index: { nodes: 0, edges: 0 },
      degradations: [],
      tiers: { structural: { available: true } },
      git: { head_ref: "refs/heads/main", dirty: false },
      backends: {},
    };
    const status = adaptStatus(liveSample);
    expect(status.git?.ahead).toBeUndefined();
    expect(status.git?.behind).toBeUndefined();
    const view = deriveGitStatusView(status, undefined, false);
    expect(view.git?.ahead).toBeUndefined();
    expect(view.git?.behind).toBeUndefined();
    expect(view.dirty).toBe(false);
  });

  it("collapses a legacy/internal dirty string[] to the boolean truth", () => {
    // Tolerated legacy shape: a dirty list collapses to "is anything dirty".
    const liveSample = {
      ok: true,
      index: {},
      degradations: [],
      tiers: {},
      git: { head_ref: "refs/heads/main", dirty: ["a.ts", "b.ts"] },
    };
    const status = adaptStatus(liveSample);
    expect(status.git?.dirty).toBe(true);
  });
});
