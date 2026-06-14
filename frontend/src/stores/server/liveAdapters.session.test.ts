// The mock-versus-live PARITY proof for the session/settings surface
// (user-state-persistence W04.P10.S34): a sample CAPTURED from the live
// `vaultspec serve` session/settings routes (the exact `{data, tiers}` shapes
// `conformance.rs` asserts engine-side) is fed through the SAME tolerant adapter
// the app uses, and must reconcile onto the internal shape. Tolerance is proven
// too: a sparse or already-internal (mock) body passes through without throwing.
// This is the mock-mirrors-live-wire-shape deliverable in executable form.

import { describe, expect, it } from "vitest";

import { adaptSession, adaptSettings, unwrapEnvelope } from "./liveAdapters";

const TIERS = {
  declared: { available: true },
  structural: { available: true },
  temporal: { available: true },
  semantic: { available: false, reason: "rag service down" },
};

// --- session parity --------------------------------------------------------------

describe("adaptSession (live session sample)", () => {
  // Captured verbatim from `vaultspec serve` GET /session after a PUT that set a
  // folder + feature_tags and pushed a recent — the exact `{data, tiers}`
  // envelope, snake_case throughout, that conformance.rs asserts.
  const liveSessionEnvelope = {
    data: {
      workspace: "Y:/repo/.git",
      active_scope: "Y:/repo",
      scope_context: {
        folder: "plan",
        feature_tags: ["conf-feature"],
      },
      recents: ["Y:/repo"],
    },
    tiers: TIERS,
  };

  it("unwraps the envelope and reconciles onto the internal session shape", () => {
    // The client's get/put path unwraps the envelope before the adapter runs.
    const session = adaptSession(unwrapEnvelope(liveSessionEnvelope));
    expect(session.workspace).toBe("Y:/repo/.git");
    expect(session.active_scope).toBe("Y:/repo");
    expect(session.scope_context.folder).toBe("plan");
    expect(session.scope_context.feature_tags).toEqual(["conf-feature"]);
    expect(session.recents).toEqual(["Y:/repo"]);
    // Degradation truth rides through on tiers — the chrome never reads it raw.
    expect(session.tiers.semantic.available).toBe(false);
  });

  it("tolerates a fresh-store session: null folder, empty tags + recents", () => {
    // The live GET /session before any PUT (conformance asserts folder is null,
    // feature_tags and recents are empty arrays).
    const fresh = adaptSession(
      unwrapEnvelope({
        data: {
          workspace: "Y:/repo/.git",
          active_scope: "Y:/repo",
          scope_context: { folder: null, feature_tags: [] },
          recents: [],
        },
        tiers: TIERS,
      }),
    );
    expect(fresh.scope_context.folder).toBeNull();
    expect(fresh.scope_context.feature_tags).toEqual([]);
    expect(fresh.recents).toEqual([]);
  });

  it("tolerates a SPARSE body (older/best-effort recreate) without throwing", () => {
    // A corrupt→recreate-empty store, or an older engine, might omit
    // scope_context/recents entirely. The adapter must default to safe empties,
    // never throw — the prototype's corrupt-store-restores-as-empty path.
    const sparse = adaptSession({ active_scope: "Y:/repo", tiers: TIERS });
    expect(sparse.active_scope).toBe("Y:/repo");
    expect(sparse.scope_context).toEqual({ folder: null, feature_tags: [] });
    expect(sparse.recents).toEqual([]);
  });

  it("tolerates a non-object body, returning a fully-defaulted empty session", () => {
    const empty = adaptSession(undefined);
    expect(empty).toEqual({
      workspace: "",
      active_scope: "",
      scope_context: { folder: null, feature_tags: [] },
      recents: [],
      tiers: {},
    });
  });
});

// --- settings parity -------------------------------------------------------------

describe("adaptSettings (live settings sample)", () => {
  // Captured verbatim from `vaultspec serve` GET /settings after a global write
  // and a scoped write — the exact `{data: {global, scoped}, tiers}` shape, with
  // `scoped` keyed by the scope token and sparse-omitting empty scopes.
  const liveSettingsEnvelope = {
    data: {
      global: { theme: "dark" },
      scoped: {
        "Y:/repo": { density: "compact" },
      },
    },
    tiers: TIERS,
  };

  it("unwraps the envelope and reconciles onto the internal settings shape", () => {
    const settings = adaptSettings(unwrapEnvelope(liveSettingsEnvelope));
    expect(settings.global).toEqual({ theme: "dark" });
    expect(settings.scoped["Y:/repo"]).toEqual({ density: "compact" });
    expect(settings.tiers.semantic.available).toBe(false);
  });

  it("tolerates empty global + scoped (before any write)", () => {
    const empty = adaptSettings(
      unwrapEnvelope({ data: { global: {}, scoped: {} }, tiers: TIERS }),
    );
    expect(empty.global).toEqual({});
    expect(empty.scoped).toEqual({});
  });

  it("tolerates a SPARSE body (missing global/scoped) without throwing", () => {
    const sparse = adaptSettings({ tiers: TIERS });
    expect(sparse.global).toEqual({});
    expect(sparse.scoped).toEqual({});
  });

  it("drops non-string values defensively, keeping the map a string→string", () => {
    // An older engine that serialized a non-string value must not corrupt the
    // typed map — the adapter keeps only string values.
    const settings = adaptSettings({
      global: { theme: "dark", broken: 42 },
      scoped: {},
      tiers: TIERS,
    });
    expect(settings.global).toEqual({ theme: "dark" });
  });
});
