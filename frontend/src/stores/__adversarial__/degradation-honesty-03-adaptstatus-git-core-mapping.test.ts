// Adversarial — NowStrip degradation honesty: adaptStatus git + core mapping.
//
// Target: src/stores/server/liveAdapters.ts — adaptStatus.
//
// FINDING (2026-06-13 live capture): the engine was UP and serving
// /status with data.git = {dirty:true, head_ref:"refs/heads/main"} and
// backends.core populated, yet the NowStrip read "git: no repository state"
// and "core: vault unknown". Root causes:
//
//   (a) adaptStatus did NOT read body.git — it was commented "not served by
//       the live status", which was incorrect; the live engine does serve it.
//       gitCard falls back to the "no repository state" branch when status.git
//       is undefined, so the GUI lied about git state with the engine UP.
//
//   (b) adaptStatus extracted `core: { reachable: isRec(backends.core) }` but
//       never forwarded vault_health from backends.core — so coreCard always
//       showed "vault unknown" even when the engine knew the vault health.
//
// Both are GUI-asserts-down-while-backend-is-up violations — the highest-priority
// degradation-honesty class (same class as degradation-honesty-02: absence ≠
// degraded, and presence ≠ green). These guards prevent regression.

import { describe, expect, it } from "vitest";

import { adaptStatus } from "../server/liveAdapters";

/** Minimal live wire body as the engine sends it (after unwrapEnvelope). */
function liveBody(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    index: { nodes: 42, edges: 100 },
    backends: {
      core: { vault_health: "green" },
      rag: { available: false },
    },
    git: { head_ref: "refs/heads/main", dirty: true, ahead: 0, behind: 0 },
    tiers: {},
    ...overrides,
  };
}

describe("adaptStatus: git block mapping (NowStrip honesty)", () => {
  it("maps live git block — status.git must not be undefined when engine serves it", () => {
    const adapted = adaptStatus(liveBody());
    // GUARD: "no repository state" fires when git is undefined — it must not be.
    expect(adapted.git).toBeDefined();
  });

  it("strips refs/heads/ prefix so gitCard renders the short branch name", () => {
    const adapted = adaptStatus(liveBody());
    expect(adapted.git?.branch).toBe("main");
  });

  it("tolerates head_ref without refs/heads/ prefix (non-branch ref or already stripped)", () => {
    const adapted = adaptStatus(
      liveBody({ git: { head_ref: "feature/x", dirty: false } }),
    );
    expect(adapted.git?.branch).toBe("feature/x");
  });

  // The LIVE wire serves `dirty` as a BOOLEAN ("is the tree dirty?"), NOT a
  // per-file list (git-diff-browser review HIGH-1: the engine serves no per-file
  // changed list). adaptStatus preserves the boolean truth so the surface renders
  // clean vs. dirty honestly without fabricating a file list.
  it("dirty:true (boolean) is preserved so the surface shows the dirty state", () => {
    const adapted = adaptStatus(liveBody({ git: { head_ref: "main", dirty: true } }));
    expect(adapted.git?.dirty).toBe(true);
  });

  it("dirty:false is preserved (clean tree)", () => {
    const adapted = adaptStatus(liveBody({ git: { head_ref: "main", dirty: false } }));
    expect(adapted.git?.dirty).toBe(false);
  });

  it("a legacy/internal dirty string[] collapses to the boolean truth (is anything dirty)", () => {
    // Tolerated for back-compat: a non-empty list means dirty, an empty one clean.
    const adapted = adaptStatus(
      liveBody({ git: { head_ref: "main", dirty: ["src/a.ts", "src/b.ts"] } }),
    );
    expect(adapted.git?.dirty).toBe(true);
    const clean = adaptStatus(liveBody({ git: { head_ref: "main", dirty: [] } }));
    expect(clean.git?.dirty).toBe(false);
  });

  it("absent git block leaves git undefined (honest: engine not providing git state)", () => {
    const adapted = adaptStatus({ ok: true, index: {}, backends: {}, tiers: {} });
    expect(adapted.git).toBeUndefined();
  });
});

describe("adaptStatus: core block mapping (NowStrip honesty)", () => {
  it("extracts vault_health from backends.core", () => {
    const adapted = adaptStatus(liveBody());
    // GUARD: without vault_health extraction, coreCard renders "vault unknown".
    expect(adapted.core?.vault_health).toBe("green");
    expect(adapted.core?.reachable).toBe(true);
  });

  it("vault_health:undefined is honest — coreCard will render 'vault unknown'", () => {
    const adapted = adaptStatus(
      liveBody({ backends: { core: {} } }), // core present but no vault_health
    );
    expect(adapted.core?.reachable).toBe(true);
    expect(adapted.core?.vault_health).toBeUndefined();
  });

  it("absent backends.core leaves core undefined (honest: core unreachable)", () => {
    const adapted = adaptStatus({ ok: false, index: {}, backends: {}, tiers: {} });
    expect(adapted.core).toBeUndefined();
  });
});

describe("adaptStatus: pass-through for internal/mock shape", () => {
  it("a body with nodes + degradations is returned unchanged (mock / internal shape)", () => {
    const internal = {
      ok: true,
      nodes: 5,
      edges: 10,
      degradations: [],
      tiers: {},
      git: { branch: "main", ahead: 0, behind: 0, dirty: [] as string[] },
      core: { reachable: true },
      rag: { service: "running" },
    };
    const adapted = adaptStatus(internal);
    expect(adapted).toStrictEqual(internal);
  });
});
